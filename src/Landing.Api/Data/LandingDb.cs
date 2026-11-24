using Landing.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Landing.Api.Data;

public sealed class LandingDb(DbContextOptions<LandingDb> options) : DbContext(options)
{
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Bookmark> Bookmarks => Set<Bookmark>();

    /// <summary>
    /// Every bookmark read goes through here. Phase 1 adds the "hide private from guests" filter
    /// in this one place, so no endpoint can forget it.
    /// </summary>
    public IQueryable<Bookmark> VisibleBookmarks => Bookmarks.Where(b => b.DeletedAt == null);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Group>(e =>
        {
            e.ToTable("groups");
            e.Property(g => g.Id).HasColumnName("id");
            e.Property(g => g.Name).HasColumnName("name").HasMaxLength(Limits.GroupName).IsRequired();
            e.Property(g => g.Kind).HasColumnName("kind").HasConversion<string>().HasMaxLength(16);
            e.Property(g => g.Color).HasColumnName("color").HasMaxLength(16).IsRequired();
            e.Property(g => g.SortOrder).HasColumnName("sort_order");
            e.Property(g => g.CreatedAt).HasColumnName("created_at");
            e.HasIndex(g => g.Name).IsUnique();
        });

        modelBuilder.Entity<Bookmark>(e =>
        {
            e.ToTable("bookmarks");
            e.Property(b => b.Id).HasColumnName("id");
            e.Property(b => b.GroupId).HasColumnName("group_id");
            e.HasOne(b => b.Group).WithMany(g => g.Bookmarks).HasForeignKey(b => b.GroupId).OnDelete(DeleteBehavior.Restrict);
            e.Property(b => b.Name).HasColumnName("name").HasMaxLength(Limits.BookmarkName).IsRequired();
            e.Property(b => b.Url).HasColumnName("url").HasMaxLength(Limits.Url).IsRequired();
            e.Property(b => b.IconKind).HasColumnName("icon_kind").HasConversion<string>().HasMaxLength(16);
            e.Property(b => b.IconColor).HasColumnName("icon_color").HasMaxLength(16).IsRequired();
            e.Property(b => b.Favicon).HasColumnName("favicon");
            e.Property(b => b.FaviconContentType).HasColumnName("favicon_content_type").HasMaxLength(64);
            e.Property(b => b.IsFavorite).HasColumnName("is_favorite");
            e.Property(b => b.IsTemporary).HasColumnName("is_temporary");
            e.Property(b => b.IsPrivate).HasColumnName("is_private");
            e.Property(b => b.SortOrder).HasColumnName("sort_order");
            e.Property(b => b.CreatedAt).HasColumnName("created_at");
            e.Property(b => b.UpdatedAt).HasColumnName("updated_at");
            e.Property(b => b.DeletedAt).HasColumnName("deleted_at");
            e.Property(b => b.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(16);
            e.Property(b => b.StatusDetail).HasColumnName("status_detail").HasMaxLength(120);
            e.Property(b => b.ResponseMs).HasColumnName("response_ms");
            e.Property(b => b.LastCheckedAt).HasColumnName("last_checked_at");
            e.Property(b => b.StatusSince).HasColumnName("status_since");
            e.HasIndex(b => new { b.GroupId, b.SortOrder });
        });
    }
}

/// <summary>Input limits, shared by validation and the schema.</summary>
public static class Limits
{
    public const int GroupName = 40;
    public const int BookmarkName = 80;
    public const int Url = 2048;
    public const int FaviconBytes = 100 * 1024;
}
