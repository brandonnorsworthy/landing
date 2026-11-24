using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Landing.Api.Data;

/// <summary>The one-shot migration step. Runs as landing_migrator, never as the app role.</summary>
public static class Migrator
{
    public static async Task<int> RunAsync(string[] args)
    {
        var config = new ConfigurationBuilder()
            .AddEnvironmentVariables()
            .AddCommandLine(args.Skip(1).ToArray())
            .Build();

        var connection = config.GetConnectionString("Migrator");
        if (string.IsNullOrWhiteSpace(connection))
        {
            await Console.Error.WriteLineAsync("ConnectionStrings__Migrator is not set.");
            return 2;
        }

        var options = new DbContextOptionsBuilder<LandingDb>().UseNpgsql(Connections.Harden(connection)).Options;
        await using var db = new LandingDb(options);
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        await db.Database.MigrateAsync();
        Console.WriteLine(pending.Count == 0
            ? "landing: schema up to date"
            : $"landing: applied {pending.Count} migration(s): {string.Join(", ", pending)}");
        return 0;
    }
}

public static class Connections
{
    /// <summary>
    /// No Kerberos/GSS negotiation (the image doesn't ship it, and these roles use passwords),
    /// and a name in pg_stat_activity so connections are easy to tell apart.
    /// </summary>
    public static string Harden(string connection) => new Npgsql.NpgsqlConnectionStringBuilder(connection)
    {
        GssEncryptionMode = Npgsql.GssEncryptionMode.Disable,
        ApplicationName = "landing",
    }.ConnectionString;
}

/// <summary>Lets `dotnet ef migrations add` build the model without a database.</summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<LandingDb>
{
    public LandingDb CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<LandingDb>().UseNpgsql("Host=design-time").Options);
}
