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

internal sealed class JellyfinPlayback(HttpClient http, Uri server, PlayRequest request)
{
    internal string MediaAuthorization => Jellyfin.Authorization(request.DeviceId, request.Token);
    internal double StartSeconds => request.StartTicks / (double)TimeSpan.TicksPerSecond;
    internal string Method { get; private set; } = "DirectPlay";
    private string mediaSourceId = "";
    private string playSessionId = "";
    private Task reportQueue = Task.CompletedTask;
    private const int MaximumBitrate = 200_000_000;

    internal async Task<Uri> Prepare(CancellationToken cancellation, bool allowDirect = true, bool cast = false)
    {
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
            TranscodingProfiles = new[] { new { Type = "Video", Container = "ts", Protocol = "hls", Context = "Streaming",
                VideoCodec = "h264", AudioCodec = "aac", MaxAudioChannels = "2" } },
            DirectPlayProfiles = new[]
            {
                new
                {
                    Type = "Video",
                    Container = cast ? "mp4,m4v,webm" : "mkv,mp4,m4v,mov,webm,avi,mpeg,mpg,ts,mpegts,m2ts,wmv,asf,flv,ogv,vob",
                    VideoCodec = cast ? "h264,vp8,vp9" : "h264,hevc,av1,vp8,vp9,mpeg2video,mpeg4,vc1,wmv3,mjpeg,theora",
                    AudioCodec = cast ? "aac,mp3,opus,vorbis,flac" : "aac,mp3,mp2,ac3,eac3,truehd,dts,flac,vorbis,opus,alac,pcm_s16le,pcm_s24le,pcm_bluray"
                }
            }
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
            return Url("Videos/" + request.ItemId + "/stream." + container, new()
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
                !stream.AbsolutePath.StartsWith(server.AbsolutePath + "Videos/" + request.ItemId + "/", StringComparison.OrdinalIgnoreCase)) continue;
            mediaSourceId = String(source, "Id")!;
            Method = "Transcode";
            return stream;
        }
        throw new InvalidOperationException("Jellyfin ne propose pas de flux compatible pour ce fichier.");
    }

    internal Task Report(string path, double seconds, bool paused)
    {
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
