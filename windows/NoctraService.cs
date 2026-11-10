using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Noctra.Windows;

internal sealed class NoctraApiException(string message, HttpStatusCode? status = null) : InvalidOperationException(message)
{
    internal HttpStatusCode? Status { get; } = status;
}

public sealed record TvSource(string Id, string Name, string? Type, string? Section = null);
internal sealed record TvSources(TvSource[]? Sources);
internal sealed record TvGroup(string? Name, string? Title, string? Ref);
internal sealed record TvCatalog(TvEntry[]? Channels, TvGroup[]? Groups, bool Progressive, string? Warning, int RetryAfterMs = 0);
internal sealed record TvEntry(string? Name, string? Group, string? Country, string? Logo, string? Provider,
    string? StreamUrl, string? ResolverUrl, string? EmbedUrl, string? ExternalUrl, bool IsEvent, JsonElement? EventId,
    string? IptvOrgCountry = null, string? IptvOrgId = null, string? EpgId = null, string? Language = null,
    // 0.8 : champs utilisés par le regroupement « Toutes les chaînes » du serveur (noctra-tv-unified.js).
    JsonElement? Id = null, string? IptvOrgName = null, string? PlaybackType = null, string? VipFallbackUrl = null,
    string? HomeName = null, string? AwayName = null, JsonElement? StartTime = null, JsonElement? IsLive = null);
internal sealed record TvOption(string? Label, string? StreamUrl, string? ResolveUrl, string? Url, string? PlaybackType, bool ManualOnly,
    string? EmbedUrl = null, string? ExternalUrl = null);
internal sealed record TvResolved(TvOption[]? Options, TvOption[]? ServerChoices, TvOption[]? Embeds, string? ExternalUrl, string? Warning);
internal sealed record LiveStream(Uri Url, string? NoctraToken);
internal sealed record DiscoverItem(int Id, string MediaType, string? Title, string? Name, string? Overview, string? PosterPath,
    string? ReleaseDate, string? FirstAirDate, DiscoverStatus? MediaInfo, string? BackdropPath = null, double? VoteAverage = null)
{
    internal string Label => Title ?? Name ?? "Sans titre";
}
internal sealed record DiscoverStatus(int Status, string? JellyfinMediaId);
internal sealed record DiscoverPage(DiscoverItem[]? Results, bool HasMore, int NextPage, string? Warning);

