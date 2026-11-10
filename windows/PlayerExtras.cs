using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

// 0.7 : lecteur enrichi : vignettes de la barre de progression (trickplay), sous-titres
// externes et recherche en ligne, vitesse, décalages, format d'image, statistiques,
// mini-lecteur, musique (pochette en grand) et file de lecture.
public partial class MainWindow
{
    private static string MethodLabel(ActivePlayback state) => state.Session.Method switch
    {
        "Offline" => "Hors connexion · fichier local",
        "DirectPlay" => state.Session.Audio ? "Lecture directe · audio" : "Lecture directe",
        _ => "Jellyfin · flux adapté"
    };

    // ---------- Musique : pochette et titre en grand pendant l'écoute ----------

    private void PrepareAudioStage(MediaItem item)
    {
        AudioStage.Visibility = Visibility.Collapsed;
        AudioCover.Source = null;
        AudioBackdrop.Source = null;
        if (!item.IsAudio) return;
        AudioTitle.Text = item.Name;
        AudioArtist.Text = item.AlbumArtist ?? item.Artists?.FirstOrDefault() ?? "";
        AudioAlbum.Text = item.Album ?? "";
        var cover = item.ImageTags?.ContainsKey("Primary") == true || item.AlbumId == null ? item
            : new MediaItem { Id = item.AlbumId, Name = item.Album ?? item.Name, ImageTags = item.AlbumPrimaryImageTag is { } tag ? new() { ["Primary"] = tag } : null };
        _ = artwork?.Load(AudioCover, cover, false, 900, lifetime.Token);
        _ = artwork?.LoadBlurred(AudioBackdrop, cover, false, lifetime.Token);
        if (client is { } account && pendingLocalFile == null) _ = LoadLyrics(account, item);
    }

    // ---------- Paroles synchronisées ----------

    private (double Start, string Text)[] lyrics = [];
    private string? lyricsItem;
    private int lyricIndex = -2;

