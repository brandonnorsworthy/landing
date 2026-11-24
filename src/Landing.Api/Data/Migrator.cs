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

        var options = new DbContextOptionsBuilder<LandingDb>().UseNpgsql(connection).Options;
        await using var db = new LandingDb(options);
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        await db.Database.MigrateAsync();
        Console.WriteLine(pending.Count == 0
            ? "landing: schema up to date"
            : $"landing: applied {pending.Count} migration(s): {string.Join(", ", pending)}");
        return 0;
    }
}

/// <summary>Lets `dotnet ef migrations add` build the model without a database.</summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<LandingDb>
{
    public LandingDb CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<LandingDb>().UseNpgsql("Host=design-time").Options);
}
