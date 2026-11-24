using Landing.Api.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Landing.Tests;

/// <summary>
/// A throwaway database per test class on a real Postgres, migrated with the real migrations.
/// LANDING_TEST_ADMIN must be a connection string for a role that can create databases
/// (CI: the Postgres service container; dev: the local stacks/postgres container).
/// </summary>
public sealed class DatabaseFixture : IAsyncLifetime
{
    private readonly string _admin = Environment.GetEnvironmentVariable("LANDING_TEST_ADMIN")
        ?? "Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres;Database=postgres";

    public string DatabaseName { get; } = "landing_test_" + Guid.NewGuid().ToString("N")[..12];

    public string ConnectionString => new NpgsqlConnectionStringBuilder(_admin) { Database = DatabaseName }.ConnectionString;

    public async Task InitializeAsync()
    {
        await using (var conn = new NpgsqlConnection(_admin))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{DatabaseName}\"", conn);
            await cmd.ExecuteNonQueryAsync();
        }

        await using var db = new LandingDb(new DbContextOptionsBuilder<LandingDb>().UseNpgsql(ConnectionString).Options);
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection(_admin);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{DatabaseName}\" WITH (FORCE)", conn);
        await cmd.ExecuteNonQueryAsync();
    }
}

public sealed class LandingFactory(DatabaseFixture db) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:App", db.ConnectionString);
        builder.UseSetting("StatusChecker:IntervalSeconds", "3600");
        builder.UseEnvironment("Testing");
    }
}

/// <summary>A tiny real HTTP server on a random local port, for probe and favicon tests.</summary>
public sealed class FakeSite : IAsyncDisposable
{
    private readonly WebApplication _app;

    public static readonly byte[] PngBytes =
    [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
    ];

    private FakeSite(WebApplication app) => _app = app;

    public string BaseUrl { get; private set; } = "";

    public static async Task<FakeSite> StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        app.MapGet("/ok", () => "fine");
        app.MapGet("/auth", () => Results.StatusCode(401));
        app.MapGet("/boom", () => Results.StatusCode(503));
        app.MapGet("/slow", async () =>
        {
            await Task.Delay(700);
            return "late";
        });
        app.MapGet("/hang", async (CancellationToken ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return "never";
        });
        app.MapGet("/page", () => Results.Content(
            "<html><head><title> Test &amp; Site </title><link rel=\"icon\" href=\"/img/icon.png\"></head><body>hi</body></html>",
            "text/html"));
        app.MapGet("/img/icon.png", () => Results.Bytes(PngBytes, "image/png"));
        app.MapGet("/svgpage", () => Results.Content(
            "<html><head><title>Svg</title><link rel=\"icon\" href=\"/i.svg\"></head></html>", "text/html"));
        app.MapGet("/i.svg", () => Results.Content("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml"));
        await app.StartAsync();
        var site = new FakeSite(app) { BaseUrl = app.Urls.First() };
        return site;
    }

    public async ValueTask DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