    private async Task LoadLyrics(Jellyfin account, MediaItem item)
    {
        lyrics = [];
        lyricsItem = item.Id;
        lyricIndex = -2;
        LyricsPanel.Visibility = Visibility.Collapsed;
        try
        {
            var data = await account.ReadJson("Audio/" + item.Id + "/Lyrics", lifetime.Token);
            if (lyricsItem != item.Id) return;
            lyrics = data.List("Lyrics").Where(line => line.Field("Start").ValueKind == JsonValueKind.Number)
                .Select(line => (line.Num("Start") / TimeSpan.TicksPerSecond, line.Str("Text").Trim())).OrderBy(line => line.Item1).ToArray();
            LyricsPanel.Visibility = lyrics.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
    }

    private void UpdateLyrics(ActivePlayback state)
    {
        if (lyrics.Length == 0 || lyricsItem != state.Session.ItemId) return;
        var index = Array.FindLastIndex(lyrics, line => line.Start <= state.Position + .15);
        if (index == lyricIndex) return;
        lyricIndex = index;
        LyricPrevious.Text = index > 0 ? lyrics[index - 1].Text : "";
        LyricCurrent.Text = index >= 0 ? lyrics[index].Text : "♪";
        LyricNext.Text = index + 1 < lyrics.Length ? lyrics[index + 1].Text : "";
        if (SystemParameters.ClientAreaAnimation)
            LyricCurrent.BeginAnimation(OpacityProperty, new System.Windows.Media.Animation.DoubleAnimation(.25, 1, TimeSpan.FromMilliseconds(260)));
    }

    // ---------- Chapitres ----------

    private MenuItem? ChaptersMenu()
    {
        if (active is not { Chapters.Length: > 1 } state) return null;
        var root = new MenuItem { Header = "Chapitres" };
        foreach (var chapter in state.Chapters.Take(80))
        {
            var seconds = chapter.StartPositionTicks / (double)TimeSpan.TicksPerSecond;
            var entry = new MenuItem { Header = FormatTime(seconds) + "   " + (string.IsNullOrWhiteSpace(chapter.Name) ? "Chapitre" : chapter.Name),
                IsCheckable = true, IsChecked = seconds <= state.Position && state.Chapters.All(other => other.StartPositionTicks <= chapter.StartPositionTicks || other.StartPositionTicks / (double)TimeSpan.TicksPerSecond > state.Position) };
            entry.Click += (_, _) => UserSeek(seconds);
            root.Items.Add(entry);
        }
        return root;
    }

    // ---------- Détails de lecture : vignettes de progression ----------

    private sealed class Trickplay(string itemId, string sourceId, int width, TrickplayInfo info)
    {
        internal readonly string ItemId = itemId, SourceId = sourceId;
        internal readonly int Width = width;
        internal readonly TrickplayInfo Info = info;
        internal readonly Dictionary<int, BitmapSource?> Tiles = [];
    }

    private async Task LoadPlaybackDetails(Jellyfin account, MediaItem item, ActivePlayback state)
    {
        if (item.IsAudio) return;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            var detail = await account.PlaybackDetail(item.Id, timeout.Token);
            if (active != state || detail.Trickplay is not { Count: > 0 } map) return;
            var source = map.ContainsKey(state.Session.MediaSourceId) ? state.Session.MediaSourceId : map.Keys.First();
            var sizes = map[source].Where(pair => int.TryParse(pair.Key, NumberStyles.Integer, CultureInfo.InvariantCulture, out _) &&
                pair.Value is { Width: > 0, Height: > 0, TileWidth: > 0, TileHeight: > 0, Interval: > 0, ThumbnailCount: > 0 }).ToArray();
            if (sizes.Length == 0 || !PlayRequest.Identifier(source)) return;
            var best = sizes.OrderBy(pair => Math.Abs(pair.Value.Width - 320)).First();
            state.Thumbnails = new Trickplay(item.Id, source, int.Parse(best.Key, CultureInfo.InvariantCulture), best.Value);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
    }

    private Popup? seekPreview;
    private readonly Image seekImage = new() { Stretch = Stretch.UniformToFill };
    private readonly TextBlock seekTime = new() { FontSize = 13, FontWeight = FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center };
    private readonly Border seekFrame = new() { CornerRadius = new CornerRadius(8), ClipToBounds = true, Margin = new Thickness(0, 0, 0, 7), Background = Brushes.Black };
    private double lastSeekX;

    private void ConfigureSeekPreview()
    {
        RenderOptions.SetBitmapScalingMode(seekImage, BitmapScalingMode.HighQuality);
        seekFrame.Child = seekImage;
        seekTime.Foreground = BrushFor("Ink");
        var panel = new StackPanel();
        panel.Children.Add(seekFrame);
        panel.Children.Add(seekTime);
        seekPreview = new Popup
        {
            AllowsTransparency = true, PlacementTarget = Timeline, Placement = PlacementMode.Relative, IsHitTestVisible = false, Focusable = false,
            Child = new Border { Background = ColorOf("#F0101219"), BorderBrush = ColorOf("#33FFFFFF"), BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12), Padding = new Thickness(6, 6, 6, 5), Child = panel }
        };
        Timeline.MouseMove += (_, args) => ShowSeekPreview(lastSeekX = args.GetPosition(Timeline).X);
        Timeline.MouseLeave += (_, _) => HideSeekPreview();
    }

    private void ShowSeekPreview(double x)
    {
        if (seekPreview == null || active is not { Started: true } state || state.Duration <= 0 || pendingLive != null || !Timeline.IsEnabled)
        {
            HideSeekPreview();
            return;
        }
        var fraction = Math.Clamp((x - 8) / Math.Max(1, Timeline.ActualWidth - 16), 0, 1);
        var seconds = fraction * state.Duration;
        seekTime.Text = FormatTime(seconds);
        var width = 76.0;
        var height = 30.0;
        if (state.Thumbnails is { } thumbnails)
        {
            seekFrame.Visibility = Visibility.Visible;
            seekFrame.Width = Math.Min(240, thumbnails.Info.Width);
            seekFrame.Height = seekFrame.Width * thumbnails.Info.Height / thumbnails.Info.Width;
            if (Thumbnail(thumbnails, seconds, state) is { } frame) seekImage.Source = frame;
            width = seekFrame.Width + 14;
            height += seekFrame.Height + 7;
        }
        else seekFrame.Visibility = Visibility.Collapsed;
        seekPreview.HorizontalOffset = Math.Clamp(x - width / 2, 0, Math.Max(0, Timeline.ActualWidth - width));
        seekPreview.VerticalOffset = -height - 12;
        seekPreview.IsOpen = true;
    }

    private void HideSeekPreview() { if (seekPreview != null) seekPreview.IsOpen = false; }

