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
        ConfigureSeekPreview();
        timer.Tick += (_, _) => TickPlayer();
        // 0.8 : la barre traite elle-même le clic (aller au point cliqué) et le marque « traité » : sans
        // « handledEventsToo », le début du glissement n'était pas vu et la position en cours écrasait
        // le curseur toutes les 200 ms pendant qu'on le déplaçait.
        Timeline.AddHandler(UIElement.PreviewMouseLeftButtonDownEvent, new MouseButtonEventHandler(BeginSeek), true);
        Timeline.AddHandler(UIElement.PreviewMouseLeftButtonUpEvent, new MouseButtonEventHandler(EndSeek), true);
        Timeline.AddHandler(Thumb.DragStartedEvent, new DragStartedEventHandler((_, _) => seeking = true), true);
        Timeline.AddHandler(Thumb.DragCompletedEvent, new DragCompletedEventHandler((_, _) => { if (seeking) { seeking = false; Seek(); } }), true);
        Timeline.ValueChanged += (_, _) => { if (seeking && active is { Duration: > 0 } state) PositionLabel.Text = FormatTime(Timeline.Value) + " / " + FormatTime(state.Duration); };
        // Appui n'importe où sur la barre puis glissement : la position suit le pointeur.
        Timeline.PreviewMouseMove += (_, args) =>
        {
            if (!seeking || !Timeline.IsMouseCaptured || args.LeftButton != MouseButtonState.Pressed) return;
            if (Timeline.Template?.FindName("PART_Track", Timeline) is Track track && track.ActualWidth > 0)
                Timeline.Value = Math.Clamp(track.ValueFromPoint(args.GetPosition(track)), Timeline.Minimum, Timeline.Maximum);
        };
        Timeline.LostMouseCapture += (_, _) => { if (seeking && Mouse.LeftButton == MouseButtonState.Released) { seeking = false; Seek(); } };
    }

    private long? pendingStartTicks;
    private bool pendingSynchronized;
    private Uri? pendingLocalFile;
    // 0.7 : file de lecture (liste de lecture, album) : le titre suivant démarre à la fin du précédent.
    private MediaItem[] playQueue = [];
    private int playQueueIndex;

    private void StartPlayback(MediaItem item) => StartPlayback(item, null);
    private void StartPlayback(MediaItem item, long? startTicks, bool synchronized = false, bool keepQueue = false, Uri? localFile = null)
    {
        // Séance SyncPlay : le titre est lancé pour tout le groupe (le serveur renvoie la file à chacun).
        if (!synchronized && localFile == null && syncGroup != null && client != null && item.CanPlay && !item.IsAudio && pendingLive == null)
        {
            SyncPlayItem(item, startTicks ?? item.Resume);
            return;
        }
        if ((client == null && localFile == null) || active != null || pendingMedia != null || pendingLive != null || closing || !item.CanPlay) return;
        if (!keepQueue) { playQueue = []; playQueueIndex = 0; }
        externalPlayer?.Close();
        externalPlayer = null;
        pendingMedia = item;
        pendingStartTicks = startTicks;
        pendingSynchronized = synchronized;
        pendingLocalFile = localFile;
        // 0.8 : en-tête : nom de la série (ou type de média) au-dessus, titre en grand, détail dessous.
        MediaEyebrow.Text = item.Type == "Episode" && !string.IsNullOrWhiteSpace(item.SeriesName) ? item.SeriesName.ToUpperInvariant() :
            item.IsAudio ? "MUSIQUE" : localFile != null ? "HORS CONNEXION" : "LECTURE EN COURS";
        MediaTitle.Text = item.Type == "Episode" ? item.Name : item.IsAudio ? item.Name : item.DisplayTitle;
        MediaSubtitle.Text = item.Type == "Episode" || item.IsAudio ? item.Caption : item.ProductionYear is { } year ? year.ToString(CultureInfo.InvariantCulture) : "";
        MediaSubtitle.Visibility = MediaSubtitle.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        LiveDot.Visibility = LiveServerButton.Visibility = Visibility.Collapsed;
        ResetTimelineDecorations();
        PrepareAudioStage(item);
        QueuePrevious.Visibility = QueueNext.Visibility = playQueue.Length > 1 ? Visibility.Visible : Visibility.Collapsed;
        QueuePrevious.IsEnabled = playQueueIndex > 0;
        QueueNext.IsEnabled = playQueueIndex + 1 < playQueue.Length;
        LibraryShell.Visibility = Visibility.Collapsed;
        Player.Visibility = Visibility.Visible;
        Timeline.Value = 0;
        Timeline.IsEnabled = false;
        PositionLabel.Text = "";
        SkipCredits.Visibility = Visibility.Collapsed;
        UpdateSkipOverlay();
        PlaybackMode.Text = "";
        ShowPauseState(false);
        if (File.Exists(Mpv.LibraryPath)) _ = OpenPlayback(item);
        else InstallPlayer(this, new RoutedEventArgs());
    }

    private void PlayQueue(MediaItem[] items, int index, long start = 0)
    {
        items = items.Where(entry => entry.CanPlay && PlayRequest.Identifier(entry.Id)).ToArray();
        if (items.Length == 0) return;
        playQueue = items;
        playQueueIndex = Math.Clamp(index, 0, items.Length - 1);
        StartPlayback(items[playQueueIndex], start > 0 ? start : items[playQueueIndex].Resume, keepQueue: true);
    }

    private void PlayQueueStep(int step)
    {
        var target = playQueueIndex + step;
        if (playQueue.Length < 2 || target < 0 || target >= playQueue.Length) return;
        var queue = playQueue;
        FinishPlayback(refresh: false);
        playQueue = queue;
        playQueueIndex = target;
        StartPlayback(queue[target], 0, keepQueue: true);
    }
    private void QueuePreviousClick(object sender, RoutedEventArgs args) => PlayQueueStep(-1);
    private void QueueNextClick(object sender, RoutedEventArgs args) => PlayQueueStep(1);

    private async Task OpenPlayback(MediaItem item)
    {
        var account = client;
        if (pendingMedia != item || closing) return;
        if (account == null && pendingLocalFile == null) return;
        var start = pendingStartTicks ?? item.Resume;
        var request = account == null
            ? new PlayRequest(item.Id, "offline", "offline", deviceId, Math.Clamp(start, 0, TimeSpan.TicksPerDay))
            : new PlayRequest(item.Id, account.User.Id, account.Token, account.DeviceId, Math.Clamp(start, 0, TimeSpan.TicksPerDay));
        if (!request.IsValid())
        {
            Notice("La vidéo ne peut pas être ouverte avec cette session.");
            return;
        }
        var state = new ActivePlayback(new JellyfinPlayback(Jellyfin.Http, account?.Root ?? new Uri("https://localhost/"), request, item.IsAudio, pendingLocalFile))
        {
            Software = !preferences.HardwareDecoding, Synchronized = pendingSynchronized, Item = item
        };
        active = state;
        Notice(item.IsAudio ? "Ouverture du titre…" : "Ouverture de la vidéo…");
        await stopping;
        if (active != state) return;
        if (account != null && pendingLocalFile == null)
        {
            _ = FindCredits(account, item, state);
            _ = LoadPlaybackDetails(account, item, state);
        }
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
        if (active == state) state.Chapters = named;
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
            VideoHost.Visibility = state.Session.Audio ? Visibility.Collapsed : Visibility.Visible;
            AudioStage.Visibility = state.Session.Audio ? Visibility.Visible : Visibility.Collapsed;
            PlaybackNotice.Visibility = Visibility.Collapsed;
            PlayerControls.Visibility = Visibility.Visible;
            PlaybackMode.Text = MethodLabel(state);
            await Dispatcher.InvokeAsync(() => VideoHost.UpdateLayout(), DispatcherPriority.Loaded);
            if (active != state) return;
            state.Engine = new Mpv(surface.Handle, state.Session.Local ? null : state.Session.MediaAuthorization, state.Session.StartSeconds,
                software: state.Software, paused: state.Synchronized, audioOnly: state.Session.Audio);
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
                Trace("lecture démarrée " + state.Session.ItemId + " synchro=" + state.Synchronized);
                state.Started = true;
                state.Cancellation.CancelAfter(Timeout.InfiniteTimeSpan);
                state.Position = engine.Seconds("time-pos") ?? state.Session.StartSeconds;
                state.NextReport = DateTime.UtcNow.AddSeconds(8);
                ApplyPlayerPreferences(engine);
                CorrectVideoDisplay();
                var height = engine.Seconds("height");
                PlaybackMode.Text = MethodLabel(state) + (height is > 0 && !state.Session.Audio ? $" · {height:0}p" : "");
                _ = state.Session.Report("", state.Position, false);
                AddExternalSubtitles(state, engine);
                if (state.Synchronized) SyncStarted(state);
            }
            else if (kind == Mpv.Event.PlaybackRestart && state.Synchronized) SyncSeekCompleted(state);
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
                    if (state.Session.Local) SaveOfflinePosition(state, finished: true);
                    if (!InSyncGroup && playQueueIndex + 1 < playQueue.Length) PlayQueueStep(1);
                    else FinishPlayback(capture: false);
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
        var credits = state.CurrentCredits != null ? Visibility.Visible : Visibility.Collapsed;
        if (SkipCredits.Visibility != credits) { SkipCredits.Visibility = credits; UpdateSkipOverlay(); }
        var paused = engine.Paused;
        ShowPauseState(paused);
        if (!seeking && state.Duration > 0)
        {
            Timeline.Maximum = state.Duration;
            Timeline.Value = state.Position;
            Timeline.IsEnabled = true;
        }
        if (!seeking) PositionLabel.Text = FormatTime(state.Position) + " / " + FormatTime(state.Duration);
        UpdateTimelineDecorations(engine, state);
        if (state.Synchronized) SyncTick(state, engine);
        if (state.Session.Audio) UpdateLyrics(state);
        UpdateStats(engine, state);
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
        AudioStage.Visibility = Visibility.Collapsed;
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
        HideSeekPreview();
        var state = active;
        if (state == null) return;
        active = null;
        state.Cancellation.Cancel();
        if (state.Started)
        {
            if (capture) state.Position = state.Engine?.Seconds("time-pos") ?? state.Position;
            stopping = state.Session.Report("/Stopped", state.Position, state.Paused);
            if (state.Session.Local) SaveOfflinePosition(state, finished: false);
        }
        // Séance commune : ce PC ne fait plus attendre le groupe tant qu'il ne relance pas la lecture.
        if (state.Synchronized && syncGroup != null) _ = SyncRequest("SetIgnoreWait", new { IgnoreWait = true });
        state.Engine?.Dispose();
        state.Cancellation.Dispose();
    }

    private void FinishPlayback(bool capture = true, bool refresh = true)
    {
        if (miniPlayer) SetMiniPlayer(false);
        ShowStats(false);
        if (pendingLive is { } live)
        {
            installation?.Cancel();
            timer.Stop();
            live.Engine?.Dispose();
            pendingLive = null;
            LiveQualityButton.Visibility = LiveServerButton.Visibility = LiveDot.Visibility = LiveMultiButton.Visibility = Visibility.Collapsed;
            BackwardButton.Visibility = ForwardButton.Visibility = TimelineArea.Visibility = Visibility.Visible;
            ClosePlayerPanel();
            if (fullscreen) SetFullscreen(false);
            Player.Visibility = Visibility.Collapsed;
            UpdateOverlayMode();
            if (!closing) LibraryShell.Visibility = Visibility.Visible;
            return;
        }
        if (pendingMedia == null && active == null) return;
        installation?.Cancel();
        ClosePlayerPanel();
        ReleasePlayback(capture);
        pendingMedia = null;
        seeking = false;
        if (fullscreen) SetFullscreen(false);
        Player.Visibility = Visibility.Collapsed;
        AudioStage.Visibility = Visibility.Collapsed;
        SkipCredits.Visibility = Visibility.Collapsed;
        UpdateOverlayMode();
        if (closing) return;
        if (client == null && offlineMode) { OfflineShell(); return; }
        LibraryShell.Visibility = Visibility.Visible;
        if (refresh) _ = RefreshAfterPlayback(page);
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
    // Séance SyncPlay : pause, lecture et déplacements passent par le serveur (appliqués chez tous).
    private bool SyncControls => syncGroup != null && pendingLive == null && active is { Synchronized: true };
    private void TogglePause(object sender, RoutedEventArgs args)
    {
        if (SyncControls) { _ = SyncRequest(CurrentEngine?.Paused == true ? "Unpause" : "Pause"); return; }
        Command("cycle", "pause");
    }
    private void BackFifteen(object sender, RoutedEventArgs args) => SeekRelative(-15);
    private void ForwardFifteen(object sender, RoutedEventArgs args) => SeekRelative(15);
    private void SeekRelative(double delta)
    {
        if (SyncControls && active is { } state) { UserSeek(Math.Max(0, state.Position + delta)); return; }
        Command("seek", delta.ToString("0.###", CultureInfo.InvariantCulture), "relative");
    }
    private void UserSeek(double seconds)
    {
        if (SyncControls) { _ = SyncRequest("Seek", new { PositionTicks = (long)(Math.Max(0, seconds) * TimeSpan.TicksPerSecond) }); return; }
        SeekTo(seconds);
    }
    private void SeekTo(double seconds) => Command("seek", Math.Max(0, seconds).ToString("0.000", CultureInfo.InvariantCulture), "absolute+exact");
    private Mpv? CurrentEngine => active?.Engine ?? pendingLive?.Engine;
    private void MutePlayer(object sender, RoutedEventArgs args)
    {
        Command("cycle", "mute");
        var muted = CurrentEngine?.Flag("mute") == true;
        ShowVolumeGlyph(muted);
        Osd(muted ? "Son coupé" : "Son rétabli · " + VolumeControl.Value.ToString("0", CultureInfo.InvariantCulture) + " %");
    }
    private void ChangeVolume(object sender, RoutedPropertyChangedEventArgs<double> args)
    {
        preferences = preferences with { Volume = args.NewValue };
        Command("set", "volume", args.NewValue.ToString("0", CultureInfo.InvariantCulture));
        if (IsLoaded) ShowVolumeGlyph(CurrentEngine?.Flag("mute") == true);
    }
    // Molette, flèches haut / bas : volume par pas de 5, affiché sur l'image.
    private void ChangeVolumeBy(double delta)
    {
        if (CurrentEngine == null) return;
        VolumeControl.Value = Math.Clamp(Math.Round((VolumeControl.Value + delta) / 5) * 5, 0, 100);
        if (CurrentEngine?.Flag("mute") == true && delta > 0) Command("set", "mute", "no");
        ShowVolumeGlyph(CurrentEngine?.Flag("mute") == true);
        Osd("Volume " + VolumeControl.Value.ToString("0", CultureInfo.InvariantCulture) + " %");
    }
    private void ShowVolumeGlyph(bool muted)
    {
        var glyph = muted || VolumeControl.Value <= 0 ? "\uE74F" : VolumeControl.Value < 34 ? "\uE993" : VolumeControl.Value < 67 ? "\uE994" : "\uE995";
        if (!Equals(MuteButton.Content, glyph)) MuteButton.Content = glyph;
    }
    private void SkipCreditsClick(object sender, RoutedEventArgs args)
    {
        if (active?.CurrentCredits is { } segment) UserSeek(segment.EndTicks / (double)TimeSpan.TicksPerSecond);
    }
    private void Fullscreen(object sender, RoutedEventArgs args) => SetFullscreen(!fullscreen);
    private void BeginSeek(object sender, MouseButtonEventArgs args)
    {
        if (!Timeline.IsEnabled) return;
        seeking = true;
        // Le glissement continue même si le pointeur sort de la barre (fenêtres superposées).
        if (!Timeline.IsMouseCaptureWithin) Timeline.CaptureMouse();
    }
    private void EndSeek(object sender, MouseButtonEventArgs args)
    {
        if (!seeking) return;
        seeking = false;
        if (Timeline.IsMouseCaptured) Timeline.ReleaseMouseCapture();
        Seek();
    }
    private void SeekKey(object sender, KeyEventArgs args) { if (args.Key is Key.Left or Key.Right or Key.Home or Key.End) Seek(); }
    private void Seek() => UserSeek(Timeline.Value);

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
        internal bool Started, Paused, TriedFallback, Software, Synchronized;
        internal MediaItem? Item;
        internal Trickplay? Thumbnails;
        internal Chapter[] Chapters = [];
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
        MediaEyebrow.Text = "EN DIRECT";
        MediaTitle.Text = name;
        MediaSubtitle.Visibility = Visibility.Collapsed;
        LiveDot.Visibility = Visibility.Visible;
        LibraryShell.Visibility = Visibility.Collapsed;
        Player.Visibility = Visibility.Visible;
        PlaybackMode.Text = "EN DIRECT";
        Timeline.IsEnabled = false;
        Timeline.Value = 0;
        ResetTimelineDecorations();
        PositionLabel.Text = "DIRECT";
        LiveQualityButton.Visibility = LiveMultiButton.Visibility = Visibility.Visible;
        LiveQualityButton.Content = "Qualité";
        BackwardButton.Visibility = ForwardButton.Visibility = TimelineArea.Visibility = Visibility.Collapsed;
        QueuePrevious.Visibility = QueueNext.Visibility = Visibility.Collapsed;
        SkipCredits.Visibility = Visibility.Collapsed;
        if (File.Exists(Mpv.LibraryPath)) OpenLive(pendingLive);
        else Notice("Installez mpv pour lire le direct dans Noctra.", install: true);
        Player.UpdateLayout();
        UpdateOverlayMode();
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
                // 0.8 : serveur en cours, et passage manuel au suivant depuis le lecteur.
                LiveServerButton.Content = $"Serveur {state.Next} / {state.Streams.Length}";
                LiveServerButton.Visibility = state.Streams.Length > 1 ? Visibility.Visible : Visibility.Collapsed;
                MediaSubtitle.Text = state.Streams.Length > 1 ? $"Serveur {state.Next} sur {state.Streams.Length}" : "";
                MediaSubtitle.Visibility = MediaSubtitle.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
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

    private void NextLiveServer(object sender, RoutedEventArgs args)
    {
        if (pendingLive is not { Streams.Length: > 1 } state) return;
        if (state.Next >= state.Streams.Length) state.Next = 0;
        Osd("Serveur " + (state.Next + 1) + " / " + state.Streams.Length + "…");
        OpenLive(state);
        WakeFullscreenControls(force: true);
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
            UpdateStats(engine, null);
            if (engine.Seconds("video-params/h") is > 0 and var height)
            {
                LiveQualityButton.Content = $"{height:0}p";
                PlaybackMode.Text = $"EN DIRECT · {height:0}p";
            }
        }
    }
}

