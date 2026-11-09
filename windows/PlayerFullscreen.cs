using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

public partial class MainWindow
{
    private ScreenFullscreen? playerScreen;
    private Popup? fullscreenControls;
    private readonly DispatcherTimer controlsIdle = new(DispatcherPriority.Input) { Interval = TimeSpan.FromSeconds(2.5) };
    private VideoInputFilter? videoInput;
    private bool pointerHidden;
    private System.Drawing.Point lastVideoPointer;
    private Key lastModeKey;
    private long lastModeKeyAt;
    private bool FloatingControls => fullscreen || miniPlayer || pendingLive != null;

    private void ConfigureFullscreen()
    {
        ConfigurePlayerHints(PlayerControls);
        videoInput = new VideoInputFilter(surface, key => PlayerShortcut(key), WakeFullscreenControls, () => pointerHidden,
            () => { if (miniPlayer) SetMiniPlayer(false); else SetFullscreen(!fullscreen); }, () => miniPlayer ? DragMiniPlayer() : false);
        Forms.Application.AddMessageFilter(videoInput);
        controlsIdle.Tick += (_, _) =>
        {
            if (!FloatingControls || trackMenu?.IsOpen == true || PointerOverFullscreenControls()) return;
            if (fullscreenControls != null) fullscreenControls.IsOpen = false;
            pointerHidden = true;
            if (surface.RectangleToScreen(surface.ClientRectangle).Contains(Forms.Cursor.Position)) VideoInputFilter.HideCursor();
            controlsIdle.Stop();
        };
        PlayerControls.MouseMove += (_, _) => WakeFullscreenControls();
        PlayerControls.PreviewKeyDown += (_, _) => WakeFullscreenControls(force: true);
        PlayerControls.MouseLeave += (_, _) => { if (FloatingControls) { controlsIdle.Stop(); controlsIdle.Start(); } };
        Player.SizeChanged += (_, _) => { if (fullscreenControls != null) fullscreenControls.Width = Player.ActualWidth; };
        Closed += (_, _) => { controlsIdle.Stop(); if (fullscreenControls != null) fullscreenControls.IsOpen = false; Forms.Application.RemoveMessageFilter(videoInput); };
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
        playerScreen ??= new ScreenFullscreen(this);
        if (enabled)
        {
            playerScreen.Enter();
            if (!playerScreen.Active) return;
            fullscreen = true;
            FrameHeader.Visibility = Visibility.Collapsed; PlayerHeader.Visibility = Visibility.Collapsed;
            SizeHeader();
            AttachFloatingControls();
            FullscreenReturn.Visibility = Visibility.Visible;
            FullscreenButton.Content = "\uE73F"; FullscreenButton.ToolTip = "Quitter le plein écran · Échap ou F11";
            System.Windows.Automation.AutomationProperties.SetName(FullscreenButton, "Quitter le plein écran");
            WakeFullscreenControls(force: true);
        }
        else
        {
            fullscreen = false;
            if (pendingLive == null) RestoreDockedControls();
            FullscreenButton.Content = "\uE740"; FullscreenButton.ToolTip = "Plein écran · F11";
            System.Windows.Automation.AutomationProperties.SetName(FullscreenButton, "Plein écran");
            FrameHeader.Visibility = Visibility.Visible; PlayerHeader.Visibility = Visibility.Visible;
            playerScreen.Exit();
            SizeHeader();
            if (pendingLive != null) WakeFullscreenControls(force: true);
        }
    }

    private void AttachFloatingControls()
    {
        Player.Children.Remove(PlayerControls);
        fullscreenControls ??= new Popup
        {
            PlacementTarget = Player, Placement = PlacementMode.Custom, StaysOpen = true, AllowsTransparency = true,
            CustomPopupPlacementCallback = (popup, target, offset) => [new CustomPopupPlacement(new Point(0, Math.Max(0, target.Height - popup.Height)), PopupPrimaryAxis.Horizontal)]
        };
        fullscreenControls.Child = PlayerControls; fullscreenControls.Width = Player.ActualWidth;
        FullscreenReturn.Visibility = Visibility.Visible;
    }