    private BitmapSource? Thumbnail(Trickplay thumbnails, double seconds, ActivePlayback state)
    {
        var info = thumbnails.Info;
        var index = (int)Math.Clamp(seconds * 1000 / info.Interval, 0, info.ThumbnailCount - 1);
        var perTile = info.TileWidth * info.TileHeight;
        var tile = index / perTile;
        if (!thumbnails.Tiles.TryGetValue(tile, out var bitmap))
        {
            thumbnails.Tiles[tile] = null;
            _ = LoadTile(thumbnails, tile, state);
            return null;
        }
        if (bitmap == null) return null;
        var within = index % perTile;
        var x = within % info.TileWidth * info.Width;
        var y = within / info.TileWidth * info.Height;
        if (x + info.Width > bitmap.PixelWidth || y + info.Height > bitmap.PixelHeight) return null;
        var crop = new CroppedBitmap(bitmap, new Int32Rect(x, y, info.Width, info.Height));
        crop.Freeze();
        return crop;
    }

    private async Task LoadTile(Trickplay thumbnails, int tile, ActivePlayback state)
    {
        if (client is not { } account) return;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            using var response = await account.Image($"Videos/{thumbnails.ItemId}/Trickplay/{thumbnails.Width}/{tile}.jpg?MediaSourceId={thumbnails.SourceId}", timeout.Token);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > 8_000_000) { thumbnails.Tiles.Remove(tile); return; }
            var data = await response.Content.ReadAsByteArrayAsync(timeout.Token);
            var bitmap = await Task.Run(() =>
            {
                var image = new BitmapImage();
                image.BeginInit();
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.StreamSource = new MemoryStream(data);
                image.EndInit();
                image.Freeze();
                return (BitmapSource)image;
            }, timeout.Token);
            thumbnails.Tiles[tile] = bitmap;
            if (active == state && seekPreview?.IsOpen == true) ShowSeekPreview(lastSeekX);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or NotSupportedException or IOException or ArgumentException)
        {
            thumbnails.Tiles.Remove(tile);
        }
    }

    // ---------- Sous-titres ----------

    private static void AddExternalSubtitles(ActivePlayback state, Mpv engine)
    {
        foreach (var (url, title, language) in state.Session.ExternalSubtitles)
        {
            try { engine.CommandAsync("sub-add", url.AbsoluteUri, "auto", title, language ?? ""); }
            catch (InvalidOperationException) { }
        }
    }

    private readonly System.Windows.Threading.DispatcherTimer playerNoticeTimer = new() { Interval = TimeSpan.FromSeconds(6) };
    private void PlayerNotice(string text)
    {
        PlayerHint.Text = text;
        playerNoticeTimer.Stop();
        playerNoticeTimer.Tick -= ClearPlayerNotice;
        playerNoticeTimer.Tick += ClearPlayerNotice;
        playerNoticeTimer.Start();
    }
    private void ClearPlayerNotice(object? sender, EventArgs args) { playerNoticeTimer.Stop(); PlayerHint.Text = ""; }

    private async Task SearchSubtitles(Jellyfin account, ActivePlayback state, string language, Button anchor)
    {
        PlayerNotice("Recherche de sous-titres…");
        JsonElement[] results;
        try { results = (await account.RemoteSubtitles(state.Session.ItemId, language, lifetime.Token)).List(); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            PlayerNotice("Recherche indisponible : le serveur n’a pas d’extension de sous-titres en ligne configurée.");
            return;
        }
        if (active != state) return;
        PlayerNotice(results.Length == 0 ? "Aucun sous-titre trouvé dans cette langue." : results.Length + " sous-titre(s) trouvé(s).");
        var menu = new ContextMenu { PlacementTarget = anchor, Placement = PlacementMode.Top };
        if (results.Length == 0) menu.Items.Add(new MenuItem { Header = "Aucun sous-titre trouvé", IsEnabled = false });
        foreach (var result in results.Take(18))
        {
            var id = result.Str("Id");
            if (id.Length is 0 or > 400) continue;
            var downloads = result.Num("DownloadCount");
            var entry = new MenuItem { Header = string.Join(" · ", new[] { result.Str("Name"), result.Str("ProviderName"), result.Str("Format"),
                downloads > 0 ? downloads.ToString("N0", CultureInfo.CurrentCulture) + " téléchargements" : "" }.Where(part => part.Length > 0)) };
            entry.Click += (_, _) => _ = DownloadSubtitle(account, state, id);
            menu.Items.Add(entry);
        }
        trackMenu = menu;
        menu.IsOpen = true;
    }

    private async Task DownloadSubtitle(Jellyfin account, ActivePlayback state, string subtitle)
    {
        PlayerNotice("Téléchargement du sous-titre par le serveur…");
        try
        {
            static HashSet<int> External(MediaItem item, string source) => (item.MediaSources?.FirstOrDefault(entry => entry.Id == source) ?? item.MediaSources?.FirstOrDefault())?
                .MediaStreams?.Where(stream => stream.Type == "Subtitle" && stream.IsExternal).Select(stream => stream.Index).ToHashSet() ?? [];
            var before = External(await account.PlaybackDetail(state.Session.ItemId, lifetime.Token), state.Session.MediaSourceId);
            await account.DownloadSubtitle(state.Session.ItemId, subtitle, lifetime.Token);
            for (var attempt = 0; attempt < 10 && active == state; attempt++)
            {
                await Task.Delay(1500, lifetime.Token);
                var detail = await account.PlaybackDetail(state.Session.ItemId, lifetime.Token);
                var source = detail.MediaSources?.FirstOrDefault(entry => entry.Id == state.Session.MediaSourceId) ?? detail.MediaSources?.FirstOrDefault();
                var added = source?.MediaStreams?.FirstOrDefault(stream => stream.Type == "Subtitle" && stream.IsExternal && !before.Contains(stream.Index));
                if (added == null || source?.Id is not { } sourceId || !PlayRequest.Identifier(sourceId)) continue;
                if (active != state || state.Engine is not { } engine) return;
                engine.CommandAsync("sub-add", state.Session.SubtitleUrl(sourceId, added.Index, added.Codec ?? "srt").AbsoluteUri, "select",
                    added.DisplayTitle ?? added.Title ?? "Sous-titres téléchargés", added.Language ?? "");
                PlayerNotice("Sous-titre ajouté et activé.");
                return;
            }
            PlayerNotice("Sous-titre enregistré par le serveur : il sera proposé à la prochaine lecture.");
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            PlayerNotice("Le serveur n’a pas pu télécharger ce sous-titre.");
        }
    }

    // ---------- Réglages du lecteur ----------

    private void PlayerSettings(object sender, RoutedEventArgs args)
    {
        var button = (Button)sender;
        var engine = CurrentEngine;
        if (engine == null) return;
        var menu = new ContextMenu { PlacementTarget = button, Placement = PlacementMode.Top };
        var live = pendingLive != null;
        var speed = new MenuItem { Header = SyncControls ? "Vitesse de lecture (réglée par le groupe)" : "Vitesse de lecture", IsEnabled = !live && !SyncControls };
        var current = engine.Seconds("speed") ?? 1;
        foreach (var value in new[] { .5, .75, 1, 1.25, 1.5, 1.75, 2 })
        {
            var entry = new MenuItem { Header = value == 1 ? "Normale" : "×" + value.ToString("0.##", CultureInfo.CurrentCulture), IsCheckable = true, IsChecked = Math.Abs(current - value) < .01 };
            entry.Click += (_, _) => SetSpeed(value);
            speed.Items.Add(entry);
        }
        menu.Items.Add(speed);
        if (ChaptersMenu() is { } chapters) menu.Items.Add(chapters);
        menu.Items.Add(DelayMenu(engine, "Décalage des sous-titres", "sub-delay"));
        menu.Items.Add(DelayMenu(engine, "Décalage audio", "audio-delay"));
        var aspect = new MenuItem { Header = "Format de l’image", IsEnabled = active?.Session.Audio != true };
        foreach (var (label, ratio, panscan) in new[] { ("Automatique", "-1", "0"), ("Remplir l’écran (rogner)", "-1", "1"), ("16:9", "16:9", "0"), ("4:3", "4:3", "0"), ("2.39:1 (cinémascope)", "2.39", "0") })
        {
            var entry = new MenuItem { Header = label };
            entry.Click += (_, _) => { Command("set", "video-aspect-override", ratio); Command("set", "panscan", panscan); };
            aspect.Items.Add(entry);
        }
        menu.Items.Add(aspect);
        menu.Items.Add(new Separator());
        var stats = new MenuItem { Header = "Statistiques de lecture · I", IsCheckable = true, IsChecked = statsPopup?.IsOpen == true };
        stats.Click += (_, _) => ShowStats(statsPopup?.IsOpen != true);
        menu.Items.Add(stats);
        var mini = new MenuItem { Header = miniPlayer ? "Quitter le mini-lecteur · P" : "Mini-lecteur au premier plan · P" };
        mini.Click += (_, _) => SetMiniPlayer(!miniPlayer);
        menu.Items.Add(mini);
        trackMenu = menu;
        menu.IsOpen = true;
    }

    private MenuItem DelayMenu(Mpv engine, string title, string property)
    {
        var value = engine.Seconds(property) ?? 0;
        var root = new MenuItem { Header = title + " (" + value.ToString("+0.0;−0.0;0", CultureInfo.CurrentCulture) + " s)" };
        foreach (var (label, delta) in new[] { ("−0,5 s", -.5), ("−0,1 s", -.1), ("+0,1 s", .1), ("+0,5 s", .5) })
        {
            var entry = new MenuItem { Header = label };
            entry.Click += (_, _) => Command("add", property, delta.ToString("0.0", CultureInfo.InvariantCulture));
            root.Items.Add(entry);
        }
        var reset = new MenuItem { Header = "Réinitialiser" };
        reset.Click += (_, _) => Command("set", property, "0");
        root.Items.Add(reset);
        return root;
    }

    // ---------- Statistiques ----------

    private Popup? statsPopup;
    private TextBlock? statsText;
    private DateTime nextStats;

    private void ShowStats(bool show)
    {
        if (!show || pendingMedia == null && pendingLive == null)
        {
            if (statsPopup != null) statsPopup.IsOpen = false;
            return;
        }
        if (statsPopup == null)
        {
            statsText = new TextBlock { FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 12, Foreground = ColorOf("#E6E8F0"),
                LineHeight = 19, LineStackingStrategy = LineStackingStrategy.BlockLineHeight };
            AutomationProperties.SetAutomationId(statsText, "PlaybackStats");
            var title = new TextBlock { Text = "STATISTIQUES", FontSize = 10, FontWeight = FontWeights.Bold, Foreground = BrushFor("Accent"), Margin = new Thickness(0, 0, 0, 8) };
            var body = new StackPanel();
            body.Children.Add(title);
            body.Children.Add(statsText);
            statsPopup = new Popup
            {
                // Fenêtre visible des outils d'accessibilité (une fenêtre « traversable » en est exclue).
                AllowsTransparency = true, Placement = PlacementMode.Relative, HorizontalOffset = 18, VerticalOffset = 18, Focusable = false,
                Child = new Border { Background = ColorOf("#E0090A10"), BorderBrush = ColorOf("#33FFFFFF"), BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(12), Padding = new Thickness(16, 12, 18, 12), Child = body }
            };
        }
        statsPopup.PlacementTarget = VideoHost.Visibility == Visibility.Visible ? VideoHost : Player;
        statsPopup.IsOpen = true;
        nextStats = DateTime.MinValue;
        if (CurrentEngine is { } engine) UpdateStats(engine, active);
    }

    private void UpdateStats(Mpv engine, ActivePlayback? state)
    {
        if (statsPopup?.IsOpen != true || statsText == null || DateTime.UtcNow < nextStats) return;
        nextStats = DateTime.UtcNow.AddMilliseconds(500);
        static string Number(double? value, string format) => value is double number && double.IsFinite(number) ? number.ToString(format, CultureInfo.CurrentCulture) : "—";
        static string Rate(double? bits) => bits is > 0 ? (bits.Value / 1_000_000).ToString("0.0", CultureInfo.CurrentCulture) + " Mb/s" : "—";
        var lines = new List<string> { "Mode          " + (state != null ? MethodLabel(state) : "Direct TV") };
        if (state?.Session.Audio != true)
        {
            lines.Add("Vidéo         " + Number(engine.Seconds("video-params/w"), "0") + " × " + Number(engine.Seconds("video-params/h"), "0") + " · " +
                (engine.Text("video-codec") ?? "—") + " · " + Number(engine.Seconds("estimated-vf-fps") ?? engine.Seconds("container-fps"), "0.###") + " i/s");
            lines.Add("Plage         " + (engine.Text("video-params/gamma") is "pq" or "hlg" ? "HDR (" + engine.Text("video-params/gamma") + ")" : "SDR"));
            lines.Add("Décodage      " + (engine.Text("hwdec-current") is { Length: > 0 } hardware && hardware != "no" ? "matériel · " + hardware : "logiciel"));
            lines.Add("Débit vidéo   " + Rate(engine.Seconds("video-bitrate")));
        }
        lines.Add("Audio         " + (engine.Text("audio-codec-name") ?? "—") + " · " + Number(engine.Seconds("audio-params/channel-count"), "0") +
            " canaux · " + Number(engine.Seconds("audio-params/samplerate"), "0") + " Hz · " + Rate(engine.Seconds("audio-bitrate")));
        lines.Add("Mémoire       " + Number(engine.Seconds("demuxer-cache-duration"), "0.0") + " s d’avance");
        if (state?.Session.Audio != true)
            lines.Add("Images        " + Number(engine.Seconds("frame-drop-count"), "0") + " perdues · " + Number(engine.Seconds("decoder-frame-drop-count"), "0") + " au décodage");
        lines.Add("Affichage     " + Number(engine.Seconds("display-fps"), "0.##") + " Hz · vitesse × " + Number(engine.Seconds("speed"), "0.00"));
        if (state?.Synchronized == true && syncGroup != null)
            lines.Add("SyncPlay      écart " + SyncDriftReadout.ToString("+0.00;−0.00;0.00", CultureInfo.CurrentCulture) + " s · ping " + syncPing + " ms");
        statsText.Text = string.Join("\n", lines);
    }

    // ---------- Mini-lecteur ----------

    private bool miniPlayer;
    private Rect miniRestoreBounds;
    private WindowState miniRestoreState;
    private double miniRestoreMinWidth, miniRestoreMinHeight;
    private bool miniRestoreTopmost;

    private void SetMiniPlayer(bool enabled)
    {
        if (enabled == miniPlayer || enabled && pendingMedia == null && pendingLive == null) return;
        if (enabled)
        {
            if (fullscreen) SetFullscreen(false);
            miniRestoreState = WindowState;
            miniRestoreBounds = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            miniRestoreMinWidth = MinWidth;
            miniRestoreMinHeight = MinHeight;
            miniRestoreTopmost = Topmost;
            miniPlayer = true;
            WindowState = WindowState.Normal;
            MinWidth = 320;
            MinHeight = 180;
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            var screen = Forms.Screen.FromHandle(handle).WorkingArea;
            var scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
            Width = 544;
            Height = 306;
            Left = screen.Right / scale - Width - 24;
            Top = screen.Bottom / scale - Height - 24;
            Topmost = true;
            FrameHeader.Visibility = Visibility.Collapsed;
            PlayerHeader.Visibility = Visibility.Collapsed;
            foreach (var element in new UIElement[] { VolumeControl, PositionLabel, BackwardButton, ForwardButton })
                element.Visibility = Visibility.Collapsed;
            SizeHeader();
            AttachFloatingControls();
            MiniButton.Content = "";
            AutomationProperties.SetName(MiniButton, "Quitter le mini-lecteur");
            WakeFullscreenControls(force: true);
        }
        else
        {
            miniPlayer = false;
            Topmost = miniRestoreTopmost;
            MinWidth = miniRestoreMinWidth;
            MinHeight = miniRestoreMinHeight;
            Left = miniRestoreBounds.Left;
            Top = miniRestoreBounds.Top;
            Width = miniRestoreBounds.Width;
            Height = miniRestoreBounds.Height;
            WindowState = miniRestoreState;
            FrameHeader.Visibility = Visibility.Visible;
            PlayerHeader.Visibility = Visibility.Visible;
            VolumeControl.Visibility = PositionLabel.Visibility = Visibility.Visible;
            if (pendingLive == null)
            {
                BackwardButton.Visibility = ForwardButton.Visibility = Visibility.Visible;
                RestoreDockedControls();
            }
            else WakeFullscreenControls(force: true);
            MiniButton.Content = "";
            AutomationProperties.SetName(MiniButton, "Mini-lecteur");
            SizeHeader();
        }
    }

    private void ToggleMiniPlayer(object sender, RoutedEventArgs args) => SetMiniPlayer(!miniPlayer);

    // Mini-lecteur : la vidéo sert de poignée pour déplacer la fenêtre.
    private bool DragMiniPlayer()
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        ReleaseCapture();
        SendMessage(handle, 0x00A1, (IntPtr)2, IntPtr.Zero);
        return true;
    }
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);
}
