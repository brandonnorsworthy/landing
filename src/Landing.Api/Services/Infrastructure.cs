using System.Net;

namespace Landing.Api.Services;

public static class HealthProbe
{
    /// <summary>Container health check: GET /health on the port Kestrel listens on.</summary>
    public static async Task<int> RunAsync()
    {
        var port = Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS")?.Split(';', ',')[0] ?? "8080";
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        try
        {
            using var response = await http.GetAsync(new Uri($"http://127.0.0.1:{port}/health"));
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (HttpRequestException)
        {
            return 1;
        }
        catch (TaskCanceledException)
        {
            return 1;
        }
    }
}

public static class HttpClientSetup
{
    public const string Probe = "probe";
    public const string Inspector = "inspector";

    public static IServiceCollection AddLandingHttpClients(this IServiceCollection services)
    {
        // Reachability checks only: LAN apps often use self-signed certs, and a cert problem
        // shouldn't make a running app look down. Nothing read from these responses is trusted.
        services.AddHttpClient(Probe, c => c.Timeout = Timeout.InfiniteTimeSpan)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                SslOptions = { RemoteCertificateValidationCallback = static (_, _, _, _) => true },
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            });

        // Title and favicon lookup when a bookmark is saved. Same cert leniency, a few redirects.
        services.AddHttpClient(Inspector, c =>
            {
                c.Timeout = Timeout.InfiniteTimeSpan;
                c.DefaultRequestHeaders.UserAgent.ParseAdd("landing/1.0");
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = true,
                MaxAutomaticRedirections = 3,
                AutomaticDecompression = DecompressionMethods.All,
                SslOptions = { RemoteCertificateValidationCallback = static (_, _, _, _) => true },
            });
        return services;
    }
}

public static class SecurityHeaders
{
    /// <summary>Strict defaults for a same-origin SPA: no third-party scripts, styles, fonts or frames.</summary>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var h = context.Response.Headers;
            h["Content-Security-Policy"] =
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
                "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
            h["X-Content-Type-Options"] = "nosniff";
            h["Referrer-Policy"] = "no-referrer";
            h["X-Frame-Options"] = "DENY";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            await next();
        });
}

/// <summary>When the status checker last finished a pass, so the UI can say "checks paused".</summary>
public sealed class CheckerState
{
    private long _lastRunTicks;

    public DateTimeOffset? LastRunAt
    {
        get
        {
            var t = Interlocked.Read(ref _lastRunTicks);
            return t == 0 ? null : new DateTimeOffset(t, TimeSpan.Zero);
        }
    }

    public void MarkRun(DateTimeOffset at) => Interlocked.Exchange(ref _lastRunTicks, at.UtcTicks);
}
