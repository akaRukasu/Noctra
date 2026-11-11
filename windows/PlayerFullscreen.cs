using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

// 0.8 : lecteur plein cadre. Dès qu'une vidéo est affichée (fenêtre, plein écran, mini-lecteur, TV),
// l'en-tête et les commandes flottent au-dessus de l'image et s'effacent après quelques secondes
// sans mouvement. Sans image (musique, messages), ils restent posés dans le lecteur.
public partial class MainWindow
{
    private ScreenFullscreen? screenMode;
    private Popup? fullscreenControls, headerOverlay, skipOverlay;
    private readonly DispatcherTimer controlsIdle = new(DispatcherPriority.Input) { Interval = TimeSpan.FromSeconds(2.8) };
    private VideoInputFilter? videoInput;
    private readonly DispatcherTimer pointerWatch = new(DispatcherPriority.Input) { Interval = TimeSpan.FromMilliseconds(100) };
    private System.Drawing.Point lastPolledPointer;
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(System.Drawing.Point point);
    private bool pointerHidden;
    private System.Drawing.Point lastVideoPointer;
    private Key lastModeKey;
    private long lastModeKeyAt;
    private bool FloatingControls => Player.Visibility == Visibility.Visible &&
        (fullscreen || miniPlayer || VideoHost.Visibility == Visibility.Visible);
    private bool OverlaysOpen => fullscreenControls?.IsOpen == true;

    private void ConfigureFullscreen()
    {
        ConfigurePlayerHints(PlayerControls);
        ConfigurePlayerHints(PlayerHeader);
        videoInput = new VideoInputFilter(surface, key => PlayerShortcut(key), WakeFullscreenControls, () => pointerHidden,
            () => { if (miniPlayer) SetMiniPlayer(false); else SetFullscreen(!fullscreen); }, () => miniPlayer ? DragMiniPlayer() : false,
            VideoClicked, delta => ChangeVolumeBy(delta > 0 ? 5 : -5));
        Forms.Application.AddMessageFilter(videoInput);
        // L'image appartient à la fenêtre du moteur vidéo (autre fil d'exécution) : ses mouvements de souris n'arrivent pas
        // toujours jusqu'ici. La position du pointeur est donc aussi relevée : tout mouvement au-dessus du lecteur
        // (dans une fenêtre de Noctra) fait réapparaître la barre et les boutons.
        pointerWatch.Tick += (_, _) =>
        {
            if (!FloatingControls || WindowState == WindowState.Minimized || !surface.IsHandleCreated || !surface.Visible) return;
            var position = Forms.Cursor.Position;
            if (position == lastPolledPointer) return;
            lastPolledPointer = position;
            if (!surface.RectangleToScreen(surface.ClientRectangle).Contains(position)) return;
            var under = WindowFromPoint(position);
            if (under == IntPtr.Zero || GetWindowThreadProcessId(under, out var owner) == 0 || owner != (uint)Environment.ProcessId) return;
            WakeFullscreenControls();
        };
        pointerWatch.Start();
        controlsIdle.Tick += (_, _) =>
        {
            if (!FloatingControls || trackMenu?.IsOpen == true || playerPanel?.IsOpen == true || PointerOverFullscreenControls() || seeking) return;
            // En pause, les commandes restent affichées (sauf direct TV, qui ne se met pas en pause longtemps).
            if (CurrentEngine?.Paused == true && pendingLive == null && !miniPlayer) return;
            HideOverlays();
            pointerHidden = true;
            if (surface.RectangleToScreen(surface.ClientRectangle).Contains(Forms.Cursor.Position)) VideoInputFilter.HideCursor();
            controlsIdle.Stop();
        };
        PlayerControls.MouseMove += (_, _) => WakeFullscreenControls();
        PlayerHeader.MouseMove += (_, _) => WakeFullscreenControls();
        // Commandes flottantes : fenêtres à part, les raccourcis du lecteur y sont relayés.
        PlayerControls.PreviewKeyDown += FloatingKey;
        PlayerHeader.PreviewKeyDown += FloatingKey;
        PlayerControls.MouseLeave += (_, _) => { if (FloatingControls) { controlsIdle.Stop(); controlsIdle.Start(); } };
        Player.SizeChanged += (_, _) => { SizeOverlays(); RepositionOverlays(); };
        VideoHost.IsVisibleChanged += (_, _) => Dispatcher.BeginInvoke(UpdateOverlayMode, DispatcherPriority.Loaded);
        Player.IsVisibleChanged += (_, _) => Dispatcher.BeginInvoke(UpdateOverlayMode, DispatcherPriority.Loaded);
        // Les fenêtres superposées suivent la fenêtre principale et disparaissent avec elle.
        LocationChanged += (_, _) => RepositionOverlays();
        StateChanged += (_, _) => { if (WindowState == WindowState.Minimized) HideOverlays(); else Dispatcher.BeginInvoke(() => { SizeOverlays(); RepositionOverlays(); }); };
        Deactivated += (_, _) => { if (!miniPlayer) { HideOverlays(); ClosePlayerPanel(); } };
        Activated += (_, _) => { if (FloatingControls) WakeFullscreenControls(force: true); };
        Timeline.SizeChanged += (_, _) => DrawChapterMarks();
        Closed += (_, _) =>
        {
            pointerWatch.Stop();
            controlsIdle.Stop();
            HideOverlays();
            if (skipOverlay != null) skipOverlay.IsOpen = false;
            Forms.Application.RemoveMessageFilter(videoInput);
        };
    }

