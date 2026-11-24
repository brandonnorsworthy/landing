using Landing.Api.Data;
using Landing.Api.Domain;
using Landing.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Landing.Api.Endpoints;

/// <summary>
/// The board API. Phase 0 has no login: it is served to the LAN only (nginx), and every read goes
/// through <see cref="LandingDb.VisibleBookmarks"/> so Phase 1 can hide private tiles in one place.
/// </summary>
public static class BoardEndpoints
{
    /// <summary>The product version (Directory.Build.props), without the +commit suffix.</summary>
    public static readonly string AppVersion =
        (typeof(BoardEndpoints).Assembly
            .GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>()
            .FirstOrDefault()?.InformationalVersion ?? "0.0.0").Split('+')[0];

    public static void MapBoardEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/board", GetBoard);
        api.MapPost("/preview", Preview);

        api.MapPost("/groups", CreateGroup);
        api.MapPut("/groups/{id:int}", UpdateGroup);
        api.MapDelete("/groups/{id:int}", DeleteGroup);
        api.MapPost("/groups/reorder", ReorderGroups);

        api.MapPost("/bookmarks", CreateBookmark);
        api.MapPut("/bookmarks/{id:int}", UpdateBookmark);
        api.MapDelete("/bookmarks/{id:int}", DeleteBookmark);
        api.MapPost("/bookmarks/{id:int}/restore", RestoreBookmark);
        api.MapPost("/bookmarks/{id:int}/move", MoveBookmark);
        api.MapGet("/bookmarks/{id:int}/icon", GetIcon);
    }

    private static async Task<BoardDto> LoadBoardAsync(LandingDb db, CheckerState checker, StatusCheckerOptions opts, CancellationToken ct)
    {
        var groups = await db.Groups.AsNoTracking().OrderBy(g => g.SortOrder).ThenBy(g => g.Id).ToListAsync(ct);
        var bookmarks = await db.VisibleBookmarks.AsNoTracking()
            .OrderBy(b => b.SortOrder).ThenBy(b => b.Id)
            .Select(b => new
            {
                b.Id,
                b.GroupId,
                b.Name,
                b.Url,
                b.IconKind,
                b.IconColor,
                HasIcon = b.Favicon != null,
                b.UpdatedAt,
                b.IsFavorite,
                b.IsTemporary,
                b.IsPrivate,
                b.SortOrder,
                b.Status,
                b.StatusDetail,
                b.ResponseMs,
                b.LastCheckedAt,
                b.StatusSince,
            })
            .ToListAsync(ct);

        var byGroup = bookmarks.ToLookup(b => b.GroupId);
        return new BoardDto(
            groups.Select(g => new GroupDto(g.Id, g.Name, g.Kind, g.Color, g.SortOrder,
                byGroup[g.Id].Select(b => new BookmarkDto(
                    b.Id, b.GroupId, b.Name, b.Url, b.IconKind, b.IconColor,
                    b.HasIcon ? $"/api/bookmarks/{b.Id}/icon?v={b.UpdatedAt.ToUnixTimeMilliseconds()}" : null,
                    b.IsFavorite, b.IsTemporary, b.IsPrivate, b.SortOrder,
                    b.Status, b.StatusDetail, b.ResponseMs, b.LastCheckedAt, b.StatusSince)).ToList())).ToList(),
            new CheckerDto(checker.LastRunAt, opts.IntervalSeconds),
            AppVersion);
    }

    private static async Task<IResult> GetBoard(LandingDb db, CheckerState checker, IOptions<StatusCheckerOptions> opts, CancellationToken ct) =>
        Results.Ok(await LoadBoardAsync(db, checker, opts.Value, ct));

    // ── preview (form autofill) ────────────────────────────────────────

    private static async Task<IResult> Preview(PreviewInput input, LandingDb db, SiteInspector inspector, CancellationToken ct)
    {
        var errors = new Errors();
        var url = Errors.CleanUrl(input.Url, errors);
        if (url is null)
        {
            return errors.ToResult();
        }

        var duplicates = await FindDuplicatesAsync(db, url, null, ct);
        var info = await inspector.InspectAsync(url, ct);
        var dataUrl = info.Favicon is null ? null : $"data:{info.Favicon.ContentType};base64,{Convert.ToBase64String(info.Favicon.Bytes)}";
        return Results.Ok(new PreviewDto(info.Title, dataUrl, duplicates));
    }

    private static async Task<List<DuplicateDto>> FindDuplicatesAsync(LandingDb db, Uri url, int? exceptId, CancellationToken ct)
    {
        var key = NormalizeForCompare(url);
        var host = url.Host;
        var sameHost = await db.VisibleBookmarks.AsNoTracking()
            .Where(b => b.Id != exceptId && EF.Functions.ILike(b.Url, "%" + host + "%"))
            .Select(b => new { b.Id, b.Name, b.Url, GroupName = b.Group!.Name })
            .ToListAsync(ct);
        return sameHost
            .Where(b => Uri.TryCreate(b.Url, UriKind.Absolute, out var u) && NormalizeForCompare(u) == key)
            .Select(b => new DuplicateDto(b.Id, b.Name, b.GroupName))
            .ToList();
    }

    private static string NormalizeForCompare(Uri u) =>
        $"{u.Scheme}://{u.IdnHost}:{u.Port}{u.AbsolutePath.TrimEnd('/')}{u.Query}".ToLowerInvariant();

    // ── groups ─────────────────────────────────────────────────────────

    private static async Task<IResult> CreateGroup(GroupInput input, LandingDb db, TimeProvider clock, CancellationToken ct)
    {
        var errors = new Errors();
        var name = Errors.CleanName(input.Name, Limits.GroupName, "name", errors, "Give the group a name.");
        var color = Errors.CleanColor(input.Color ?? "terra", errors, "color");
        if (name is not null && await db.Groups.AnyAsync(g => g.Name == name, ct))
        {
            errors.Add("name", "There's already a group with that name.");
        }

        if (errors.Any)
        {
            return errors.ToResult();
        }

        var group = await AddGroupAsync(db, name!, input.Kind ?? GroupKind.Normal, color, clock, ct);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/groups/{group.Id}", new { group.Id });
    }

    private static async Task<Group> AddGroupAsync(LandingDb db, string name, GroupKind kind, string color, TimeProvider clock, CancellationToken ct)
    {
        var next = (await db.Groups.MaxAsync(g => (int?)g.SortOrder, ct) ?? -1) + 1;
        var group = new Group { Name = name, Kind = kind, Color = color, SortOrder = next, CreatedAt = clock.GetUtcNow() };
        db.Groups.Add(group);
        return group;
    }

    private static async Task<IResult> UpdateGroup(int id, GroupInput input, LandingDb db, CancellationToken ct)
    {
        var group = await db.Groups.FindAsync([id], ct);
        if (group is null)
        {
            return Results.NotFound();
        }

        var errors = new Errors();
        var name = Errors.CleanName(input.Name, Limits.GroupName, "name", errors, "Give the group a name.");
        var color = Errors.CleanColor(input.Color ?? group.Color, errors, "color");
        if (name is not null && await db.Groups.AnyAsync(g => g.Name == name && g.Id != id, ct))
        {
            errors.Add("name", "There's already a group with that name.");
        }

        if (errors.Any)
        {
            return errors.ToResult();
        }

        group.Name = name!;
        group.Color = color;
        if (input.Kind is { } kind)
        {
            group.Kind = kind;
        }

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteGroup(int id, LandingDb db, CancellationToken ct)
    {
        var group = await db.Groups.FindAsync([id], ct);
        if (group is null)
        {
            return Results.NotFound();
        }

        if (await db.VisibleBookmarks.AnyAsync(b => b.GroupId == id, ct))
        {
            return Results.Problem("Move or delete its bookmarks first.", statusCode: StatusCodes.Status409Conflict);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Bookmarks.Where(b => b.GroupId == id).ExecuteDeleteAsync(ct);
        db.Groups.Remove(group);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ReorderGroups(ReorderInput input, LandingDb db, CancellationToken ct)
    {
        var groups = await db.Groups.ToListAsync(ct);
        var ids = input.Ids ?? [];
        if (ids.Count != groups.Count || ids.Distinct().Count() != ids.Count || !ids.All(i => groups.Any(g => g.Id == i)))
        {
            return Results.Problem("Send every group id exactly once.", statusCode: StatusCodes.Status400BadRequest);
        }

        for (var i = 0; i < ids.Count; i++)
        {
            groups.Single(g => g.Id == ids[i]).SortOrder = i;
        }

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ── bookmarks ──────────────────────────────────────────────────────

    private sealed record CleanBookmark(string Name, Uri Url, string IconColor);

    private static async Task<(CleanBookmark? Clean, Group? Group, IResult? Error)> ValidateBookmarkAsync(
        BookmarkInput input, LandingDb db, TimeProvider clock, CancellationToken ct)
    {
        var errors = new Errors();
        var url = Errors.CleanUrl(input.Url, errors);
        var name = Errors.CleanName(input.Name, Limits.BookmarkName, "name", errors, "Give it a name.");
        var color = Errors.CleanColor(input.IconColor ?? "terra", errors, "iconColor");
        if (!Enum.IsDefined(input.IconKind))
        {
            errors.Add("iconKind", "Pick favicon or initials.");
        }

        Group? group = null;
        if (input.GroupId is { } gid)
        {
            group = await db.Groups.FindAsync([gid], ct);
            if (group is null)
            {
                errors.Add("groupId", "That group no longer exists.");
            }
        }
        else
        {
            var groupName = Errors.CleanName(input.NewGroupName, Limits.GroupName, "groupId", errors, "Pick a group.");
            if (groupName is not null)
            {
                group = await db.Groups.FirstOrDefaultAsync(g => g.Name == groupName, ct)
                    ?? await AddGroupAsync(db, groupName, GroupKind.Normal, color, clock, ct);
            }
        }

        return errors.Any ? (null, null, errors.ToResult()) : (new CleanBookmark(name!, url!, color), group, null);
    }

    private static async Task<IResult> CreateBookmark(BookmarkInput input, LandingDb db, SiteInspector inspector, TimeProvider clock, CancellationToken ct)
    {
        var (clean, group, error) = await ValidateBookmarkAsync(input, db, clock, ct);
        if (error is not null)
        {
            return error;
        }

        var favicon = input.IconKind == IconKind.Favicon ? (await inspector.InspectAsync(clean!.Url, ct)).Favicon : null;
        var now = clock.GetUtcNow();
        var nextSort = group!.Id == 0
            ? 0
            : (await db.Bookmarks.Where(b => b.GroupId == group.Id && b.DeletedAt == null).MaxAsync(b => (int?)b.SortOrder, ct) ?? -1) + 1;

        var bookmark = new Bookmark
        {
            Group = group,
            Name = clean!.Name,
            Url = clean.Url.ToString(),
            IconKind = favicon is null ? IconKind.Initials : IconKind.Favicon,
            IconColor = clean.IconColor,
            Favicon = favicon?.Bytes,
            FaviconContentType = favicon?.ContentType,
            IsFavorite = input.IsFavorite,
            IsTemporary = input.IsTemporary,
            IsPrivate = input.IsPrivate,
            SortOrder = nextSort,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Bookmarks.Add(bookmark);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/bookmarks/{bookmark.Id}", new { bookmark.Id, bookmark.GroupId, FaviconFound = favicon is not null });
    }

    private static async Task<IResult> UpdateBookmark(int id, BookmarkInput input, LandingDb db, SiteInspector inspector, TimeProvider clock, CancellationToken ct)
    {
        var bookmark = await db.VisibleBookmarks.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bookmark is null)
        {
            return Results.NotFound();
        }

        var (clean, group, error) = await ValidateBookmarkAsync(input, db, clock, ct);
        if (error is not null)
        {
            return error;
        }

        var newUrl = clean!.Url.ToString();
        var urlChanged = !string.Equals(newUrl, bookmark.Url, StringComparison.Ordinal);
        if (input.IconKind == IconKind.Favicon && (urlChanged || bookmark.Favicon is null))
        {
            var favicon = (await inspector.InspectAsync(clean.Url, ct)).Favicon;
            bookmark.Favicon = favicon?.Bytes;
            bookmark.FaviconContentType = favicon?.ContentType;
        }

        bookmark.IconKind = input.IconKind == IconKind.Favicon && bookmark.Favicon is not null ? IconKind.Favicon : IconKind.Initials;
        bookmark.Name = clean.Name;
        bookmark.Url = newUrl;
        bookmark.IconColor = clean.IconColor;
        bookmark.IsFavorite = input.IsFavorite;
        bookmark.IsTemporary = input.IsTemporary;
        bookmark.IsPrivate = input.IsPrivate;
        bookmark.UpdatedAt = clock.GetUtcNow();
        if (urlChanged)
        {
            bookmark.Status = LinkStatus.Unknown;
            bookmark.StatusDetail = null;
            bookmark.ResponseMs = null;
            bookmark.LastCheckedAt = null;
            bookmark.StatusSince = null;
        }

        if (group!.Id != bookmark.GroupId)
        {
            var nextSort = group.Id == 0
                ? 0
                : (await db.Bookmarks.Where(b => b.GroupId == group.Id && b.DeletedAt == null).MaxAsync(b => (int?)b.SortOrder, ct) ?? -1) + 1;
            bookmark.Group = group;
            bookmark.SortOrder = nextSort;
        }

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteBookmark(int id, LandingDb db, TimeProvider clock, CancellationToken ct)
    {
        var n = await db.VisibleBookmarks.Where(b => b.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.DeletedAt, clock.GetUtcNow()), ct);
        return n == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> RestoreBookmark(int id, LandingDb db, CancellationToken ct)
    {
        var n = await db.Bookmarks.Where(b => b.Id == id && b.DeletedAt != null)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.DeletedAt, (DateTimeOffset?)null), ct);
        return n == 0 ? Results.NotFound() : Results.NoContent();
    }

    /// <summary>Reorder within a group or move to another: lands at <c>Index</c> in the target group.</summary>
    private static async Task<IResult> MoveBookmark(int id, MoveInput input, LandingDb db, TimeProvider clock, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var bookmark = await db.VisibleBookmarks.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bookmark is null)
        {
            return Results.NotFound();
        }

        if (!await db.Groups.AnyAsync(g => g.Id == input.GroupId, ct))
        {
            var errors = new Errors();
            errors.Add("groupId", "That group no longer exists.");
            return errors.ToResult();
        }

        var source = bookmark.GroupId;
        var target = await db.VisibleBookmarks
            .Where(b => b.GroupId == input.GroupId && b.Id != id)
            .OrderBy(b => b.SortOrder).ThenBy(b => b.Id)
            .ToListAsync(ct);
        target.Insert(Math.Clamp(input.Index, 0, target.Count), bookmark);
        bookmark.GroupId = input.GroupId;
        for (var i = 0; i < target.Count; i++)
        {
            target[i].SortOrder = i;
        }

        if (source != input.GroupId)
        {
            var rest = await db.VisibleBookmarks.Where(b => b.GroupId == source && b.Id != id)
                .OrderBy(b => b.SortOrder).ThenBy(b => b.Id).ToListAsync(ct);
            for (var i = 0; i < rest.Count; i++)
            {
                rest[i].SortOrder = i;
            }
        }

        bookmark.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetIcon(int id, LandingDb db, HttpContext http, CancellationToken ct)
    {
        var icon = await db.VisibleBookmarks.AsNoTracking()
            .Where(b => b.Id == id && b.Favicon != null)
            .Select(b => new { b.Favicon, b.FaviconContentType })
            .FirstOrDefaultAsync(ct);
        if (icon?.Favicon is null || icon.FaviconContentType is null)
        {
            return Results.NotFound();
        }

        // The URL carries ?v=<updatedAt>, so a changed icon gets a new URL and this can cache hard.
        http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        http.Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        return Results.File(icon.Favicon, icon.FaviconContentType);
    }
}