    private void RestoreDockedControls()
    {
        PlayerHint.Text = "";
        controlsIdle.Stop(); pointerHidden = false; Forms.Cursor.Current = Forms.Cursors.Default;
        if (fullscreenControls != null) { fullscreenControls.IsOpen = false; fullscreenControls.Child = null; }
        if (!Player.Children.Contains(PlayerControls)) Player.Children.Add(PlayerControls);
        FullscreenReturn.Visibility = Visibility.Collapsed;
    }

    private void WakeFullscreenControls() => WakeFullscreenControls(false);
    private void WakeFullscreenControls(bool force)
    {
        if (!FloatingControls) return;
        var position = Forms.Cursor.Position;
        if (!force && position == lastVideoPointer) return;
        lastVideoPointer = position; pointerHidden = false; Forms.Cursor.Current = Forms.Cursors.Default;
        if (fullscreenControls != null && PlayerControls.Visibility == Visibility.Visible) fullscreenControls.IsOpen = true;
        controlsIdle.Stop(); controlsIdle.Start();
    }

    private bool PointerOverFullscreenControls()
    {
        if (fullscreenControls?.IsOpen != true || !PlayerControls.IsVisible) return false;
        var first = PlayerControls.PointToScreen(new Point());
        var last = PlayerControls.PointToScreen(new Point(PlayerControls.ActualWidth, PlayerControls.ActualHeight));
        var pointer = Forms.Cursor.Position;
        return pointer.X >= first.X && pointer.X < last.X && pointer.Y >= first.Y && pointer.Y < last.Y;
    }

    private bool PlayerShortcut(Key key)
    {
        if (pendingMedia == null && pendingLive == null) return false;
        if (key is Key.F11 or Key.Escape)
        {
            var now = System.Diagnostics.Stopwatch.GetTimestamp();
            // WPF/WinForms interop can forward the same physical accelerator through both message paths.
            if (key == lastModeKey && System.Diagnostics.Stopwatch.GetElapsedTime(lastModeKeyAt, now).TotalMilliseconds < 180) return true;
            lastModeKey = key; lastModeKeyAt = now;
        }
        if (key == Key.F11) SetFullscreen(!fullscreen);
        else if (key == Key.Escape) { if (miniPlayer) SetMiniPlayer(false); else if (fullscreen) SetFullscreen(false); else FinishPlayback(); }
        else if (key == Key.Space) TogglePause(this, new RoutedEventArgs());
        else if (key == Key.Left) { if (pendingLive == null) SeekRelative(-15); }
        else if (key == Key.Right) { if (pendingLive == null) SeekRelative(15); }
        else if (key == Key.M) Command("cycle", "mute");
        else if (key == Key.I) ShowStats(statsPopup?.IsOpen != true);
        else if (key == Key.P) SetMiniPlayer(!miniPlayer);
        else if (key == Key.N) PlayQueueStep(1);
        else return false;
        return true;
    }
}

internal sealed class VideoInputFilter(Forms.Control surface, Func<Key, bool> shortcut, Action move, Func<bool> hidden, Action doubleClick, Func<bool> press) : Forms.IMessageFilter
{
    public bool PreFilterMessage(ref Forms.Message message)
    {
        if (!surface.IsHandleCreated || !surface.Visible || message.HWnd != surface.Handle && !IsChild(surface.Handle, message.HWnd)) return false;
        if (message.Msg == 0x0200) move();
        if (message.Msg == 0x0203) { doubleClick(); return true; }
        if (message.Msg == 0x0201 && press()) return true;
        if (message.Msg == 0x0020 && hidden()) { SetCursor(IntPtr.Zero); return true; }
        if (message.Msg != 0x0100) return false;
        var key = KeyInterop.KeyFromVirtualKey(message.WParam.ToInt32());
        if (key is Key.F11 or Key.Escape && (message.LParam.ToInt64() & (1L << 30)) != 0) return true;
        return shortcut(key);
    }
    internal static void HideCursor() => SetCursor(IntPtr.Zero);
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] private static extern IntPtr SetCursor(IntPtr cursor);
}
