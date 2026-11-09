using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Noctra.Windows;

internal sealed record PlayRequest(string ItemId, string UserId, string Token, string DeviceId, long StartTicks)
{
    internal bool IsValid() =>
        Identifier(ItemId) && Identifier(UserId) &&
        Token is { Length: > 0 and <= 512 } && DeviceId is { Length: > 0 and <= 256 } &&
        StartTicks is >= 0 and <= TimeSpan.TicksPerDay;

    internal static bool Identifier(string? value) => value is { Length: > 0 and <= 128 } &&
        Regex.IsMatch(value, @"\A[A-Za-z0-9_-]+\z", RegexOptions.CultureInvariant);
}

internal sealed class JellyfinPlayback(HttpClient http, Uri server, PlayRequest request, bool audio = false, Uri? localFile = null)
{
    internal string MediaAuthorization => Jellyfin.Authorization(request.DeviceId, request.Token);
    internal double StartSeconds => request.StartTicks / (double)TimeSpan.TicksPerSecond;
    internal string Method { get; private set; } = localFile != null ? "Offline" : "DirectPlay";
    internal string ItemId => request.ItemId;
    internal bool Audio => audio;
    internal bool Local => localFile != null;
    internal string MediaSourceId => mediaSourceId;
    // 0.7 : sous-titres externes (.srt, .ass…) livrés par Jellyfin à côté du fichier.
    internal (Uri Url, string Title, string? Language)[] ExternalSubtitles { get; private set; } = [];
    private string mediaSourceId = "";
    private string playSessionId = "";
    private Task reportQueue = Task.CompletedTask;
    private const int MaximumBitrate = 200_000_000;

