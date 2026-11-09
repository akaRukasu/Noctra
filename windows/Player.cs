using System;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

public partial class MainWindow
{
    // 0.6 : icône lecture / pause ; le nom accessible reste « Pause » ou « Reprendre ».
    private void ShowPauseState(bool paused)
    {
        var glyph = paused ? "\uE768" : "\uE769";
        var name = paused ? "Reprendre" : "Pause";
        if (!Equals(PauseButton.Content, glyph)) PauseButton.Content = glyph;
        if (System.Windows.Automation.AutomationProperties.GetName(PauseButton) != name)
        {
            System.Windows.Automation.AutomationProperties.SetName(PauseButton, name);
            PauseButton.ToolTip = name + " · Espace";
        }
    }

    private readonly Forms.Panel surface = new() { BackColor = System.Drawing.Color.Black, AccessibleName = "Surface vidéo", AccessibleRole = Forms.AccessibleRole.Pane };
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(200) };
    private MediaItem? pendingMedia;
    private LivePlayback? pendingLive;
    private ActivePlayback? active;
    private CancellationTokenSource? installation;
    private bool seeking;
    private bool fullscreen;
    private ContextMenu? trackMenu;
    private Task stopping = Task.CompletedTask;

    private void ConfigurePlayer()
    {
        VideoHost.Child = surface;
        ConfigureFullscreen();
        timer.Tick += (_, _) => TickPlayer();
    }

    private void StartPlayback(MediaItem item)
    {
        if (client == null || active != null || pendingMedia != null || pendingLive != null || closing || !item.CanPlay) return;
        externalPlayer?.Close();
        externalPlayer = null;
        pendingMedia = item;
        MediaTitle.Text = item.Type == "Episode" ? item.DisplayTitle + " · " + item.Caption : item.DisplayTitle;
        LibraryShell.Visibility = Visibility.Collapsed;
        Player.Visibility = Visibility.Visible;
        Timeline.Value = 0;
        Timeline.IsEnabled = false;
        PositionLabel.Text = "";
        SkipCredits.Visibility = Visibility.Collapsed;
        PlaybackMode.Text = "";
        ShowPauseState(false);
        if (File.Exists(Mpv.LibraryPath)) _ = OpenPlayback(item);
        else InstallPlayer(this, new RoutedEventArgs());
    }

    private async Task OpenPlayback(MediaItem item)
    {
        var account = client;
        if (account == null || pendingMedia != item || closing) return;
        var request = new PlayRequest(item.Id, account.User.Id, account.Token, account.DeviceId, item.Resume);
        if (!request.IsValid())
        {
            Notice("La vidéo ne peut pas être ouverte avec cette session.");
            return;
        }
        var state = new ActivePlayback(new JellyfinPlayback(Jellyfin.Http, account.Root, request))
        {
            Software = !preferences.HardwareDecoding
        };
        active = state;
        Notice("Ouverture de la vidéo…");
        await stopping;
        if (active != state) return;
        _ = FindCredits(account, item, state);
        await LoadMedia(state, allowDirect: true);
    }

    private async Task FindCredits(Jellyfin account, MediaItem item, ActivePlayback state)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        MediaSegment[] credits = [];
        try
        {
            credits = await account.Credits(item.Id, timeout.Token);
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException) { }
        if (active != state) return;
        var chapters = item.Chapters ?? [];
        if (credits.Length == 0 && chapters.Length == 0)
        {
            try { chapters = (await account.Detail(item.Id, state.Cancellation.Token)).Chapters ?? []; }
            catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException) { }
        }
        var named = chapters.OrderBy(chapter => chapter.StartPositionTicks).ToArray();
        var fallback = new System.Collections.Generic.List<MediaSegment>();
        for (var index = 0; index < named.Length; index++)
        {
            var title = named[index].Name ?? "";
            var type = Regex.IsMatch(title, @"(?i)(outro|credits|crédits|ending|générique de fin)") ? "Outro" :
                Regex.IsMatch(title, @"(?i)(^intro|opening|générique|generique|^op\d*$)") ? "Intro" : null;
            var end = index + 1 < named.Length ? named[index + 1].StartPositionTicks : item.RunTimeTicks ?? 0;
            var length = end - named[index].StartPositionTicks;
            if (type != null && length is >= 5 * TimeSpan.TicksPerSecond and <= 900 * TimeSpan.TicksPerSecond &&
                !credits.Any(segment => segment.Type == type))
                fallback.Add(new MediaSegment(type, named[index].StartPositionTicks, end));
        }
        if (active == state) state.Credits = credits.Concat(fallback).ToArray();
    }

    private async Task LoadMedia(ActivePlayback state, bool allowDirect)
    {
        state.Cancellation.CancelAfter(TimeSpan.FromSeconds(40));
        try
        {
            var media = await state.Session.Prepare(state.Cancellation.Token, allowDirect);
            if (active != state) return;
            VideoHost.Visibility = Visibility.Visible;
            PlaybackNotice.Visibility = Visibility.Collapsed;
            PlayerControls.Visibility = Visibility.Visible;
            PlaybackMode.Text = state.Session.Method == "DirectPlay" ? "Lecture directe" : "Lecture adaptée par Jellyfin";
            await Dispatcher.InvokeAsync(() => VideoHost.UpdateLayout(), DispatcherPriority.Loaded);
            if (active != state) return;
            state.Engine = new Mpv(surface.Handle, state.Session.MediaAuthorization, state.Session.StartSeconds, software: state.Software);
            ApplyPlayerPreferences(state.Engine);
            state.Engine.Load(media);
            timer.Start();
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            if (active != state) return;
            if (!state.TriedFallback && error is not DllNotFoundException and not BadImageFormatException)
                RetryWithTranscoding(state);
            else FailPlayback(error is HttpRequestException { StatusCode: System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden }
                ? "La session n’autorise pas cette vidéo. Reconnectez-vous à votre compte."
                : error is DllNotFoundException or BadImageFormatException ? "Le lecteur mpv est manquant ou incompatible."
                : "Jellyfin n’a pas pu préparer cette lecture. Vérifiez la disponibilité du fichier et réessayez.");
        }
    }

    private void TickPlayer()
    {
        if (pendingLive?.Engine != null)
        {
            TickLive(pendingLive);
            return;
        }
        var state = active;
        var engine = state?.Engine;
        if (state == null || engine == null) return;
        foreach (var (kind, eof) in engine.Poll())
        {
            if (kind == Mpv.Event.PlaybackRestart && !state.Started)
            {
                state.Started = true;
                state.Cancellation.CancelAfter(Timeout.InfiniteTimeSpan);
                state.Position = engine.Seconds("time-pos") ?? state.Session.StartSeconds;
                state.NextReport = DateTime.UtcNow.AddSeconds(8);
                ApplyPlayerPreferences(engine);
                CorrectVideoDisplay();
                var height = engine.Seconds("height");
                PlaybackMode.Text = (state.Session.Method == "DirectPlay" ? "Lecture directe" : "Jellyfin · flux adapté") +
                    (height is > 0 ? $" · {height:0}p" : "");
                _ = state.Session.Report("", state.Position, false);
            }
            else if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown)
            {
                if (!state.Started && !state.Software)
                {
                    RetrySoftware(state);
                    return;
                }
                if (!state.Started && state.Session.Method == "DirectPlay" && !state.TriedFallback)
                {
                    RetryWithTranscoding(state);
                    return;
                }
                if (eof && state.Started)
                {
                    state.Position = engine.Seconds("duration") ?? state.Duration;
                    FinishPlayback(capture: false);
                }
                else FailPlayback("Le lecteur a interrompu la vidéo. " + (engine.LastError ?? "Essayez à nouveau."));
                return;
            }
        }
        if (!state.Started)
        {
            if (state.Cancellation.IsCancellationRequested)
            {
                if (state.Session.Method == "DirectPlay" && !state.TriedFallback) RetryWithTranscoding(state);
                else FailPlayback();
            }
            return;
        }
        state.Position = engine.Seconds("time-pos") ?? state.Position;
        state.Duration = engine.Seconds("duration") ?? state.Duration;
        var positionTicks = state.Position * TimeSpan.TicksPerSecond;
        state.CurrentCredits = state.Credits.FirstOrDefault(segment => segment.StartTicks <= positionTicks &&
            segment.EndTicks - TimeSpan.TicksPerMillisecond * 250 > positionTicks);
        SkipCredits.Visibility = state.CurrentCredits != null ? Visibility.Visible : Visibility.Collapsed;
        var paused = engine.Paused;
        ShowPauseState(paused);
        if (!seeking && state.Duration > 0)
        {
            Timeline.Maximum = state.Duration;
            Timeline.Value = state.Position;
            Timeline.IsEnabled = true;
        }
        PositionLabel.Text = FormatTime(state.Position) + " / " + FormatTime(state.Duration);
        if (state.NextReport <= DateTime.UtcNow || paused != state.Paused)
        {
            state.Paused = paused;
            state.NextReport = DateTime.UtcNow.AddSeconds(8);
            _ = state.Session.Report("/Progress", state.Position, paused);
        }
    }

    private void RetryWithTranscoding(ActivePlayback state)
    {
        timer.Stop();
        state.Engine?.Dispose();
        state.Engine = null;
        state.Cancellation.Dispose();
        state.Cancellation = new CancellationTokenSource();
        state.TriedFallback = true;
        Notice("Jellyfin prépare une version compatible de la vidéo…");
        _ = LoadMedia(state, allowDirect: false);
    }

    private void Notice(string message, bool install = false)
    {
        VideoHost.Visibility = Visibility.Collapsed;
        PlayerControls.Visibility = Visibility.Collapsed;
        PlayerMessage.Text = message;
        RetryPlaybackButton.Visibility = Visibility.Collapsed;
        OpeningProgress.Visibility = install ? Visibility.Collapsed : Visibility.Visible;
        InstallButton.Visibility = install ? Visibility.Visible : Visibility.Collapsed;
        PlaybackNotice.Visibility = Visibility.Visible;
    }

    private void FailPlayback(string? message = null)
    {
        ReleasePlayback();
        if (fullscreen) SetFullscreen(false);
        PlaybackMode.Text = "";
        Notice(message ?? "Cette vidéo n’a pas pu être lue. Vérifiez sa disponibilité dans Jellyfin.");
        OpeningProgress.Visibility = Visibility.Collapsed;
        RetryPlaybackButton.Visibility = Visibility.Visible;
    }

    private void RetryPlayback(object sender, RoutedEventArgs args)
    {
        if (pendingMedia is { } item) _ = OpenPlayback(item);
        else if (pendingLive is { } live) { live.Next = 0; OpenLive(live); }
    }

    private void RetrySoftware(ActivePlayback state)
    {
        timer.Stop();
        state.Engine?.Dispose();
        state.Engine = null;
        state.Software = true;
        Notice("Ouverture avec le décodage de secours…");
        _ = LoadMedia(state, allowDirect: !state.TriedFallback);
    }

    private void ReleasePlayback(bool capture = true)
    {
        timer.Stop();
        var state = active;
        if (state == null) return;
        active = null;
        state.Cancellation.Cancel();
        if (state.Started)
        {
            if (capture) state.Position = state.Engine?.Seconds("time-pos") ?? state.Position;
            stopping = state.Session.Report("/Stopped", state.Position, state.Paused);
        }
        state.Engine?.Dispose();
        state.Cancellation.Dispose();
    }

    private void FinishPlayback(bool capture = true)
    {
        if (pendingLive is { } live)
        {
            installation?.Cancel();
            timer.Stop();
            live.Engine?.Dispose();
            pendingLive = null;
            LiveQualityButton.Visibility = Visibility.Collapsed;
            BackwardButton.Visibility = ForwardButton.Visibility = Timeline.Visibility = Visibility.Visible;
            PositionLabel.MinWidth = 118;
            if (fullscreen) SetFullscreen(false);
            RestoreDockedControls();
            Player.Visibility = Visibility.Collapsed;
            if (!closing) LibraryShell.Visibility = Visibility.Visible;
            return;
        }
        if (pendingMedia == null && active == null) return;
        installation?.Cancel();
        ReleasePlayback(capture);
        pendingMedia = null;
        seeking = false;
        if (fullscreen) SetFullscreen(false);
        Player.Visibility = Visibility.Collapsed;
        if (closing) return;
        LibraryShell.Visibility = Visibility.Visible;
        _ = RefreshAfterPlayback(page);
    }

    private async Task RefreshAfterPlayback(Page? destination)
    {
        var account = client;
        await stopping;
        if (!closing && account != null && account == client && destination != null && destination == page && pendingMedia == null)
            await Navigate(destination, back: true);
    }

    private void Command(params string[] command)
    {
        var engine = active is { Started: true } ? active.Engine : pendingLive is { Started: true } ? pendingLive.Engine : null;
        if (engine == null) return;
        try { engine.Command(command); }
        catch (InvalidOperationException) { PlaybackMode.Text = "Commande indisponible pour cette vidéo."; }
    }

    private void StopPlayback(object sender, RoutedEventArgs args) => FinishPlayback();
    private void TogglePause(object sender, RoutedEventArgs args) => Command("cycle", "pause");
    private void BackFifteen(object sender, RoutedEventArgs args) => Command("seek", "-15", "relative");
    private void ForwardFifteen(object sender, RoutedEventArgs args) => Command("seek", "15", "relative");
    private void AudioTrack(object sender, RoutedEventArgs args) => ShowTracks((Button)sender, "audio");
    private void SubtitleTrack(object sender, RoutedEventArgs args) => ShowTracks((Button)sender, "sub");
    private Mpv? CurrentEngine => active?.Engine ?? pendingLive?.Engine;
    private void ShowTracks(Button button, string type)
    {
        var engine = CurrentEngine;
        if (engine == null) return;
        var menu = new ContextMenu { Background = ColorOf("#1A1D29"), Foreground = BrushFor("Ink"),
            PlacementTarget = button, Placement = PlacementMode.Top };
        if (type == "sub")
        {
            var off = new MenuItem { Header = "Désactiver les sous-titres" };
            off.Click += (_, _) => Command("set", "sid", "no");
            menu.Items.Add(off);
        }
        var count = (int)Math.Clamp(engine.Seconds("track-list/count") ?? 0, 0, 100);
        for (var index = 0; index < count; index++)
        {
            var prefix = "track-list/" + index.ToString(CultureInfo.InvariantCulture) + "/";
            if (engine.Text(prefix + "type") != type) continue;
            var id = (int)(engine.Seconds(prefix + "id") ?? 0);
            var label = engine.Text(prefix + "title");
            var lang = engine.Text(prefix + "lang");
            var codec = engine.Text(prefix + "codec");
            var entry = new MenuItem
            {
                Header = string.Join(" · ", new[] { label ?? $"Piste {id}", lang, codec }.Where(value => !string.IsNullOrWhiteSpace(value))),
                IsCheckable = true, IsChecked = engine.Flag(prefix + "selected")
            };
            entry.Click += (_, _) => Command("set", type == "audio" ? "aid" : "sid", id.ToString(CultureInfo.InvariantCulture));
            menu.Items.Add(entry);
        }
        if (menu.Items.Count == 0) menu.Items.Add(new MenuItem { Header = "Aucune autre piste disponible", IsEnabled = false });
        trackMenu = menu;
        menu.IsOpen = true;
    }
    private void MutePlayer(object sender, RoutedEventArgs args) => Command("cycle", "mute");
    private void ChangeVolume(object sender, RoutedPropertyChangedEventArgs<double> args)
    {
        preferences = preferences with { Volume = args.NewValue };
        Command("set", "volume", args.NewValue.ToString("0", CultureInfo.InvariantCulture));
    }
    private void SkipCreditsClick(object sender, RoutedEventArgs args)
    {
        if (active?.CurrentCredits is { } segment)
            Command("seek", (segment.EndTicks / (double)TimeSpan.TicksPerSecond).ToString("0.000", CultureInfo.InvariantCulture), "absolute+exact");
    }
    private void Fullscreen(object sender, RoutedEventArgs args) => SetFullscreen(!fullscreen);
    private void BeginSeek(object sender, MouseButtonEventArgs args) => seeking = true;
    private void EndSeek(object sender, MouseButtonEventArgs args) { seeking = false; Seek(); }
    private void SeekKey(object sender, KeyEventArgs args) { if (args.Key is Key.Left or Key.Right or Key.Home or Key.End) Seek(); }
    private void Seek() => Command("seek", Timeline.Value.ToString("0.000", CultureInfo.InvariantCulture), "absolute+exact");

    private static string FormatTime(double seconds) => TimeSpan.FromSeconds(Math.Clamp(double.IsFinite(seconds) ? seconds : 0, 0, 86400))
        .ToString(@"h\:mm\:ss");

    private void WindowKey(object sender, KeyEventArgs args)
    {
        if (pendingMedia == null && pendingLive == null) return;
        if (trackMenu?.IsOpen == true)
        {
            if (args.Key == Key.Escape) { trackMenu.IsOpen = false; args.Handled = true; }
            return;
        }
        if (args.OriginalSource is Slider && args.Key is not (Key.F11 or Key.Escape)) return;
        if (args.OriginalSource is TextBox && args.Key is not (Key.F11 or Key.Escape)) return;
        args.Handled = PlayerShortcut(args.Key);
    }

    private sealed class ActivePlayback(JellyfinPlayback session)
    {
        internal readonly JellyfinPlayback Session = session;
        internal CancellationTokenSource Cancellation = new();
        internal Mpv? Engine;
        internal bool Started, Paused, TriedFallback, Software;
        internal double Position, Duration;
        internal DateTime NextReport;
        internal MediaSegment[] Credits = [];
        internal MediaSegment? CurrentCredits;
    }

    private sealed class LivePlayback(LiveStream[] streams)
    {
        internal readonly LiveStream[] Streams = streams;
        internal int Next;
        internal Mpv? Engine;
        internal DateTime Deadline;
        internal bool Started;
        internal bool AutomaticQuality = true;
    }

    private void StartLive(string name, LiveStream[] streams)
    {
        if (pendingLive != null || pendingMedia != null || closing || streams.Length == 0) return;
        externalPlayer?.Close();
        externalPlayer = null;
        pendingLive = new LivePlayback(streams);
        MediaTitle.Text = name;
        LibraryShell.Visibility = Visibility.Collapsed;
        Player.Visibility = Visibility.Visible;
        PlaybackMode.Text = "EN DIRECT";
        Timeline.IsEnabled = false;
        Timeline.Value = 0;
        PositionLabel.Text = "DIRECT";
        PositionLabel.MinWidth = 60;
        LiveQualityButton.Visibility = Visibility.Visible;
        LiveQualityButton.Content = "Qualité";
        BackwardButton.Visibility = ForwardButton.Visibility = Timeline.Visibility = Visibility.Collapsed;
        SkipCredits.Visibility = Visibility.Collapsed;
        if (File.Exists(Mpv.LibraryPath)) OpenLive(pendingLive);
        else Notice("Installez mpv pour lire le direct dans Noctra.", install: true);
        Player.UpdateLayout();
        AttachFloatingControls();
        WakeFullscreenControls(force: true);
    }

    private void OpenLive(LivePlayback state)
    {
        timer.Stop();
        state.Engine?.Dispose();
        state.Engine = null;
        while (state.Next < state.Streams.Length)
        {
            var stream = state.Streams[state.Next++];
            try
            {
                VideoHost.Visibility = Visibility.Visible;
                PlaybackNotice.Visibility = Visibility.Collapsed;
                PlayerControls.Visibility = Visibility.Visible;
                PlaybackMode.Text = $"Connexion au serveur {state.Next} / {state.Streams.Length}…";
                state.Engine = new Mpv(surface.Handle, null, 0, stream.NoctraToken, live: true);
                ApplyPlayerPreferences(state.Engine);
                state.Engine.Load(stream.Url);
                state.Deadline = DateTime.UtcNow.AddSeconds(16);
                state.Started = false;
                state.AutomaticQuality = true;
                timer.Start();
                return;
            }
            catch (Exception error) when (error is InvalidOperationException or DllNotFoundException or BadImageFormatException)
            {
                state.Engine?.Dispose();
                state.Engine = null;
            }
        }
        if (fullscreen) SetFullscreen(false);
        PlaybackMode.Text = "";
        Notice("Aucun des flux sélectionnés n’a démarré. Revenez à la chaîne pour essayer un autre serveur.");
    }

    private void TickLive(LivePlayback state)
    {
        var engine = state.Engine!;
        foreach (var (kind, _) in engine.Poll())
        {
            if (kind == Mpv.Event.PlaybackRestart && !state.Started)
            {
                state.Started = true;
                PlaybackMode.Text = "EN DIRECT";
                CorrectVideoDisplay();
            }
            else if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown)
            {
                OpenLive(state);
                return;
            }
        }
        if (!state.Started && state.Deadline <= DateTime.UtcNow) OpenLive(state);
        else if (state.Started)
        {
            ShowPauseState(engine.Paused);
            if (engine.Seconds("video-params/h") is > 0 and var height)
            {
                LiveQualityButton.Content = $"{height:0}p";
                PlaybackMode.Text = $"EN DIRECT · {height:0}p";
            }
        }
    }
}

