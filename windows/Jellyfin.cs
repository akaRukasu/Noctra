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
internal sealed record WatchData(bool Played, long PlaybackPositionTicks, bool IsFavorite, int? UnplayedItemCount = null);
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
    // 0.7 : musique, listes de lecture, fiche technique, bandes-annonces, vignettes de progression.
    public string? ParentId { get; init; }
    public string? SeasonId { get; init; }
    public string? Album { get; init; }
    public string? AlbumId { get; init; }
    public string? AlbumArtist { get; init; }
    public string[]? Artists { get; init; }
    public string? AlbumPrimaryImageTag { get; init; }
    public string? PlaylistItemId { get; init; }
    public string? MediaType { get; init; }
    public string? Container { get; init; }
    public MediaSourceInfo[]? MediaSources { get; init; }
    public NamedValue[]? Studios { get; init; }
    public string[]? Tags { get; init; }
    public string[]? Taglines { get; init; }
    public MediaUrl[]? RemoteTrailers { get; init; }
    public MediaUrl[]? ExternalUrls { get; init; }
    public int? LocalTrailerCount { get; init; }
    public double? CriticRating { get; init; }
    public DateTime? PremiereDate { get; init; }
    public Dictionary<string, string>? ProviderIds { get; init; }
    public Dictionary<string, Dictionary<string, TrickplayInfo>>? Trickplay { get; init; }

    internal bool CanPlay => Type is "Movie" or "Episode" or "Audio" or "MusicVideo" or "Video" or "Trailer";
    internal bool IsAudio => Type == "Audio";
    internal bool Square => Type is "MusicAlbum" or "Audio" or "MusicArtist" or "Playlist" or "Photo" or "PhotoAlbum";
    internal string DisplayTitle => Type == "Episode" && !string.IsNullOrWhiteSpace(SeriesName) ? SeriesName : Name;
    internal string Caption => Type switch
    {
        "Episode" => string.Join(" · ", new[] { IndexNumber is int number ? $"S{ParentIndexNumber ?? 1:00} E{number:00}" : "", Name }.Where(s => s.Length > 0)),
        "Audio" => string.Join(" · ", new[] { AlbumArtist ?? Artists?.FirstOrDefault(), Album }.Where(s => !string.IsNullOrWhiteSpace(s))),
        "MusicAlbum" => string.Join(" · ", new[] { AlbumArtist, ProductionYear?.ToString(CultureInfo.InvariantCulture) }.Where(s => !string.IsNullOrWhiteSpace(s))),
        "MusicArtist" => "Artiste",
        "Playlist" => ChildCount is int count ? count + " élément" + (count > 1 ? "s" : "") : "Liste de lecture",
        "Photo" => ProductionYear?.ToString(CultureInfo.InvariantCulture) ?? "Photo",
        "PhotoAlbum" or "Folder" => "Album",
        "Person" => "Personne",
        _ => ProductionYear?.ToString(CultureInfo.InvariantCulture) ?? (Type == "Series" ? "Série" : "Film")
    };
    internal long Resume => UserData?.PlaybackPositionTicks is > 0 and <= TimeSpan.TicksPerDay &&
        (RunTimeTicks is not > 0 || UserData.PlaybackPositionTicks < RunTimeTicks * .99) ? UserData.PlaybackPositionTicks : 0;
    internal double Progress => RunTimeTicks is > 0 ? (double)Resume / RunTimeTicks.Value : 0;
}

internal sealed record ItemPage(MediaItem[]? Items, int? TotalRecordCount);
internal sealed record Chapter(string? Name, long StartPositionTicks);
internal sealed record MediaPerson(string Id, string Name, string? Type, string? Role);
internal sealed record MediaSegment(string Type, long StartTicks, long EndTicks);
internal sealed record SegmentPage(MediaSegment[]? Items);
internal sealed record MediaStreamInfo(string? Type, string? Codec, int? Width, int? Height, string? VideoRange, string? VideoRangeType,
    int? Channels, string? ChannelLayout, string? Language, string? DisplayTitle, string? Title, bool IsExternal, int Index, string? Profile,
    long? BitRate, double? RealFrameRate, bool IsDefault, string? DeliveryMethod, string? DeliveryUrl);
internal sealed record MediaSourceInfo(string? Id, string? Container, long? Size, long? Bitrate, string? Name, MediaStreamInfo[]? MediaStreams);
internal sealed record NamedValue(string? Name, string? Id);
internal sealed record MediaUrl(string? Name, string? Url);
internal sealed record TrickplayInfo(int Width, int Height, int TileWidth, int TileHeight, int ThumbnailCount, int Interval);
internal sealed record SavedAccount(string Address, string JellyfinUrl, Viewer User, string Token, string? NoctraUrl = null);