    private void ConfigurePlayerHints(DependencyObject parent)
    {
        if (parent is FrameworkElement element)
        {
            // Reparenting floating controls can leave WPF's tooltip safe-area tied to a destroyed HWND.
            // Render the same hints inside the controls instead of creating a nested tooltip window.
            ToolTipService.SetIsEnabled(element, false);
            if (element.ToolTip != null)
            {
                element.MouseEnter += (_, _) => PlayerHint.Text = element.ToolTip?.ToString() ?? "";
                element.MouseLeave += (_, _) => PlayerHint.Text = "";
                element.GotKeyboardFocus += (_, _) => PlayerHint.Text = element.ToolTip?.ToString() ?? "";
                element.LostKeyboardFocus += (_, _) => PlayerHint.Text = "";
            }
        }
        foreach (var child in LogicalTreeHelper.GetChildren(parent))
            if (child is DependencyObject dependency) ConfigurePlayerHints(dependency);
    }

    private void SetFullscreen(bool enabled)
    {
        if (enabled == fullscreen || enabled && pendingMedia == null && pendingLive == null) return;
        if (enabled && miniPlayer) SetMiniPlayer(false);
        screenMode ??= new ScreenFullscreen(this);
        if (enabled)
        {
            // Plein écran de l'application déjà actif : la fenêtre couvre l'écran, seul l'en-tête disparaît.
            screenMode.Enter();
            if (!screenMode.Active) return;
            fullscreen = true;
            FrameHeader.Visibility = Visibility.Collapsed;
            SizeHeader();
            FullscreenButton.Content = ""; FullscreenButton.ToolTip = "Quitter le plein écran · Échap, F ou F11";
            System.Windows.Automation.AutomationProperties.SetName(FullscreenButton, "Quitter le plein écran");
        }
        else
        {
            fullscreen = false;
            FullscreenButton.Content = ""; FullscreenButton.ToolTip = "Plein écran · F ou F11";
            System.Windows.Automation.AutomationProperties.SetName(FullscreenButton, "Plein écran");
            FrameHeader.Visibility = Visibility.Visible;
            if (!appFullscreen) screenMode.Exit();
            SizeHeader();
        }
        UpdateOverlayMode();
        if (FloatingControls) WakeFullscreenControls(force: true);
    }

    private Popup Overlay(Func<Size, Size, Point> place) => new()
    {
        PlacementTarget = Player, Placement = PlacementMode.Custom, StaysOpen = true, AllowsTransparency = true, Focusable = false,
        CustomPopupPlacementCallback = (popup, target, _) => [new CustomPopupPlacement(place(popup, target), PopupPrimaryAxis.Horizontal)]
    };

    // Place l'en-tête et les commandes au-dessus de la vidéo (ou les repose dans le lecteur).
    private void UpdateOverlayMode()
    {
        if (closing) return;
        if (FloatingControls) AttachFloatingControls();
        else RestoreDockedControls();
        UpdateSkipOverlay();
    }

    private void AttachFloatingControls()
    {
        fullscreenControls ??= Overlay((popup, target) => new Point(0, Math.Max(0, target.Height - popup.Height)));
        headerOverlay ??= Overlay((_, _) => new Point(0, 0));
        var attached = fullscreenControls.Child == PlayerControls;
        if (!attached)
        {
            Player.Children.Remove(PlayerControls);
            Player.Children.Remove(PlayerHeader);
            fullscreenControls.Child = PlayerControls;
            headerOverlay.Child = PlayerHeader;
        }
        SizeOverlays();
        if (!attached) WakeFullscreenControls(force: true);
    }

    private void RestoreDockedControls()
    {
        PlayerHint.Text = "";
        controlsIdle.Stop(); pointerHidden = false; Forms.Cursor.Current = Forms.Cursors.Default;
        HideOverlays();
        if (fullscreenControls != null && fullscreenControls.Child != null) fullscreenControls.Child = null;
        if (headerOverlay != null && headerOverlay.Child != null) headerOverlay.Child = null;
        if (!Player.Children.Contains(PlayerHeader)) Player.Children.Add(PlayerHeader);
        if (!Player.Children.Contains(PlayerControls)) Player.Children.Add(PlayerControls);
        PlayerHeader.Width = PlayerControls.Width = double.NaN;
        FullscreenReturn.Visibility = Visibility.Collapsed;
    }