internal sealed class NoctraService(Jellyfin client, Uri root)
{
    internal bool AllowWebRequest(Uri uri) => !Trusted(uri) || TvWebPath(uri);
    internal string? WebToken(Uri uri) => Trusted(uri) && TvWebPath(uri) ? client.Token : null;
    private bool TvWebPath(Uri uri)
    {
        var path = uri.AbsolutePath[root.AbsolutePath.Length..];
        return new[] { "api/tv/embed/", "api/tv/stream/", "api/tv/image/", "api/tv/resolve/", "api/tv/oha/",
            "api/tv/fstv/", "api/tv/streamsports99/", "api/tv/volkamax/embed/", "api/tv/alternative/open/",
            "api/tv/livewatch/vip/", "api/tv/livewatch/prepare/",
            "api/tv/livewatch/embed/", "api/tv/livewatch/site/", "api/tv/livewatch/http/", "api/tv/livewatch/hls/",
            "api/tv/livewatch/stream/", "api/tv/livewatch/resolve/" }.Any(prefix => path.StartsWith(prefix, StringComparison.Ordinal));
    }
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
    {
        Timeout = TimeSpan.FromSeconds(45)
    };
    internal Uri? Link(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.StartsWith("//", StringComparison.Ordinal) || raw.Contains('\\')) return null;
        Uri? uri;
        if (raw.StartsWith(root.AbsolutePath, StringComparison.Ordinal))
        { if (!Uri.TryCreate(root, raw, out uri)) return null; }
        else if (!Uri.TryCreate(raw, UriKind.Absolute, out uri) || uri.Scheme == "file")
        { if (!Uri.TryCreate(root, raw.TrimStart('/'), out uri)) return null; }
        return uri.UserInfo.Length == 0 && (uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback) ? uri : null;
    }

    private bool Trusted(Uri uri) => root.IsBaseOf(uri) &&
        uri.AbsolutePath.StartsWith(root.AbsolutePath + "api/", StringComparison.Ordinal);

    internal LiveStream? Stream(string? raw)
    {
        var url = Link(raw);
        if (url == null) return null;
        return new LiveStream(url, Trusted(url) ? client.Token : null);
    }

    internal bool IsApi(string? raw) => Link(raw) is { } url && Trusted(url);

    internal async Task<T> Read<T>(string path, CancellationToken cancellation, int timeoutSeconds = 44, bool retry = true)
    {
        var uri = Link(path);
        if (uri == null || !Trusted(uri)) throw new InvalidOperationException("Adresse API Noctra invalide.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        for (var attempt = 0; ; attempt++)
        {
            using var response = await Request(uri, HttpMethod.Get, null, timeout.Token);
            if (retry && attempt == 0 && ((int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.RequestTimeout))
            {
                await Task.Delay(300, timeout.Token);
                continue;
            }
            await EnsureResponse(response, timeout.Token);
            await using var data = await response.Content.ReadAsStreamAsync(timeout.Token);
            return await JsonSerializer.DeserializeAsync<T>(data, Jellyfin.Json, timeout.Token) ??
                throw new NoctraApiException("Réponse Noctra vide.");
        }
    }

    internal async Task Submit(string path, object body, CancellationToken cancellation)
    {
        var uri = Link(path);
        if (uri == null || !Trusted(uri)) throw new InvalidOperationException("Adresse API Noctra invalide.");
        using var response = await Request(uri, HttpMethod.Post, body, cancellation);
        await EnsureResponse(response, cancellation);
    }

    internal Task<JsonElement> Json(string path, CancellationToken cancellation) => Read<JsonElement>(path, cancellation);

    internal async Task<JsonElement> Send(string path, string method, object? body, CancellationToken cancellation)
    {
        var uri = Link(path);
        if (uri == null || !Trusted(uri)) throw new InvalidOperationException("Adresse Noctra invalide.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(44));
        using var response = await Request(uri, new HttpMethod(method), body, timeout.Token);
        await EnsureResponse(response, timeout.Token);
        var data = await response.Content.ReadAsStringAsync(timeout.Token);
        return string.IsNullOrWhiteSpace(data) ? default : JsonSerializer.Deserialize<JsonElement>(data, Jellyfin.Json);
    }

    internal Task<HttpResponseMessage> Image(Uri uri, CancellationToken cancellation) => Request(uri, HttpMethod.Get, null, cancellation);

    private static async Task EnsureResponse(HttpResponseMessage response, CancellationToken cancellation)
    {
        if (response.IsSuccessStatusCode) return;
        var message = response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ?
            "La session Noctra est refusée. Reconnectez-vous ou vérifiez vos droits." :
            (int)response.StatusCode >= 500 ? $"Le service Noctra est temporairement indisponible (HTTP {(int)response.StatusCode})." :
            $"Le serveur Noctra a refusé cette opération (HTTP {(int)response.StatusCode}).";
        if (response.Content.Headers.ContentLength is not > 16384)
        {
            try
            {
                using var data = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
                var error = data.RootElement.Str("error");
                if (error.Length is > 0 and <= 600) message = error;
            }
            catch (JsonException) { }
        }
        throw new NoctraApiException(message, response.StatusCode);
    }

    private async Task<HttpResponseMessage> Request(Uri uri, HttpMethod method, object? body, CancellationToken cancellation)
    {
        using var message = new HttpRequestMessage(method, uri);
        if (Trusted(uri)) message.Headers.TryAddWithoutValidation("x-noctra-token", client.Token);
        if (body != null) message.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        return await Http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellation);
    }
}
