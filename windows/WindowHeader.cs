using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shell;

namespace Noctra.Windows;

public partial class MainWindow
{
    private const double CaptionHeight = 44;

    private void SizeHeader()
    {
        var inset = MaximizedFrameInset();
        WindowFrame.Margin = inset;
        CaptionRow.Height = new GridLength(fullscreen ? 0 : CaptionHeight);
        if (WindowChrome.GetWindowChrome(this) is { } chrome) chrome.CaptionHeight = CaptionHeight + inset.Top;

        // WPF widths are logical units: Windows applies the current monitor's DPI once.
        var width = Math.Max(0, ActualWidth - inset.Left - inset.Right);
        var compact = width < 1150;
        var controlHeight = compact ? 44 : width < 1600 ? 48 : width < 2200 ? 52 : 56;
        var fontSize = compact ? 14 : width < 1600 ? 15 : width < 2200 ? 16 : 17;
        var padding = compact ? 11 : width < 1600 ? 18 : 22;
        var gutter = Math.Clamp(width * .022, 24, 44);
        NavigationHeader.Height = controlHeight + 18;
        NavigationHeader.Margin = new Thickness(gutter, 14, gutter, 18);
        NavigationBrand.FontSize = fontSize + 9;
        NavigationBrand.Width = controlHeight - 8;
        foreach (var button in new[] { HomeTab, LibraryTab, DiscoverTab, TvTab })
        {
            button.Height = controlHeight;
            button.FontSize = fontSize;
            button.Padding = new Thickness(padding, 0, padding, 0);
        }
        foreach (var button in new[] { MoreTab, SearchButton, BackButton })
        {
            button.Width = button.Height = controlHeight;
            button.FontSize = fontSize + 2;
        }
        HeaderSearch.Width = compact ? 160 : Math.Clamp(width * .18, 220, 380);
        HeaderSearch.Height = SearchBox.MinHeight = ProfileButton.Height = controlHeight;
        SearchBox.FontSize = SearchPlaceholder.FontSize = ProfileButton.FontSize = fontSize;
        ProfileName.MaxWidth = compact ? 65 : 120;
        ProfileAvatar.Width = ProfileAvatar.Height = controlHeight - 18;
        ProfileAvatar.CornerRadius = new CornerRadius((controlHeight - 18) / 2.0);
    }

    private Thickness MaximizedFrameInset()
    {
        if (fullscreen || WindowState != WindowState.Maximized) return new Thickness();
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero || !HeaderWindowRect(handle, out var bounds)) return new Thickness();
        var area = System.Windows.Forms.Screen.FromHandle(handle).WorkingArea;
        var dpi = VisualTreeHelper.GetDpi(this);
        // A maximized custom frame extends beyond the work area. Keep its content inside the visible monitor.
        return new Thickness(Math.Clamp((area.Left - bounds.Left) / dpi.DpiScaleX, 0, 32),
            Math.Clamp((area.Top - bounds.Top) / dpi.DpiScaleY, 0, 32),
            Math.Clamp((bounds.Right - area.Right) / dpi.DpiScaleX, 0, 32),
            Math.Clamp((bounds.Bottom - area.Bottom) / dpi.DpiScaleY, 0, 32));
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HeaderBounds { internal int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", EntryPoint = "GetWindowRect")]
    private static extern bool HeaderWindowRect(IntPtr handle, out HeaderBounds bounds);
}
