using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Landing.Api.Domain;
using Landing.Api.Endpoints;

namespace Landing.Tests;

public sealed class BoardApiTests(DatabaseFixture db) : IClassFixture<DatabaseFixture>, IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private LandingFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync()
    {
        _factory = new LandingFactory(db);
        _http = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _http.Dispose();
        await _factory.DisposeAsync();
    }

    private async Task<BoardDto> BoardAsync() => (await _http.GetFromJsonAsync<BoardDto>("/api/board", Json))!;

    private async Task<int> CreateAsync(string name, string url, int? groupId = null, string? newGroup = null, bool favorite = false)
    {
        var res = await _http.PostAsJsonAsync("/api/bookmarks",
            new BookmarkInput(name, url, groupId, newGroup, IconKind.Initials, "teal", favorite, false, false), Json);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    [Fact]
    public async Task Bookmark_lifecycle_create_edit_move_reorder_delete_restore()
    {
        var arcane = await CreateAsync("Arcane", "http://192.168.5.100:10000", newGroup: "infrastructure", favorite: true);
        var board = await BoardAsync();
        var infra = Assert.Single(board.Groups, g => g.Name == "infrastructure");
        var spokes = await CreateAsync("Spokes", "http://192.168.5.100:10050", groupId: infra.Id);
        var home = await CreateAsync("Digital Hearth", "http://192.168.5.100:3021", newGroup: "home projects");

        // Edit: rename, flag private + temporary.
        var put = await _http.PutAsJsonAsync($"/api/bookmarks/{spokes}",
            new BookmarkInput("Spokes MCP", "http://192.168.5.100:10050/", infra.Id, null, IconKind.Initials, "moss", false, true, true), Json);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        // Reorder within the group: Spokes to the front.
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PostAsJsonAsync($"/api/bookmarks/{spokes}/move", new MoveInput(infra.Id, 0), Json)).StatusCode);
        board = await BoardAsync();
        infra = board.Groups.Single(g => g.Name == "infrastructure");
        Assert.Equal([spokes, arcane], infra.Bookmarks.Select(b => b.Id));
        var edited = infra.Bookmarks[0];
        Assert.Equal("Spokes MCP", edited.Name);
        Assert.True(edited.IsPrivate);
        Assert.True(edited.IsTemporary);
        Assert.Equal("moss", edited.IconColor);
        Assert.Equal(LinkStatus.Unknown, edited.Status);

        // Move across groups to index 1.
        var homeGroup = board.Groups.Single(g => g.Name == "home projects");
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PostAsJsonAsync($"/api/bookmarks/{arcane}/move", new MoveInput(homeGroup.Id, 5), Json)).StatusCode);
        board = await BoardAsync();
        Assert.Equal([spokes], board.Groups.Single(g => g.Name == "infrastructure").Bookmarks.Select(b => b.Id));
        Assert.Equal([home, arcane], board.Groups.Single(g => g.Name == "home projects").Bookmarks.Select(b => b.Id));

        // Delete hides it; the group can't be deleted while it has bookmarks; restore brings it back.
        Assert.Equal(HttpStatusCode.NoContent, (await _http.DeleteAsync($"/api/bookmarks/{home}")).StatusCode);
        Assert.DoesNotContain((await BoardAsync()).Groups.SelectMany(g => g.Bookmarks), b => b.Id == home);
        Assert.Equal(HttpStatusCode.Conflict, (await _http.DeleteAsync($"/api/groups/{homeGroup.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PostAsync($"/api/bookmarks/{home}/restore", null)).StatusCode);
        Assert.Contains((await BoardAsync()).Groups.SelectMany(g => g.Bookmarks), b => b.Id == home);
    }

    [Fact]
    public async Task Survives_a_restart()
    {
        var id = await CreateAsync("Plex", "http://192.168.5.100:32400/web", newGroup: "media");
        await using var second = new LandingFactory(db);
        using var http = second.CreateClient();
        var board = (await http.GetFromJsonAsync<BoardDto>("/api/board", Json))!;
        Assert.Contains(board.Groups.SelectMany(g => g.Bookmarks), b => b.Id == id && b.Name == "Plex");
    }

    [Theory]
    [InlineData("192.168.5.100 3080", "url")]
    [InlineData("javascript:alert(1)", "url")]
    [InlineData("ftp://files.local/", "url")]
    [InlineData("http://user:pass@192.168.5.1/", "url")]
    [InlineData("", "url")]
    public async Task Rejects_bad_urls(string url, string field)
    {
        var res = await _http.PostAsJsonAsync("/api/bookmarks",
            new BookmarkInput("x", url, null, "g", IconKind.Initials, "teal", false, false, false), Json);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Rejects_missing_name_unknown_color_and_missing_group()
    {
        var res = await _http.PostAsJsonAsync("/api/bookmarks",
            new BookmarkInput("  ", "http://192.168.5.100", null, null, IconKind.Initials, "neon", false, false, false), Json);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var errors = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("name", out _));
        Assert.True(errors.TryGetProperty("iconColor", out _));
        Assert.True(errors.TryGetProperty("groupId", out _));
    }

    [Fact]
    public async Task Long_url_suggestion_for_space_typo()
    {
        var res = await _http.PostAsJsonAsync("/api/bookmarks",
            new BookmarkInput("x", "192.168.5.100 3080", null, "g", IconKind.Initials, "teal", false, false, false), Json);
        var msg = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").GetProperty("url")[0].GetString();
        Assert.Contains("http://192.168.5.100:3080", msg, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Preview_reads_title_favicon_and_flags_duplicates()
    {
        await using var site = await FakeSite.StartAsync();
        await CreateAsync("Existing", site.BaseUrl + "/page", newGroup: "dupes");
        var res = await _http.PostAsJsonAsync("/api/preview", new PreviewInput(site.BaseUrl + "/page/"), Json);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var preview = (await res.Content.ReadFromJsonAsync<PreviewDto>(Json))!;
        Assert.Equal("Test & Site", preview.Title);
        Assert.StartsWith("data:image/png;base64,", preview.FaviconDataUrl, StringComparison.Ordinal);
        Assert.Contains(preview.Duplicates, d => d.Name == "Existing" && d.GroupName == "dupes");
    }

    [Fact]
    public async Task Svg_favicons_are_refused_and_saved_favicons_are_served_sandboxed()
    {
        await using var site = await FakeSite.StartAsync();
        var svg = (await (await _http.PostAsJsonAsync("/api/preview", new PreviewInput(site.BaseUrl + "/svgpage"), Json))
            .Content.ReadFromJsonAsync<PreviewDto>(Json))!;
        Assert.Null(svg.FaviconDataUrl);

        var res = await _http.PostAsJsonAsync("/api/bookmarks",
            new BookmarkInput("Icon", site.BaseUrl + "/page", null, "icons", IconKind.Favicon, "teal", false, false, false), Json);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var bm = (await BoardAsync()).Groups.Single(g => g.Name == "icons").Bookmarks.Single();
        Assert.Equal(IconKind.Favicon, bm.IconKind);
        var icon = await _http.GetAsync(bm.IconUrl);
        Assert.Equal("image/png", icon.Content.Headers.ContentType?.MediaType);
        Assert.Contains("sandbox", icon.Headers.GetValues("Content-Security-Policy").Single(), StringComparison.Ordinal);
        Assert.Equal(FakeSite.PngBytes, await icon.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Pages_carry_security_headers_and_health_reports_ok()
    {
        var res = await _http.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("default-src 'self'", res.Headers.GetValues("Content-Security-Policy").Single(), StringComparison.Ordinal);
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task Groups_create_rename_reorder_delete()
    {
        var a = (await (await _http.PostAsJsonAsync("/api/groups", new GroupInput("alpha", GroupKind.Normal, "amber"), Json)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var b = (await (await _http.PostAsJsonAsync("/api/groups", new GroupInput("external links", GroupKind.External, "plum"), Json)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.PostAsJsonAsync("/api/groups", new GroupInput("alpha", null, "amber"), Json)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PutAsJsonAsync($"/api/groups/{a}", new GroupInput("alpha two", null, "moss"), Json)).StatusCode);

        var ids = (await BoardAsync()).Groups.Select(g => g.Id).ToList();
        ids.Remove(b);
        ids.Insert(0, b);
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PostAsJsonAsync("/api/groups/reorder", new ReorderInput(ids), Json)).StatusCode);
        var board = await BoardAsync();
        Assert.Equal(b, board.Groups[0].Id);
        Assert.Equal(GroupKind.External, board.Groups[0].Kind);
        Assert.Contains(board.Groups, g => g.Name == "alpha two" && g.Color == "moss");
        Assert.Equal(HttpStatusCode.NoContent, (await _http.DeleteAsync($"/api/groups/{a}")).StatusCode);
    }
}
