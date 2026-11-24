using Landing.Api.Domain;

namespace Landing.Api.Endpoints;

public sealed record BoardDto(IReadOnlyList<GroupDto> Groups, CheckerDto Checker, string Version);

public sealed record CheckerDto(DateTimeOffset? LastRunAt, int IntervalSeconds);

public sealed record GroupDto(int Id, string Name, GroupKind Kind, string Color, int SortOrder, IReadOnlyList<BookmarkDto> Bookmarks);

public sealed record BookmarkDto(
    int Id,
    int GroupId,
    string Name,
    string Url,
    IconKind IconKind,
    string IconColor,
    string? IconUrl,
    bool IsFavorite,
    bool IsTemporary,
    bool IsPrivate,
    int SortOrder,
    LinkStatus Status,
    string? StatusDetail,
    int? ResponseMs,
    DateTimeOffset? LastCheckedAt,
    DateTimeOffset? StatusSince);

/// <summary>Create or edit. Give either GroupId or NewGroupName (the form's "+ new group").</summary>
public sealed record BookmarkInput(
    string? Name,
    string? Url,
    int? GroupId,
    string? NewGroupName,
    IconKind IconKind,
    string? IconColor,
    bool IsFavorite,
    bool IsTemporary,
    bool IsPrivate);

public sealed record MoveInput(int GroupId, int Index);

public sealed record GroupInput(string? Name, GroupKind? Kind, string? Color);

public sealed record ReorderInput(IReadOnlyList<int>? Ids);

public sealed record PreviewInput(string? Url);

public sealed record DuplicateDto(int Id, string Name, string GroupName);

public sealed record PreviewDto(string? Title, string? FaviconDataUrl, IReadOnlyList<DuplicateDto> Duplicates);