internal sealed class Jellyfin(Uri root, string deviceId, Viewer user, string token, Uri? noctraRoot = null)
{
    internal static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(12) };
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    // Transferts longs (téléchargement hors connexion) : pas de délai global.
    internal static readonly HttpClient Transfer = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = Timeout.InfiniteTimeSpan };
    internal const string DefaultAddress = "https://akarukasu.astra.usbx.me/noctra/";
    private const string Details = "Overview,Genres,PrimaryImageAspectRatio,ParentId";
    internal Uri Root => root;
    internal Viewer User => user;
    internal string Token => token;
    internal string DeviceId => deviceId;
    internal Uri? NoctraRoot => noctraRoot;

    internal static async Task<Jellyfin> SignIn(string address, string deviceId, string username, string password, CancellationToken cancellation)
    {
        var (target, noctra) = await ResolveServer(address, cancellation);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(target, "Users/AuthenticateByName"));
        request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, null));
        request.Content = new StringContent(JsonSerializer.Serialize(new { Username = username, Pw = password }), Encoding.UTF8, "application/json");
        using var login = await Http.SendAsync(request, cancellation);
        if (login.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new InvalidOperationException("Identifiant ou mot de passe Jellyfin incorrect.");
        login.EnsureSuccessStatusCode();
        return Session(target, noctra, deviceId, await login.Content.ReadAsStringAsync(cancellation));
    }

    internal static Jellyfin Session(Uri target, Uri? noctra, string deviceId, string reply)
    {
        var session = JsonSerializer.Deserialize<LoginReply>(reply, Json);
        if (session?.User is null || !PlayRequest.Identifier(session.User.Id) || string.IsNullOrWhiteSpace(session.AccessToken))
            throw new InvalidOperationException("La session Jellyfin reçue est incomplète.");
        return new Jellyfin(target, deviceId, session.User, session.AccessToken, noctra);
    }

    // Adresse Noctra (api/config → Jellyfin) ou adresse Jellyfin directe.
    internal static async Task<(Uri Target, Uri? Noctra)> ResolveServer(string address, CancellationToken cancellation)
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
        return (new Uri(target.AbsoluteUri.TrimEnd('/') + "/"), noctra);
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
        bool favorite = false, string? watched = null, string? sort = null, string? genre = null, int? year = null, double? rating = null)
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
        if (!string.IsNullOrWhiteSpace(genre)) query["Genres"] = genre;
        if (year is > 1800 and < 2300) query["Years"] = year.Value.ToString(CultureInfo.InvariantCulture);
        if (rating is > 0 and <= 10) query["MinCommunityRating"] = rating.Value.ToString(CultureInfo.InvariantCulture);
        if (sort is "Random" or "CommunityRating" or "Runtime" or "PremiereDate") query["SortOrder"] = sort == "Runtime" ? "Ascending" : "Descending";
        return Get<ItemPage>("Items", query, cancellation);
    }

    // Requête de catalogue libre (musique, photos, personnes, listes de lecture).
    internal Task<ItemPage> Items(Dictionary<string, string> query, CancellationToken cancellation)
    {
        query.TryAdd("UserId", user.Id);
        query.TryAdd("EnableUserData", "true");
        query.TryAdd("Fields", Details);
        return Get<ItemPage>("Items", query, cancellation);
    }

    // Genres, années et classifications d'une médiathèque (filtres du catalogue).
    internal Task<JsonElement> Filters(string? parent, string types, CancellationToken cancellation) =>
        Get<JsonElement>("Items/Filters", new Dictionary<string, string> { ["UserId"] = user.Id, ["IncludeItemTypes"] = types }
            .Concat(parent == null ? [] : new[] { KeyValuePair.Create("ParentId", parent) }).ToDictionary(), cancellation);

    // Lecture : chapitres, pistes et vignettes de progression (Jellyfin 10.9+ ; ignoré sinon).
    internal Task<MediaItem> PlaybackDetail(string id, CancellationToken cancellation) =>
        Get<MediaItem>("Users/" + user.Id + "/Items/" + id, new() { ["Fields"] = "Chapters,MediaSources,MediaStreams,Trickplay" }, cancellation);

    internal Task<ItemPage> PlaylistItems(string id, CancellationToken cancellation) =>
        Get<ItemPage>("Playlists/" + id + "/Items", new() { ["UserId"] = user.Id, ["EnableUserData"] = "true", ["Fields"] = Details }, cancellation);

    internal async Task<string> CreatePlaylist(string name, string[] ids, CancellationToken cancellation)
    {
        var reply = await CommandJson("Playlists", new { Name = name, Ids = ids, UserId = user.Id, MediaType = "Video", IsPublic = false }, cancellation);
        return reply.Str("Id");
    }

    internal Task AddToPlaylist(string playlist, string[] ids, CancellationToken cancellation) =>
        Command("Playlists/" + playlist + "/Items?ids=" + string.Join(",", ids) + "&userId=" + user.Id, null, cancellation);

    internal Task RemoveFromPlaylist(string playlist, string entry, CancellationToken cancellation) =>
        Command("Playlists/" + playlist + "/Items?entryIds=" + Uri.EscapeDataString(entry), null, cancellation, HttpMethod.Delete);

    // Sous-titres en ligne (extension OpenSubtitles du serveur).
    internal Task<JsonElement> RemoteSubtitles(string id, string language, CancellationToken cancellation) =>
        Get<JsonElement>("Items/" + id + "/RemoteSearch/Subtitles/" + Uri.EscapeDataString(language), null, cancellation);

    internal Task DownloadSubtitle(string id, string subtitle, CancellationToken cancellation) =>
        Command("Items/" + id + "/RemoteSearch/Subtitles/" + Uri.EscapeDataString(subtitle), null, cancellation);

    // Fichier original (droit « téléchargement » du compte Jellyfin).
    internal async Task<HttpResponseMessage> Download(string id, CancellationToken cancellation)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(root, "Items/" + id + "/Download"));
        request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
        return await Transfer.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation);
    }

    internal async Task<JsonElement> CommandJson(string path, object? body, CancellationToken cancellation)
    {
        using var response = await Transmit(() =>
        {
            var request = new HttpRequestMessage(HttpMethod.Post, new Uri(root, path));
            request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
            if (body != null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            return request;
        }, HttpCompletionOption.ResponseContentRead, false, cancellation);
        response.EnsureSuccessStatusCode();
        var text = await response.Content.ReadAsStringAsync(cancellation);
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    internal Task<MediaItem> Detail(string id, CancellationToken cancellation) =>
        Get<MediaItem>("Users/" + user.Id + "/Items/" + id, new() { ["Fields"] = Details + ",People,Chapters,MediaSources,MediaStreams,Studios,Tags,Taglines,RemoteTrailers,ExternalUrls,ProviderIds" }, cancellation);
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

    // 0.6 : retirer un titre de « Continuer à regarder » (position remise à zéro, statut vu inchangé).
    internal Task ClearResume(string id, CancellationToken cancellation) => SetResume(id, 0, cancellation);

    // 0.7 : position de reprise (aussi utilisée pour reporter une lecture hors connexion).
    internal async Task SetResume(string id, long ticks, CancellationToken cancellation)
    {
        var body = new { PlaybackPositionTicks = Math.Max(0, ticks) };
        try { await Command("UserItems/" + id + "/UserData?userId=" + user.Id, body, cancellation); }
        catch (HttpRequestException error) when (error.StatusCode is System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.MethodNotAllowed)
        {
            // Jellyfin antérieur à 10.9.
            await Command("Users/" + user.Id + "/Items/" + id + "/UserData", body, cancellation);
        }
    }

    // 0.8 : épisodes précédent et suivant (Shows/{série}/Episodes?AdjacentTo=…, comme le lecteur Jellyfin).
    internal async Task<(MediaItem? Previous, MediaItem? Next)> AdjacentEpisodes(MediaItem item, CancellationToken cancellation)
    {
        if (item.Type != "Episode" || string.IsNullOrWhiteSpace(item.SeriesId)) return (null, null);
        var page = await Get<ItemPage>("Shows/" + item.SeriesId + "/Episodes", new()
        {
            ["UserId"] = user.Id, ["AdjacentTo"] = item.Id, ["EnableUserData"] = "true", ["Fields"] = Details
        }, cancellation);
        var items = page.Items ?? [];
        var index = Array.FindIndex(items, episode => episode.Id == item.Id);
        if (index < 0) return (null, null);
        return (index > 0 && items[index - 1].CanPlay ? items[index - 1] : null, index + 1 < items.Length && items[index + 1].CanPlay ? items[index + 1] : null);
    }

    internal async Task<MediaSegment[]> Credits(string id, CancellationToken cancellation)
    {
        var data = await Get<SegmentPage>("MediaSegments/" + id, null, cancellation);
        return (data.Items ?? []).Where(segment => segment.Type is "Intro" or "Outro" or "Recap" or "Preview" &&
            segment.StartTicks >= 0 && segment.EndTicks > segment.StartTicks && segment.EndTicks <= TimeSpan.TicksPerDay).ToArray();
    }

    // Extension « Intro Skipper » : ses marqueurs restent dans son propre point d'accès tant qu'ils ne sont pas copiés
    // dans les segments du serveur (la PWA affiche alors son bouton, injecté par l'extension).
    internal async Task<MediaSegment[]> PluginSegments(string id, CancellationToken cancellation)
    {
        JsonElement data;
        try { data = await Get<JsonElement>("Episode/" + id + "/IntroSkipperSegments", null, cancellation); }
        catch (HttpRequestException error) when (error.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Anciennes versions : seulement le générique de début.
            var single = await Get<JsonElement>("Episode/" + id + "/IntroTimestamps/v1", null, cancellation);
            return PluginSegment("Intro", single) is { } intro ? [intro] : [];
        }
        if (data.ValueKind != JsonValueKind.Object) return [];
        var found = new List<MediaSegment>();
        foreach (var property in data.EnumerateObject())
        {
            var type = property.Name switch { "Introduction" or "Intro" => "Intro", "Credits" or "Outro" => "Outro", "Recap" => "Recap", "Preview" => "Preview", _ => null };
            if (type != null && PluginSegment(type, property.Value) is { } segment) found.Add(segment);
        }
        return found.ToArray();
    }

    private static MediaSegment? PluginSegment(string type, JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object) return null;
        double? Seconds(params string[] names)
        {
            foreach (var name in names)
                if (value.TryGetProperty(name, out var number) && number.ValueKind == JsonValueKind.Number && number.TryGetDouble(out var seconds) && double.IsFinite(seconds)) return seconds;
            return null;
        }
        if (value.TryGetProperty("Valid", out var valid) && valid.ValueKind == JsonValueKind.False) return null;
        var start = Seconds("IntroStart", "Start"); var end = Seconds("IntroEnd", "End");
        if (start is not >= 0 || end is not { } last || last <= start || last > 86_400) return null;
        return new MediaSegment(type, (long)(start.Value * TimeSpan.TicksPerSecond), (long)(last * TimeSpan.TicksPerSecond));
    }

    internal Task<HttpResponseMessage> Image(string path, CancellationToken cancellation) =>
        Send(HttpMethod.Get, path, null, cancellation);

    internal Task<JsonElement> ReadJson(string path, CancellationToken cancellation) => Get<JsonElement>(path, null, cancellation);

    internal async Task Command(string path, object? body, CancellationToken cancellation, HttpMethod? method = null)
    {
        var verb = method ?? HttpMethod.Post;
        using var response = await Transmit(() =>
        {
            var request = new HttpRequestMessage(verb, new Uri(root, path));
            request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
            if (body != null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            return request;
        }, HttpCompletionOption.ResponseContentRead, verb != HttpMethod.Post, cancellation);
        response.EnsureSuccessStatusCode();
    }

    // 0.7 : coupure réseau passagère. Lectures et suppressions sont rejouées ; une écriture ne l'est
    // que si la connexion n'a jamais été établie (la requête n'est donc pas partie).
    private static async Task<HttpResponseMessage> Transmit(Func<HttpRequestMessage> build, HttpCompletionOption option, bool idempotent, CancellationToken cancellation)
    {
        for (var attempt = 0; ; attempt++)
        {
            var request = build();
            try { return await Http.SendAsync(request, option, cancellation); }
            catch (HttpRequestException error) when (attempt < 2 && !cancellation.IsCancellationRequested &&
                (error.HttpRequestError == HttpRequestError.ConnectionError || idempotent && error.StatusCode == null))
            {
                request.Dispose();
                await Task.Delay(250 * (attempt + 1), cancellation);
            }
        }
    }

    internal static string Authorization(string device, string? token) =>
        "MediaBrowser Client=\"Noctra Windows\", Device=\"Windows\", DeviceId=\"" + Uri.EscapeDataString(device) +
        "\", Version=\"0.8.0\"" + (token == null ? "" : ", Token=\"" + Uri.EscapeDataString(token) + "\"");

    private async Task<T> Get<T>(string path, Dictionary<string, string>? query, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(14));
        using var response = await Send(HttpMethod.Get, path, query, timeout.Token);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        return await JsonSerializer.DeserializeAsync<T>(stream, Json, timeout.Token) ?? throw new InvalidOperationException("Réponse Jellyfin vide.");
    }

    private Task<HttpResponseMessage> Send(HttpMethod method, string path, Dictionary<string, string>? query, CancellationToken cancellation)
    {
        var address = new Uri(root, path + (query == null ? "" : "?" +
            string.Join("&", query.Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value)))));
        // Favoris et « vu » (POST / DELETE sans corps) sont idempotents : rejouables comme une lecture.
        return Transmit(() =>
        {
            var request = new HttpRequestMessage(method, address);
            request.Headers.TryAddWithoutValidation("Authorization", Authorization(deviceId, token));
            return request;
        }, HttpCompletionOption.ResponseHeadersRead, true, cancellation);
    }
}

