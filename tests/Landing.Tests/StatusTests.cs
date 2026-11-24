using System.Net;
using System.Net.Sockets;
using Landing.Api.Domain;
using Landing.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Landing.Tests;

public sealed class ProbeTests : IAsyncLifetime
{
    private FakeSite _site = null!;
    private LinkProbe _probe = null!;
    private ServiceProvider _services = null!;

    public async Task InitializeAsync()
    {
        _site = await FakeSite.StartAsync();
        _services = new ServiceCollection().AddLandingHttpClients().BuildServiceProvider();
        _probe = new LinkProbe(
            _services.GetRequiredService<IHttpClientFactory>(),
            Options.Create(new StatusCheckerOptions { SlowMs = 400, TimeoutMs = 1500 }));
    }

    public async Task DisposeAsync()
    {
        await _site.DisposeAsync();
        await _services.DisposeAsync();
    }

    [Theory]
    [InlineData("/ok", LinkStatus.Up, null)]
    [InlineData("/auth", LinkStatus.Up, null)]
    [InlineData("/boom", LinkStatus.Warning, "HTTP 503")]
    [InlineData("/slow", LinkStatus.Warning, "slow:")]
    [InlineData("/hang", LinkStatus.Down, "timed out")]
    public async Task Classifies(string path, LinkStatus expected, string? detail)
    {
        var r = await _probe.ProbeAsync(_site.BaseUrl + path, CancellationToken.None);
        Assert.Equal(expected, r.Status);
        if (detail is null)
        {
            Assert.Null(r.Detail);
        }
        else
        {
            Assert.StartsWith(detail, r.Detail, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Closed_port_is_down_with_reason()
    {
        using var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        var r = await _probe.ProbeAsync($"http://127.0.0.1:{port}/", CancellationToken.None);
        Assert.Equal(LinkStatus.Down, r.Status);
        Assert.Equal("connection refused", r.Detail);
    }
}

public sealed class InspectorParsingTests
{
    [Fact]
    public void Prefers_apple_touch_icon_then_icon_and_resolves_relative()
    {
        var html = "<link rel='stylesheet' href='/a.css'><link rel=\"shortcut icon\" href=\"/fav.ico\"><link rel=\"apple-touch-icon\" href=\"touch.png\">";
        var links = SiteInspector.ExtractIconLinks(html, new Uri("http://192.168.5.100:3000/app/")).ToList();
        Assert.Equal(["http://192.168.5.100:3000/app/touch.png", "http://192.168.5.100:3000/fav.ico"], links.Select(u => u.ToString()));
    }

    [Fact]
    public void Ignores_non_http_icon_links()
    {
        var links = SiteInspector.ExtractIconLinks("<link rel=icon href=\"javascript:alert(1)\"><link rel=\"icon\" href=\"data:image/png;base64,AAAA\">", new Uri("http://x/"));
        Assert.Empty(links);
    }

    [Fact]
    public void Sniffs_raster_only()
    {
        Assert.Equal("image/png", SiteInspector.SniffImageType(FakeSite.PngBytes));
        Assert.Null(SiteInspector.SniffImageType("<svg xmlns='http://www.w3.org/2000/svg'></svg>"u8));
        Assert.Null(SiteInspector.SniffImageType("<html><body>not an icon</body></html>"u8));
    }

    [Fact]
    public void Title_is_decoded_trimmed_and_capped()
    {
        Assert.Equal("A & B", SiteInspector.ExtractTitle("<title>\n  A &amp;\n B </title>"));
        Assert.Equal(80, SiteInspector.ExtractTitle("<title>" + new string('x', 200) + "</title>")!.Length);
        Assert.Null(SiteInspector.ExtractTitle("<p>none</p>"));
    }
}

/// <summary>
/// The runtime role really is limited. Needs LANDING_TEST_APP: a landing_app connection to a
/// bootstrapped and migrated landing_db (CI runs db/bootstrap.sql first; locally it comes from .env).
/// </summary>
public sealed class AppRoleTests
{
    private static readonly string? AppConnection = Environment.GetEnvironmentVariable("LANDING_TEST_APP");

    [Fact]
    public async Task App_role_can_use_data_but_not_change_schema()
    {
        if (string.IsNullOrEmpty(AppConnection))
        {
            Assert.Fail("LANDING_TEST_APP is not set; this check must run (see README > Development).");
        }

        await using var conn = new NpgsqlConnection(AppConnection);
        await conn.OpenAsync();

        await Exec(conn, "SELECT count(*) FROM bookmarks");
        await Exec(conn, "BEGIN; INSERT INTO groups(name, kind, color, sort_order, created_at) VALUES ('role-test', 'Normal', 'teal', 0, now()); ROLLBACK;");

        foreach (var ddl in new[]
                 {
                     "CREATE TABLE evil(x int)",
                     "DROP TABLE bookmarks",
                     "ALTER TABLE groups ADD COLUMN x int",
                     "TRUNCATE bookmarks",
                     "CREATE ROLE sneaky",
                     "CREATE DATABASE sneaky",
                 })
        {
            var ex = await Assert.ThrowsAsync<PostgresException>(() => Exec(conn, ddl));
            Assert.Contains(ex.SqlState, new[] { "42501", "42P01" });
        }
    }

    private static async Task Exec(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
