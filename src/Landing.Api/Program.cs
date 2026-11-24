using Landing.Api.Data;
using Landing.Api.Endpoints;
using Landing.Api.Services;
using Microsoft.EntityFrameworkCore;

// One image, three entry points:
//   (none)       run the site; connects as the limited app role (ConnectionStrings:App)
//   migrate      apply EF Core migrations as the migrator role (ConnectionStrings:Migrator), then exit
//   healthcheck  probe /health on the local port and exit 0/1 (the runtime image has no curl)
var mode = args.FirstOrDefault();

if (mode == "healthcheck")
{
    return await HealthProbe.RunAsync();
}

if (mode == "migrate")
{
    return await Migrator.RunAsync(args);
}

var builder = WebApplication.CreateBuilder(args);

var appConnection = builder.Configuration.GetConnectionString("App")
    ?? throw new InvalidOperationException("ConnectionStrings:App is not set.");

builder.Services.AddDbContext<LandingDb>(o => o.UseNpgsql(appConnection));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<CheckerState>();
builder.Services.AddLandingHttpClients();
builder.Services.AddSingleton<SiteInspector>();
builder.Services.AddSingleton<LinkProbe>();
builder.Services.AddHostedService<StatusChecker>();
builder.Services.AddHostedService<DeletedPurger>();
builder.Services.Configure<StatusCheckerOptions>(builder.Configuration.GetSection("StatusChecker"));
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)));
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseSecurityHeaders();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", async (LandingDb db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ok" }) : Results.Problem("database unreachable", statusCode: 503));

app.MapBoardEndpoints();
app.MapFallbackToFile("index.html");

await app.RunAsync();
return 0;

/// <summary>Exposed so the integration tests can host the app.</summary>
public partial class Program;
