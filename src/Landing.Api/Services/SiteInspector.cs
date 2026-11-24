using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Landing.Api.Data;

namespace Landing.Api.Services;

public sealed record Favicon(byte[] Bytes, string ContentType);

public sealed record SiteInfo(string? Title, Favicon? Favicon);

/// <summary>
/// Reads a site's title and favicon when a bookmark is saved, so the page never loads anything
/// from other origins. Bounded on every axis: http/https only, timeouts, byte caps, raster images only
/// (SVG is refused because it can carry script if opened directly).
/// </summary>
public sealed partial class SiteInspector(IHttpClientFactory httpFactory, ILogger<SiteInspector> log)
{
    private const int MaxPageBytes = 512 * 1024;
    private static readonly TimeSpan PageTimeout = TimeSpan.FromSeconds(4);
    private static readonly TimeSpan IconTimeout = TimeSpan.FromSeconds(3);

    public async Task<SiteInfo> InspectAsync(Uri url, CancellationToken ct)
    {
        var http = httpFactory.CreateClient(HttpClientSetup.Inspector);
        string? html = null;
        Uri pageUri = url;
        try
        {
            (html, pageUri) = await ReadPageAsync(http, url, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            log.LogDebug(ex, "Could not read {Url}", url);
        }

        var title = html is null ? null : ExtractTitle(html);
        var candidates = new List<Uri>();
        if (html is not null)
        {
            candidates.AddRange(ExtractIconLinks(html, pageUri));
        }

        candidates.Add(new Uri(pageUri, "/favicon.ico"));

        foreach (var candidate in candidates.Distinct().Take(4))
        {
            var icon = await TryFetchIconAsync(http, candidate, ct);
            if (icon is not null)
            {
                return new SiteInfo(title, icon);
            }
        }

        return new SiteInfo(title, null);
    }

    private static async Task<(string? Html, Uri FinalUri)> ReadPageAsync(HttpClient http, Uri url, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(PageTimeout);
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        var final = response.RequestMessage?.RequestUri ?? url;
        var type = response.Content.Headers.ContentType?.MediaType;
        if (!response.IsSuccessStatusCode || type is null || !type.Contains("html", StringComparison.OrdinalIgnoreCase))
        {
            return (null, final);
        }

        var bytes = await ReadCappedAsync(response, MaxPageBytes, timeout.Token);
        return (bytes is null ? null : Encoding.UTF8.GetString(bytes), final);
    }

    private async Task<Favicon?> TryFetchIconAsync(HttpClient http, Uri uri, CancellationToken ct)
    {
        if (uri.Scheme is not ("http" or "https"))
        {
            return null;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(IconTimeout);
            using var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var bytes = await ReadCappedAsync(response, Limits.FaviconBytes, timeout.Token);
            var sniffed = bytes is null ? null : SniffImageType(bytes);
            return sniffed is null ? null : new Favicon(bytes!, sniffed);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            log.LogDebug(ex, "No icon at {Uri}", uri);
            return null;
        }
    }

    /// <summary>Reads at most <paramref name="max"/> bytes; returns null if the body is larger.</summary>
    private static async Task<byte[]?> ReadCappedAsync(HttpResponseMessage response, int max, CancellationToken ct)
    {
        if (response.Content.Headers.ContentLength > max)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > max)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    /// <summary>Trusts the bytes, not the server's Content-Type. Raster formats only.</summary>
    public static string? SniffImageType(ReadOnlySpan<byte> b)
    {
        if (b.Length < 12)
        {
            return null;
        }

        if (b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47)
        {
            return "image/png";
        }

        if (b[0] == 0x00 && b[1] == 0x00 && b[2] == 0x01 && b[3] == 0x00)
        {
            return "image/x-icon";
        }

        if (b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46)
        {
            return "image/gif";
        }

        if (b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50)
        {
            return "image/webp";
        }

        return null;
    }

    public static string? ExtractTitle(string html)
    {
        var m = TitleRegex().Match(html);
        if (!m.Success)
        {
            return null;
        }

        var title = WhitespaceRegex().Replace(WebUtility.HtmlDecode(m.Groups[1].Value), " ").Trim();
        if (title.Length == 0)
        {
            return null;
        }

        return title.Length > Limits.BookmarkName ? title[..Limits.BookmarkName].TrimEnd() : title;
    }

    public static IEnumerable<Uri> ExtractIconLinks(string html, Uri baseUri)
    {
        var found = new List<(int Rank, Uri Uri)>();
        foreach (Match link in LinkTagRegex().Matches(html))
        {
            var tag = link.Value;
            var rel = AttrRegex("rel").Match(tag);
            var href = AttrRegex("href").Match(tag);
            if (!rel.Success || !href.Success)
            {
                continue;
            }

            var relValue = rel.Groups[2].Value.ToLowerInvariant();
            var rank = relValue.Contains("apple-touch-icon", StringComparison.Ordinal) ? 1
                : relValue.Split(' ').Contains("icon") ? 2
                : -1;
            if (rank < 0)
            {
                continue;
            }

            if (Uri.TryCreate(baseUri, WebUtility.HtmlDecode(href.Groups[2].Value), out var uri) && uri.Scheme is "http" or "https")
            {
                found.Add((rank, uri));
            }
        }

        return found.OrderBy(f => f.Rank).Select(f => f.Uri);
    }

    [GeneratedRegex(@"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline, matchTimeoutMilliseconds: 200)]
    private static partial Regex TitleRegex();

    [GeneratedRegex(@"\s+", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"<link\b[^>]*>", RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 200)]
    private static partial Regex LinkTagRegex();

    private static Regex AttrRegex(string name) =>
        new($@"\b{name}\s*=\s*(['""])(.*?)\1", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
}