    private void SizeOverlays()
    {
        if (Player.ActualWidth <= 0) return;
        if (fullscreenControls?.Child == PlayerControls) PlayerControls.Width = Player.ActualWidth;
        if (headerOverlay?.Child == PlayerHeader) PlayerHeader.Width = Player.ActualWidth;
    }

    // Une fenêtre superposée ne suit pas seule la fenêtre principale : on la replace.
    private void RepositionOverlays()
    {
        foreach (var popup in new[] { fullscreenControls, headerOverlay, skipOverlay, playerPanel })
        {
            if (popup?.IsOpen != true) continue;
            var offset = popup.HorizontalOffset;
            popup.HorizontalOffset = offset + .01;
            popup.HorizontalOffset = offset;
        }
    }

    private void HideOverlays()
    {
        if (fullscreenControls != null) fullscreenControls.IsOpen = false;
        if (headerOverlay != null) headerOverlay.IsOpen = false;
    }

    private void WakeFullscreenControls() => WakeFullscreenControls(false);
    private void WakeFullscreenControls(bool force)
    {
        if (!FloatingControls || WindowState == WindowState.Minimized) return;
        var position = Forms.Cursor.Position;
        if (!force && position == lastVideoPointer) return;
        lastVideoPointer = position; pointerHidden = false; Forms.Cursor.Current = Forms.Cursors.Default;
        if (fullscreenControls != null && fullscreenControls.Child == PlayerControls && PlayerControls.Visibility == Visibility.Visible)
            fullscreenControls.IsOpen = true;
        if (headerOverlay != null && headerOverlay.Child == PlayerHeader) headerOverlay.IsOpen = !miniPlayer;
        controlsIdle.Stop(); controlsIdle.Start();
    }

    // « Passer le générique » : bouton à part, visible même quand les commandes sont masquées.
    private void UpdateSkipOverlay()
    {
        var show = (SkipCredits.Visibility == Visibility.Visible || UpNextCard.Visibility == Visibility.Visible) && Player.Visibility == Visibility.Visible && !miniPlayer && !closing &&
            WindowState != WindowState.Minimized;
        if (show && skipOverlay == null)
        {
            Player.Children.Remove(SkipCreditsHost);
            skipOverlay = Overlay((popup, target) =>
            {
                var scale = System.Windows.Media.VisualTreeHelper.GetDpi(this).DpiScaleX;
                return new Point(Math.Max(0, target.Width - popup.Width - 32 * scale), Math.Max(0, target.Height - popup.Height - 150 * scale));
            });
            SkipCreditsHost.Margin = new Thickness(0);
            skipOverlay.Child = SkipCreditsHost;
        }
        if (skipOverlay != null && skipOverlay.IsOpen != show) skipOverlay.IsOpen = show;
    }

    private bool PointerOverFullscreenControls()
    {
        bool Over(FrameworkElement element)
        {
            if (!element.IsVisible) return false;
            var first = element.PointToScreen(new Point());
            var last = element.PointToScreen(new Point(element.ActualWidth, element.ActualHeight));
            var pointer = Forms.Cursor.Position;
            return pointer.X >= first.X && pointer.X < last.X && pointer.Y >= first.Y && pointer.Y < last.Y;
        }
        return fullscreenControls?.IsOpen == true && Over(PlayerControls) || headerOverlay?.IsOpen == true && Over(PlayerHeader);
    }

    // Clic sur l'image : ferme un panneau ouvert, sinon lecture / pause.
    private void VideoClicked()
    {
        if (playerPanel?.IsOpen == true || trackMenu?.IsOpen == true)
        {
            ClosePlayerPanel();
            if (trackMenu != null) trackMenu.IsOpen = false;
            return;
        }
        if (pendingMedia == null && pendingLive == null || miniPlayer) return;
        TogglePause(this, new RoutedEventArgs());
        WakeFullscreenControls(force: true);
    }

    private void FloatingKey(object sender, KeyEventArgs args)
    {
        WakeFullscreenControls(force: true);
        if (args.Handled || args.Key is Key.Tab or Key.Enter) return;
        if (args.OriginalSource is Slider && args.Key is Key.Left or Key.Right or Key.Up or Key.Down) return;
        args.Handled = PlayerShortcut(args.Key == Key.System ? args.SystemKey : args.Key);
    }

