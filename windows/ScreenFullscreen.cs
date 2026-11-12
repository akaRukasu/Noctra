using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Shell;

namespace Noctra.Windows;

// Use the monitor's full physical bounds, including the taskbar area. Restore the exact window placement.
internal sealed class ScreenFullscreen
{
    private readonly Window window;
    private Placement placement;
    private WindowStyle style;
    private ResizeMode resize;
    private WindowChrome? chrome;
    private bool topmost;
    internal bool Active { get; private set; }

    internal ScreenFullscreen(Window window)
    {
        this.window = window;
        window.Activated += (_, _) => { if (Active) window.Topmost = true; };
        window.Deactivated += (_, _) => { if (Active) window.Topmost = topmost; };
        window.Closed += (_, _) => Active = false;
    }

    internal void Enter()
    {
        if (Active) return;
        var handle = new WindowInteropHelper(window).EnsureHandle();
        placement = new Placement { Length = Marshal.SizeOf<Placement>() };
        if (!GetWindowPlacement(handle, ref placement)) return;
        var bounds = System.Windows.Forms.Screen.FromHandle(handle).Bounds;
        style = window.WindowStyle; resize = window.ResizeMode; chrome = WindowChrome.GetWindowChrome(window); topmost = window.Topmost;
        Active = true;
        window.WindowState = WindowState.Normal;
        WindowChrome.SetWindowChrome(window, null);
        window.WindowStyle = WindowStyle.None; window.ResizeMode = ResizeMode.NoResize;
        window.Topmost = window.IsActive;
        var square = 1; DwmSetWindowAttribute(handle, 33, ref square, sizeof(int));
        SetWindowPos(handle, IntPtr.Zero, bounds.Left, bounds.Top, bounds.Width, bounds.Height, 0x0020 | 0x0200);
        window.UpdateLayout();
    }

    internal void Exit()
    {
        if (!Active) return;
        Active = false;
        var handle = new WindowInteropHelper(window).Handle;
        window.Topmost = topmost;
        window.WindowStyle = style; window.ResizeMode = resize;
        WindowChrome.SetWindowChrome(window, chrome);
        var systemDefault = 0; DwmSetWindowAttribute(handle, 33, ref systemDefault, sizeof(int));
        SetWindowPlacement(handle, ref placement);
        window.UpdateLayout();
    }

    [StructLayout(LayoutKind.Sequential)] private struct NativePoint { internal int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { internal int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct Placement
    {
        internal int Length, Flags, ShowCommand;
        internal NativePoint MinPosition, MaxPosition;
        internal NativeRect NormalPosition;
    }
    [DllImport("user32.dll")] private static extern bool GetWindowPlacement(IntPtr handle, ref Placement value);
    [DllImport("user32.dll")] private static extern bool SetWindowPlacement(IntPtr handle, ref Placement value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr handle, IntPtr order, int x, int y, int width, int height, uint flags);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);
}
