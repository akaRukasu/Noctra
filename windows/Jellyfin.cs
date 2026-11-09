using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Noctra.Windows;

internal sealed record UserPolicy(bool IsAdministrator);
internal sealed record Viewer(string Id, string Name, UserPolicy? Policy = null);
internal sealed record LoginReply(Viewer User, string AccessToken);
internal sealed record WatchData(bool Played, long PlaybackPositionTicks, bool IsFavorite);
internal sealed record MediaItem
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Type { get; init; } = "";
    public string? SeriesId { get; init; }
    public string? SeriesName { get; init; }
    public string? Overview { get; init; }
    public string? OfficialRating { get; init; }
    public int? ProductionYear { get; init; }
    public int? ParentIndexNumber { get; init; }
    public int? IndexNumber { get; init; }
    public long? RunTimeTicks { get; init; }
    public string[]? Genres { get; init; }
    public WatchData? UserData { get; init; }
    public Dictionary<string, string>? ImageTags { get; init; }
    public string[]? BackdropImageTags { get; init; }
    public string? ParentBackdropItemId { get; init; }
    public string[]? ParentBackdropImageTags { get; init; }
    public string? ParentLogoItemId { get; init; }
    public string? ParentLogoImageTag { get; init; }
    public int? ChildCount { get; init; }
    public double? CommunityRating { get; init; }
    public Chapter[]? Chapters { get; init; }
    public string? CollectionType { get; init; }
    public MediaPerson[]? People { get; init; }

    internal bool CanPlay => Type is "Movie" or "Episode";
    internal string DisplayTitle => Type == "Episode" && !string.IsNullOrWhiteSpace(SeriesName) ? SeriesName : Name;
    internal string Caption => Type == "Episode"
        ? string.Join(" · ", new[] { IndexNumber is int number ? $"S{ParentIndexNumber ?? 1:00} E{number:00}" : "", Name }.Where(s => s.Length > 0))
        : ProductionYear?.ToString(CultureInfo.InvariantCulture) ?? (Type == "Series" ? "Série" : "Film");
    internal long Resume => UserData?.PlaybackPositionTicks is > 0 and <= TimeSpan.TicksPerDay &&
        (RunTimeTicks is not > 0 || UserData.PlaybackPositionTicks < RunTimeTicks * .99) ? UserData.PlaybackPositionTicks : 0;
    internal double Progress => RunTimeTicks is > 0 ? (double)Resume / RunTimeTicks.Value : 0;
}

internal sealed record ItemPage(MediaItem[]? Items, int? TotalRecordCount);
internal sealed record Chapter(string? Name, long StartPositionTicks);
internal sealed record MediaPerson(string Id, string Name, string? Type, string? Role);
internal sealed record MediaSegment(string Type, long StartTicks, long EndTicks);
internal sealed record SegmentPage(MediaSegment[]? Items);
internal sealed record SavedAccount(string Address, string JellyfinUrl, Viewer User, string Token, string? NoctraUrl = null);

