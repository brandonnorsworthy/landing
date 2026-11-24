using System.Diagnostics;
using System.Net.Sockets;
using Landing.Api.Data;
using Landing.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Landing.Api.Services;

public sealed class StatusCheckerOptions
{
    public int IntervalSeconds { get; set; } = 60;
    public int SlowMs { get; set; } = 2000;
    public int TimeoutMs { get; set; } = 5000;
    public int Concurrency { get; set; } = 8;
}

public readonly record struct ProbeResult(LinkStatus Status, string? Detail, int? ResponseMs);

/// <summary>
/// One reachability check. Up: any HTTP answer below 500 within SlowMs (401/403 mean the app is alive
/// behind its own login). Warning: slower than SlowMs, or a 5xx. Down: no answer within TimeoutMs.
/// </summary>
public sealed class LinkProbe(IHttpClientFactory httpFactory, IOptions<StatusCheckerOptions> options)
{
    public async Task<ProbeResult> ProbeAsync(string url, CancellationToken ct)
    {
        var o = options.Value;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(o.TimeoutMs);
        var http = httpFactory.CreateClient(HttpClientSetup.Probe);
        var sw = Stopwatch.StartNew();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            var ms = (int)sw.ElapsedMilliseconds;
            var code = (int)response.StatusCode;
            if (code >= 500)
            {
                return new ProbeResult(LinkStatus.Warning, $"HTTP {code}", ms);
            }

            return ms > o.SlowMs
                ? new ProbeResult(LinkStatus.Warning, $"slow: {ms / 1000.0:0.0}s", ms)
                : new ProbeResult(LinkStatus.Up, null, ms);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return new ProbeResult(LinkStatus.Down, "timed out", null);
        }
        catch (HttpRequestException ex)
        {
            return new ProbeResult(LinkStatus.Down, Describe(ex), null);
        }
    }

    private static string Describe(HttpRequestException ex) => ex.InnerException switch
    {
        SocketException { SocketErrorCode: SocketError.ConnectionRefused } => "connection refused",
        SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.TryAgain } => "name not found",
        SocketException { SocketErrorCode: SocketError.HostUnreachable or SocketError.NetworkUnreachable } => "host unreachable",
        System.Security.Authentication.AuthenticationException => "TLS handshake failed",
        _ => "no response",
    };
}

/// <summary>Checks every non-external bookmark on a fixed interval and records the result.</summary>
public sealed class StatusChecker(
    IServiceScopeFactory scopes,
    LinkProbe probe,
    CheckerState state,
    TimeProvider clock,
    IOptions<StatusCheckerOptions> options,
    ILogger<StatusChecker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Max(5, options.Value.IntervalSeconds)), clock);
        do
        {
            try
            {
                await RunPassAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Status check pass failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task RunPassAsync(CancellationToken ct)
    {
        List<(int Id, string Url, LinkStatus Status)> targets;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LandingDb>();
            targets = (await db.VisibleBookmarks
                    .Where(b => b.Group!.Kind == GroupKind.Normal)
                    .Select(b => new { b.Id, b.Url, b.Status })
                    .ToListAsync(ct))
                .Select(b => (b.Id, b.Url, b.Status))
                .ToList();
        }

        var results = new System.Collections.Concurrent.ConcurrentBag<(int Id, LinkStatus Old, ProbeResult Result)>();
        await Parallel.ForEachAsync(
            targets,
            new ParallelOptions { MaxDegreeOfParallelism = Math.Max(1, options.Value.Concurrency), CancellationToken = ct },
            async (t, token) => results.Add((t.Id, t.Status, await probe.ProbeAsync(t.Url, token))));

        var now = clock.GetUtcNow();
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LandingDb>();
            foreach (var (id, old, r) in results)
            {
                if (r.Status == old)
                {
                    await db.Bookmarks.Where(b => b.Id == id).ExecuteUpdateAsync(s => s
                        .SetProperty(b => b.StatusDetail, r.Detail)
                        .SetProperty(b => b.ResponseMs, r.ResponseMs)
                        .SetProperty(b => b.LastCheckedAt, now), ct);
                }
                else
                {
                    await db.Bookmarks.Where(b => b.Id == id).ExecuteUpdateAsync(s => s
                        .SetProperty(b => b.Status, r.Status)
                        .SetProperty(b => b.StatusDetail, r.Detail)
                        .SetProperty(b => b.ResponseMs, r.ResponseMs)
                        .SetProperty(b => b.LastCheckedAt, now)
                        .SetProperty(b => b.StatusSince, now), ct);
                }
            }
        }

        state.MarkRun(now);
    }
}

/// <summary>Hard-deletes bookmarks that were soft-deleted more than a day ago (undo window long passed).</summary>
public sealed class DeletedPurger(IServiceScopeFactory scopes, TimeProvider clock, ILogger<DeletedPurger> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LandingDb>();
                var cutoff = clock.GetUtcNow().AddDays(-1);
                var n = await db.Bookmarks.Where(b => b.DeletedAt != null && b.DeletedAt < cutoff).ExecuteDeleteAsync(stoppingToken);
                if (n > 0)
                {
                    log.LogInformation("Purged {Count} deleted bookmark(s)", n);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Purge failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