    internal async Task<Uri> Prepare(CancellationToken cancellation, bool allowDirect = true, bool cast = false)
    {
        if (localFile != null) return localFile;
        var maximumBitrate = cast ? 40_000_000 : MaximumBitrate;
        var query = new Dictionary<string, string>
        {
            ["UserId"] = request.UserId, ["IsPlayback"] = "true", ["AutoOpenLiveStream"] = "false",
            ["EnableDirectPlay"] = allowDirect ? "true" : "false", ["EnableDirectStream"] = "false", ["EnableTranscoding"] = "true",
            ["MaxStreamingBitrate"] = maximumBitrate.ToString(CultureInfo.InvariantCulture),
            ["StartTimeTicks"] = "0"
        };
        var profile = new
        {
            Name = cast ? "Noctra Chromecast" : "Noctra Windows mpv",
            MaxStreamingBitrate = maximumBitrate,
            TranscodingProfiles = new[]
            {
                new { Type = "Video", Container = "ts", Protocol = "hls", Context = "Streaming", VideoCodec = "h264", AudioCodec = "aac", MaxAudioChannels = "2" },
                new { Type = "Audio", Container = "mp3", Protocol = "http", Context = "Streaming", VideoCodec = "", AudioCodec = "mp3", MaxAudioChannels = "2" }
            },
            DirectPlayProfiles = new[]
            {
                new
                {
                    Type = "Video",
                    Container = cast ? "mp4,m4v,webm" : "mkv,mp4,m4v,mov,webm,avi,mpeg,mpg,ts,mpegts,m2ts,wmv,asf,flv,ogv,vob",
                    VideoCodec = cast ? "h264,vp8,vp9" : "h264,hevc,av1,vp8,vp9,mpeg2video,mpeg4,vc1,wmv3,mjpeg,theora",
                    AudioCodec = cast ? "aac,mp3,opus,vorbis,flac" : "aac,mp3,mp2,ac3,eac3,truehd,dts,flac,vorbis,opus,alac,pcm_s16le,pcm_s24le,pcm_bluray"
                },
                new
                {
                    Type = "Audio",
                    Container = cast ? "mp3,aac,m4a,flac,ogg,opus,webm" : "mp3,aac,m4a,m4b,mp4,flac,ogg,oga,opus,webm,wav,wma,asf,alac,ape,wv,mka,dsf,dff,mpc",
                    VideoCodec = "",
                    AudioCodec = ""
                }
            },
            // Sous-titres texte servis à part (jamais incrustés dans l'image) ; images (PGS, VobSub) gardées dans le fichier.
            SubtitleProfiles = cast ? [] : new[] { "srt", "subrip", "ass", "ssa", "vtt", "webvtt", "sub", "smi", "ttml" }.Select(format => new { Format = format, Method = "External" })
                .Concat(new[] { "srt", "subrip", "ass", "ssa", "vtt", "pgssub", "pgs", "dvdsub", "dvbsub", "mov_text" }.Select(format => new { Format = format, Method = "Embed" })).ToArray()
        };
        using var response = await Post("Items/" + request.ItemId + "/PlaybackInfo", query,
            new { DeviceProfile = profile, EnableDirectPlay = allowDirect, EnableDirectStream = false, EnableTranscoding = true }, cancellation);
        response.EnsureSuccessStatusCode();
        using var payload = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellation), cancellationToken: cancellation);
        var root = payload.RootElement;
        if (!root.TryGetProperty("MediaSources", out var sources) || sources.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("Jellyfin ne propose pas de fichier pour la lecture directe.");
        var candidates = sources.EnumerateArray().Where(source => PlayRequest.Identifier(String(source, "Id"))).ToArray();
        playSessionId = String(root, "PlaySessionId") ?? Guid.NewGuid().ToString("N");
        foreach (var source in candidates)
        {
            var id = String(source, "Id");
            if (!allowDirect || String(source, "Protocol") != "File" ||
                !source.TryGetProperty("SupportsDirectPlay", out var direct) || direct.ValueKind != JsonValueKind.True) continue;
            var container = String(source, "Container")?.Split(',')[0];
            if (container is not { Length: > 0 and <= 12 } || !container.All(char.IsAsciiLetterOrDigit)) continue;
            mediaSourceId = id!;
            CollectSubtitles(source);
            return Url((audio ? "Audio/" : "Videos/") + request.ItemId + "/stream." + container, new()
            {
                ["static"] = "true", ["mediaSourceId"] = mediaSourceId,
                ["playSessionId"] = playSessionId, ["deviceId"] = request.DeviceId
            });
        }
        foreach (var source in candidates)
        {
            var path = String(source, "TranscodingUrl");
            if (string.IsNullOrWhiteSpace(path) || path.StartsWith("//", StringComparison.Ordinal)) continue;
            var stream = path.StartsWith(server.AbsolutePath, StringComparison.Ordinal) ? new Uri(server, path) :
                Uri.TryCreate(path, UriKind.Absolute, out var absolute) && absolute.Scheme is "http" or "https"
                    ? absolute : new Uri(server, path.TrimStart('/'));
            if (!server.IsBaseOf(stream) || stream.UserInfo.Length != 0 ||
                !stream.AbsolutePath.StartsWith(server.AbsolutePath + (audio ? "Audio/" : "Videos/") + request.ItemId + "/", StringComparison.OrdinalIgnoreCase)) continue;
            mediaSourceId = String(source, "Id")!;
            CollectSubtitles(source);
            Method = "Transcode";
            return stream;
        }
        throw new InvalidOperationException("Jellyfin ne propose pas de flux compatible pour ce fichier.");
    }

    private void CollectSubtitles(JsonElement source)
    {
        var found = new List<(Uri, string, string?)>();
        if (source.TryGetProperty("MediaStreams", out var streams) && streams.ValueKind == JsonValueKind.Array)
            foreach (var stream in streams.EnumerateArray())
            {
                if (String(stream, "Type") != "Subtitle" || String(stream, "DeliveryMethod") != "External" ||
                    String(stream, "DeliveryUrl") is not { Length: > 0 and < 600 } path || path.StartsWith("//", StringComparison.Ordinal)) continue;
                var url = path.StartsWith(server.AbsolutePath, StringComparison.Ordinal) ? new Uri(server, path) : new Uri(server, path.TrimStart('/'));
                if (!server.IsBaseOf(url) || url.UserInfo.Length != 0) continue;
                found.Add((url, String(stream, "DisplayTitle") ?? String(stream, "Title") ?? "Sous-titres", String(stream, "Language")));
            }
        ExternalSubtitles = found.Take(40).ToArray();
    }

    internal Uri SubtitleUrl(string mediaSource, int index, string codec) =>
        Url($"Videos/{request.ItemId}/{mediaSource}/Subtitles/{index}/0/Stream." + (codec is "ass" or "ssa" ? "ass" : "srt"), null);

    internal Task Report(string path, double seconds, bool paused)
    {
        if (localFile != null) return Task.CompletedTask;
        var previous = reportQueue;
        return reportQueue = SendReport(previous, path, seconds, paused);
    }

    private async Task SendReport(Task previous, string path, double seconds, bool paused)
    {
        await previous;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try
        {
            using var response = await Post("Sessions/Playing" + path, null, new
            {
                ItemId = request.ItemId, MediaSourceId = mediaSourceId, PlaySessionId = playSessionId,
                PositionTicks = (long)Math.Round(Math.Clamp(double.IsFinite(seconds) ? seconds : 0, 0, 86400) * TimeSpan.TicksPerSecond),
                CanSeek = true, IsPaused = paused, PlayMethod = Method
            }, timeout.Token);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
        {
            // La lecture reste disponible lors d'une coupure du serveur de suivi.
        }
    }

    private async Task<HttpResponseMessage> Post(string path, Dictionary<string, string>? query, object body, CancellationToken cancellation)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, Url(path, query))
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
        };
        message.Headers.TryAddWithoutValidation("Authorization", Jellyfin.Authorization(request.DeviceId, request.Token));
        return await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellation);
    }

    private Uri Url(string path, Dictionary<string, string>? query) => new(server, path +
        (query == null ? "" : "?" + string.Join("&", query.Select(entry => Uri.EscapeDataString(entry.Key) + "=" + Uri.EscapeDataString(entry.Value)))));

    private static string? String(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
