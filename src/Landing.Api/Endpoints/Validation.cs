using Landing.Api.Data;
using Landing.Api.Domain;

namespace Landing.Api.Endpoints;

/// <summary>Input checks at the API boundary. Errors are keyed by field name for the form.</summary>
public sealed class Errors
{
    private readonly Dictionary<string, string[]> _errors = new(StringComparer.Ordinal);

    public bool Any => _errors.Count > 0;

    public void Add(string field, string message) => _errors[field] = [message];

    public IResult ToResult() => Results.ValidationProblem(_errors);

    public static string? CleanName(string? value, int max, string field, Errors errors, string missing)
    {
        var v = value?.Trim();
        if (string.IsNullOrEmpty(v))
        {
            errors.Add(field, missing);
            return null;
        }

        if (v.Length > max)
        {
            errors.Add(field, $"Keep it under {max} characters.");
            return null;
        }

        if (v.Any(char.IsControl))
        {
            errors.Add(field, "That has characters a name can't use.");
            return null;
        }

        return v;
    }

    /// <summary>Absolute http/https URL with a host, no credentials in it.</summary>
    public static Uri? CleanUrl(string? value, Errors errors, string field = "url")
    {
        var v = value?.Trim();
        if (string.IsNullOrEmpty(v))
        {
            errors.Add(field, "Paste the address to open.");
            return null;
        }

        if (v.Length > Limits.Url)
        {
            errors.Add(field, "That address is too long.");
            return null;
        }

        if (!Uri.TryCreate(v, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || string.IsNullOrEmpty(uri.Host))
        {
            var hint = v.Contains(' ', StringComparison.Ordinal) ? v.Replace(' ', ':') : v;
            errors.Add(field, $"That doesn't look like a URL. Try http://{hint.Replace("http://", "", StringComparison.OrdinalIgnoreCase)}");
            return null;
        }

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            errors.Add(field, "Leave usernames and passwords out of the address.");
            return null;
        }

        return uri;
    }

    public static string CleanColor(string? value, Errors errors, string field)
    {
        if (Palette.IsValid(value))
        {
            return value!;
        }

        errors.Add(field, "Pick one of the colors.");
        return Palette.Keys[0];
    }
}