    private bool PlayerShortcut(Key key)
    {
        if (pendingMedia == null && pendingLive == null) return false;
        if (key is Key.F11 or Key.Escape or Key.F)
        {
            var now = System.Diagnostics.Stopwatch.GetTimestamp();
            // WPF/WinForms interop can forward the same physical accelerator through both message paths.
            if (key == lastModeKey && System.Diagnostics.Stopwatch.GetElapsedTime(lastModeKeyAt, now).TotalMilliseconds < 180) return true;
            lastModeKey = key; lastModeKeyAt = now;
        }
        if (key is Key.F11 or Key.F) SetFullscreen(!fullscreen);
        else if (key == Key.Escape)
        {
            if (playerPanel?.IsOpen == true) ClosePlayerPanel();
            else if (miniPlayer) SetMiniPlayer(false);
            else if (fullscreen) SetFullscreen(false);
            else FinishPlayback();
        }
        else if (key is Key.Space or Key.K) TogglePause(this, new RoutedEventArgs());
        else if (key is Key.Left or Key.J) { if (pendingLive == null) SeekRelative(-15); }
        else if (key is Key.Right or Key.L) { if (pendingLive == null) SeekRelative(15); }
        else if (key == Key.Up) ChangeVolumeBy(5);
        else if (key == Key.Down) ChangeVolumeBy(-5);
        else if (key == Key.M) MutePlayer(this, new RoutedEventArgs());
        else if (key == Key.C) CycleTrack("sub");
        else if (key == Key.A) CycleTrack("audio");
        else if (key == Key.S) { if (SkipCredits.Visibility == Visibility.Visible) SkipCreditsClick(this, new RoutedEventArgs()); }
        else if (key == Key.I) ShowStats(statsPopup?.IsOpen != true);
        else if (key == Key.P) SetMiniPlayer(!miniPlayer);
        else if (key == Key.N) StepEpisode(1);
        else if (key == Key.PageDown) StepChapter(1);
        else if (key == Key.PageUp) StepChapter(-1);
        else if (key is >= Key.D0 and <= Key.D9 or >= Key.NumPad0 and <= Key.NumPad9)
        {
            // 0 à 9 : se placer à 0 %, 10 %… 90 % de la vidéo.
            var digit = key >= Key.NumPad0 ? key - Key.NumPad0 : key - Key.D0;
            if (pendingLive == null && active is { Duration: > 0 } state) UserSeek(state.Duration * digit / 10);
        }
        else return false;
        if (key is not (Key.F11 or Key.F or Key.Escape or Key.I or Key.P)) WakeFullscreenControls(force: true);
        return true;
    }
}

internal sealed class VideoInputFilter(Forms.Control surface, Func<Key, bool> shortcut, Action move, Func<bool> hidden, Action doubleClick, Func<bool> press,
    Action click, Action<int> wheel) : Forms.IMessageFilter
{
    private readonly Forms.Timer clickDelay = new() { Interval = Math.Clamp(Forms.SystemInformation.DoubleClickTime, 200, 500) };
    private bool pressed, configured;

    public bool PreFilterMessage(ref Forms.Message message)
    {
        if (!surface.IsHandleCreated || !surface.Visible) return false;
        // Molette : volume, quand le pointeur est au-dessus de l'image (même si le focus est ailleurs).
        if (message.Msg == 0x020A)
        {
            var under = WindowFromPoint(Forms.Cursor.Position);
            if (under != surface.Handle && !IsChild(surface.Handle, under)) return false;
            wheel((short)((message.WParam.ToInt64() >> 16) & 0xFFFF));
            return true;
        }
        if (message.HWnd != surface.Handle && !IsChild(surface.Handle, message.HWnd)) return false;
        if (!configured)
        {
            configured = true;
            clickDelay.Tick += (_, _) => { clickDelay.Stop(); click(); };
        }
        if (message.Msg == 0x0200) move();
        if (message.Msg == 0x0203) { clickDelay.Stop(); pressed = false; doubleClick(); return true; }
        if (message.Msg == 0x0201)
        {
            if (press()) return true;
            pressed = true;
            return false;
        }
        // Clic simple : attendu le temps d'un éventuel double-clic (plein écran) avant d'agir.
        if (message.Msg == 0x0202 && pressed) { pressed = false; clickDelay.Stop(); clickDelay.Start(); return false; }
        if (message.Msg == 0x0020 && hidden()) { SetCursor(IntPtr.Zero); return true; }
        if (message.Msg != 0x0100) return false;
        var key = KeyInterop.KeyFromVirtualKey(message.WParam.ToInt32());
        if (key is Key.F11 or Key.Escape or Key.F && (message.LParam.ToInt64() & (1L << 30)) != 0) return true;
        return shortcut(key);
    }
    internal static void HideCursor() => SetCursor(IntPtr.Zero);
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(System.Drawing.Point point);
    [DllImport("user32.dll")] private static extern IntPtr SetCursor(IntPtr cursor);
}
