namespace Landing.Api.Domain;

/// <summary>A titled section of the board. External groups hold off-LAN links and are never status-checked.</summary>
public sealed class Group
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public GroupKind Kind { get; set; }
    public required string Color { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<Bookmark> Bookmarks { get; } = [];
}

public enum GroupKind
{
    Normal = 0,
    External = 1,
}

/// <summary>One link on the board. One URL per bookmark (LAN DNS resolves home.example names locally).</summary>
public sealed class Bookmark
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    public Group? Group { get; set; }

    public required string Name { get; set; }
    public required string Url { get; set; }

    public IconKind IconKind { get; set; }
    public required string IconColor { get; set; }
    public byte[]? Favicon { get; set; }
    public string? FaviconContentType { get; set; }

    public bool IsFavorite { get; set; }
    public bool IsTemporary { get; set; }

    /// <summary>Stored from Phase 0; enforced (hidden from guests) once login ships in Phase 1.</summary>
    public bool IsPrivate { get; set; }

    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Soft delete, so the UI can offer undo. Purged after a day.</summary>
    public DateTimeOffset? DeletedAt { get; set; }

    public LinkStatus Status { get; set; }
    public string? StatusDetail { get; set; }
    public int? ResponseMs { get; set; }
    public DateTimeOffset? LastCheckedAt { get; set; }
    public DateTimeOffset? StatusSince { get; set; }
}

public enum IconKind
{
    Initials = 0,
    Favicon = 1,
}

public enum LinkStatus
{
    Unknown = 0,
    Up = 1,
    Warning = 2,
    Down = 3,
}

/// <summary>The fixed palette the UI knows. Stored as keys so the look can change without a migration.</summary>
public static class Palette
{
    public static readonly IReadOnlyList<string> Keys =
        ["terra", "amber", "moss", "teal", "plum", "rose", "sky", "clay"];

    public static bool IsValid(string? key) => key is not null && Keys.Contains(key);
}