internal sealed class Jellyfin(Uri root, string deviceId, Viewer user, string token, Uri? noctraRoot = null)
{
    internal static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(12) };
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    internal const string DefaultAddress = "https://akarukasu.astra.usbx.me/noctra/";
    private const string Details = "Overview,Genres,PrimaryImageAspectRatio,ParentId";
    internal Uri Root => root;
    internal Viewer User => user;
    internal string Token => token;
    internal string DeviceId => deviceId;
    internal Uri? NoctraRoot => noctraRoot;

    internal static async Task<Jellyfin> SignIn(string address, string deviceId, string username, string password, CancellationToken cancellation)
    {
        if (!TryAddress(address, out var server)) throw new InvalidOperationException("Indique une adresse HTTPS valide.");
        if (server!.AbsolutePath.EndsWith("/client/index.html", StringComparison.OrdinalIgnoreCase)) server = new Uri(server, "../");
        else server = new Uri(server.AbsoluteUri.TrimEnd('/') + "/");
        Uri? target = null;
        using (var response = await Http.GetAsync(new Uri(server, "api/config"), cancellation))
        {
            if (response.IsSuccessStatusCode && response.Content.Headers.ContentType?.MediaType == "application/json")
            {
                using var config = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
                if (config.RootElement.TryGetProperty("jellyfinUrl", out var url)) TryAddress(url.GetString(), out target);
            }
        }
        var noctra = target == null ? null : server;
        if (target is null)
        {
            using var response = await Http.GetAsync(new Uri(server, "System/Info/Public"), cancellation);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Cette adresse ne répond pas comme Noctra ou Jellyfin.");
            using var info = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
            if (!info.RootElement.TryGetProperty("Version", out _)) throw new InvalidOperationException("Serveur Jellyfin introuvable à cette adresse.");
            target = server;
        }
        target = new Uri(target.AbsoluteUri.TrimEnd('/') + "/");
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(target, "Users/AuthenticateByName"));
        request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, null));
        request.Content = new StringContent(JsonSerializer.Serialize(new { Username = username, Pw = password }), Encoding.UTF8, "application/json");
        using var login = await Http.SendAsync(request, cancellation);
        if (login.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new InvalidOperationException("Identifiant ou mot de passe Jellyfin incorrect.");
        login.EnsureSuccessStatusCode();
        var reply = JsonSerializer.Deserialize<LoginReply>(await login.Content.ReadAsStringAsync(cancellation), Json);
        if (reply?.User is null || !PlayRequest.Identifier(reply.User.Id) || string.IsNullOrWhiteSpace(reply.AccessToken))
            throw new InvalidOperationException("La session Jellyfin reçue est incomplète.");
        return new Jellyfin(target, deviceId, reply.User, reply.AccessToken, noctra);
    }

    internal static bool TryAddress(string? input, out Uri? result) =>
        Uri.TryCreate(input, UriKind.Absolute, out result) && result.UserInfo.Length == 0 && result.Query.Length == 0 &&
        result.Fragment.Length == 0 && (result.Scheme == "https" || (result.Scheme == "http" && result.IsLoopback));

    internal Task<Viewer> Validate(CancellationToken cancellation) => Get<Viewer>("Users/Me", null, cancellation);
    internal Task<ItemPage> Libraries(CancellationToken cancellation) =>
        Get<ItemPage>("Users/" + user.Id + "/Views", null, cancellation);

    internal async Task<MediaItem[]> Resume(CancellationToken cancellation)
    {
        var result = await Get<ItemPage>("Users/" + user.Id + "/Items/Resume", new()
        {
            ["Limit"] = "24", ["MediaTypes"] = "Video", ["EnableUserData"] = "true", ["Fields"] = Details,
            ["EnableTotalRecordCount"] = "false", ["ExcludeActiveSessions"] = "false"
        }, cancellation);
        return (result.Items ?? []).Where(item => item.Resume > 0).ToArray();
    }

    internal async Task<MediaItem[]> NextUp(CancellationToken cancellation)
    {
        var result = await Get<ItemPage>("Shows/NextUp", new()
        {
            ["UserId"] = user.Id, ["Limit"] = "24", ["EnableUserData"] = "true",
            ["EnableRewatching"] = "true", ["EnableResumable"] = "false", ["DisableFirstEpisode"] = "true",
            ["NextUpDateCutoff"] = DateTime.UtcNow.AddDays(-30).ToString("O"), ["Fields"] = Details,
            ["EnableTotalRecordCount"] = "false"
        }, cancellation);
        return result.Items ?? [];
    }

    internal Task<ItemPage> Browse(string? type, string? parent, string? search, int start, bool latest, CancellationToken cancellation,
        bool favorite = false, string? watched = null, string? sort = null)
    {
        var query = new Dictionary<string, string>
        {
            ["UserId"] = user.Id, ["Recursive"] = "true", ["IncludeItemTypes"] = type ?? "Movie,Series",
            ["StartIndex"] = start.ToString(CultureInfo.InvariantCulture), ["Limit"] = latest ? "16" : "48",
            ["SortBy"] = latest ? "DateCreated" : sort ?? "SortName", ["SortOrder"] = latest || sort is "ProductionYear" or "DateCreated" ? "Descending" : "Ascending",
            ["Fields"] = Details, ["EnableUserData"] = "true"
        };
        if (parent != null) query["ParentId"] = parent;
        if (!string.IsNullOrWhiteSpace(search)) query["SearchTerm"] = search;
        var filters = new List<string>();
        if (favorite) filters.Add("IsFavorite");
        if (watched != null) filters.Add(watched);
        if (filters.Count > 0) query["Filters"] = string.Join(",", filters);
        return Get<ItemPage>("Items", query, cancellation);
    }

    internal Task<MediaItem> Detail(string id, CancellationToken cancellation) =>
        Get<MediaItem>("Users/" + user.Id + "/Items/" + id, new() { ["Fields"] = Details + ",People,Chapters,MediaSources,MediaStreams" }, cancellation);
    internal Task<ItemPage> Similar(string id, CancellationToken cancellation) =>
        Get<ItemPage>("Items/" + id + "/Similar", new() { ["UserId"] = user.Id, ["Limit"] = "12", ["Fields"] = Details }, cancellation);
    internal Task<ItemPage> Seasons(string id, CancellationToken cancellation) =>
        Get<ItemPage>("Shows/" + id + "/Seasons", new() { ["UserId"] = user.Id, ["EnableUserData"] = "true" }, cancellation);
    internal Task<ItemPage> Episodes(string id, string seasonId, CancellationToken cancellation) =>
        Get<ItemPage>("Shows/" + id + "/Episodes", new()
        {
            ["UserId"] = user.Id, ["SeasonId"] = seasonId, ["EnableUserData"] = "true", ["Fields"] = Details
        }, cancellation);

    internal async Task<MediaItem?> PlayableSeries(string id, CancellationToken cancellation)
    {
        var resume = await Resume(cancellation);
        var watching = resume.FirstOrDefault(item => item.SeriesId == id);
        if (watching != null) return watching;
        var next = await Get<ItemPage>("Shows/NextUp", new()
        {
            ["UserId"] = user.Id, ["SeriesId"] = id, ["Limit"] = "1", ["EnableUserData"] = "true",
            ["EnableResumable"] = "true", ["EnableRewatching"] = "true", ["Fields"] = Details
        }, cancellation);
        if (next.Items?.FirstOrDefault() is { } episode) return episode;
        var first = await Get<ItemPage>("Shows/" + id + "/Episodes", new()
        {
            ["UserId"] = user.Id, ["Limit"] = "1", ["EnableUserData"] = "true", ["Fields"] = Details
        }, cancellation);
        return first.Items?.FirstOrDefault();
    }

    internal async Task Mark(string id, bool played, CancellationToken cancellation)
    {
        using var response = await Send(played ? HttpMethod.Post : HttpMethod.Delete,
            "Users/" + user.Id + "/PlayedItems/" + id, null, cancellation);
        response.EnsureSuccessStatusCode();
    }

    internal async Task Favorite(string id, bool value, CancellationToken cancellation)
    {
        using var response = await Send(value ? HttpMethod.Post : HttpMethod.Delete,
            "Users/" + user.Id + "/FavoriteItems/" + id, null, cancellation);
        response.EnsureSuccessStatusCode();
    }

    internal async Task<MediaSegment[]> Credits(string id, CancellationToken cancellation)
    {
        var data = await Get<SegmentPage>("MediaSegments/" + id, null, cancellation);
        return (data.Items ?? []).Where(segment => segment.Type is "Intro" or "Outro" &&
            segment.StartTicks >= 0 && segment.EndTicks > segment.StartTicks && segment.EndTicks <= TimeSpan.TicksPerDay).ToArray();
    }

    internal Task<HttpResponseMessage> Image(string path, CancellationToken cancellation) =>
        Send(HttpMethod.Get, path, null, cancellation);

    internal Task<JsonElement> ReadJson(string path, CancellationToken cancellation) => Get<JsonElement>(path, null, cancellation);

    internal async Task Command(string path, object? body, CancellationToken cancellation, HttpMethod? method = null)
    {
        using var request = new HttpRequestMessage(method ?? HttpMethod.Post, new Uri(root, path));
        request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
        if (body != null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var response = await Http.SendAsync(request, cancellation);
        response.EnsureSuccessStatusCode();
    }

    internal static string Authorization(string device, string? token) =>
        "MediaBrowser Client=\"Noctra Windows\", Device=\"Windows\", DeviceId=\"" + Uri.EscapeDataString(device) +
        "\", Version=\"0.5.9\"" + (token == null ? "" : ", Token=\"" + Uri.EscapeDataString(token) + "\"");

    private async Task<T> Get<T>(string path, Dictionary<string, string>? query, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(14));
        using var response = await Send(HttpMethod.Get, path, query, timeout.Token);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        return await JsonSerializer.DeserializeAsync<T>(stream, Json, timeout.Token) ?? throw new InvalidOperationException("Réponse Jellyfin vide.");
    }

    private async Task<HttpResponseMessage> Send(HttpMethod method, string path, Dictionary<string, string>? query, CancellationToken cancellation)
    {
        using var request = new HttpRequestMessage(method, new Uri(root, path + (query == null ? "" : "?" +
            string.Join("&", query.Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value))))));
        request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
        return await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation);
    }
}

