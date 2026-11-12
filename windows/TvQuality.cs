using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;

namespace Noctra.Windows;

internal sealed record TvVideoQuality(int Id, int Height, int Width, double Rate, double Bitrate, string? Codec, bool Selected, int? Program)
{
    internal string Label => string.Join(" · ", new[] { Height > 0 ? $"{Height}p" : $"Piste vidéo {Id}",
        Rate > 0 ? Rate.ToString("0.##", CultureInfo.InvariantCulture) + " images/s" : null,
        Bitrate > 0 ? (Bitrate / 1_000_000).ToString("0.##", CultureInfo.InvariantCulture) + " Mb/s" : null, Codec }.Where(value => value != null));
}

internal static class TvQuality
{
    internal static TvVideoQuality[] Read(Mpv engine)
    {
        var result = new List<TvVideoQuality>();
        var count = (int)Math.Clamp(engine.Seconds("track-list/count") ?? 0, 0, 1000);
        for (var index = 0; index < count; index++)
        {
            var prefix = "track-list/" + index.ToString(CultureInfo.InvariantCulture) + "/";
            if (engine.Text(prefix + "type") != "video" || engine.Flag(prefix + "albumart") || engine.Flag(prefix + "image")) continue;
            result.Add(new((int)(engine.Seconds(prefix + "id") ?? 0), (int)(engine.Seconds(prefix + "demux-h") ?? 0),
                (int)(engine.Seconds(prefix + "demux-w") ?? 0), engine.Seconds(prefix + "demux-fps") ?? 0,
                engine.Seconds(prefix + "hls-bitrate") ?? engine.Seconds(prefix + "demux-bitrate") ?? 0,
                engine.Text(prefix + "codec"), engine.Flag(prefix + "selected"), (int?)engine.Seconds(prefix + "program-id")));
        }
        return result.OrderByDescending(item => item.Height).ThenByDescending(item => item.Bitrate).ThenBy(item => item.Id).ToArray();
    }
    internal static void Select(Mpv engine, TvVideoQuality quality)
    {
        var language = engine.Text("current-tracks/audio/lang");
        engine.Command("set", "vid", quality.Id.ToString(CultureInfo.InvariantCulture));
        if (quality.Program is not { } program) return;
        // Muxed renditions have their own audio; keep the selected language within the same program.
        var candidates = new List<(int Id, bool Preferred)>();
        var count = (int)Math.Clamp(engine.Seconds("track-list/count") ?? 0, 0, 1000);
        for (var index = 0; index < count; index++)
        {
            var prefix = "track-list/" + index.ToString(CultureInfo.InvariantCulture) + "/";
            if (engine.Text(prefix + "type") == "audio" && engine.Seconds(prefix + "program-id") == program)
                candidates.Add(((int)(engine.Seconds(prefix + "id") ?? 0), engine.Text(prefix + "lang") == language));
        }
        if (candidates.Count > 0) engine.Command("set", "aid", candidates.OrderByDescending(item => item.Preferred).First().Id.ToString(CultureInfo.InvariantCulture));
    }
}

public partial class MainWindow
{
    private void ChooseLiveQuality(object sender, RoutedEventArgs args)
    {
        if (pendingLive is not { Engine: { } engine } state) return;
        WakeFullscreenControls(force: true);
        var menu = new ContextMenu { Background = ColorOf("#1A1D29"), Foreground = BrushFor("Ink"), PlacementTarget = LiveQualityButton, Placement = PlacementMode.Top, MaxHeight = 450 };
        var qualities = TvQuality.Read(engine);
        var automatic = new MenuItem { Header = "Auto · meilleure qualité disponible", IsCheckable = true, IsChecked = state.AutomaticQuality };
        automatic.Click += (_, _) =>
        {
            if (pendingLive != state || state.Engine != engine) return;
            if (qualities.FirstOrDefault() is { } best) TvQuality.Select(engine, best);
            state.AutomaticQuality = true;
        };
        menu.Items.Add(automatic);
        foreach (var quality in qualities)
        {
            var item = new MenuItem { Header = quality.Label, IsCheckable = true, IsChecked = !state.AutomaticQuality && quality.Selected };
            item.Click += (_, _) =>
            {
                if (pendingLive != state || state.Engine != engine) return;
                TvQuality.Select(engine, quality); state.AutomaticQuality = false;
            };
            menu.Items.Add(item);
        }
        menu.Items.Add(new Separator());
        menu.Items.Add(new MenuItem { Header = qualities.Length > 1 ? "Qualités annoncées par ce flux · le serveur peut varier" : "Ce flux propose une seule qualité · essayez un autre serveur pour plus", IsEnabled = false });
        trackMenu = menu; menu.IsOpen = true;
    }
}
