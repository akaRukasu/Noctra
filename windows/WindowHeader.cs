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
    private bool appFullscreen;

    // Plein écran de toute l'application (accueil, médiathèques, TV…) : F11, bouton de la barre de titre ;
    // sortie par Échap, F11 ou le bouton du bandeau. Le lecteur réutilise le même mode écran.
    private void AppFullscreenClick(object sender, RoutedEventArgs args) => SetAppFullscreen(!appFullscreen);

    private void SetAppFullscreen(bool enabled)
    {
        if (enabled == appFullscreen || enabled && miniPlayer) return;
        screenMode ??= new ScreenFullscreen(this);
        if (enabled)
        {
            screenMode.Enter();
            if (!screenMode.Active) return;
            appFullscreen = true;
        }
        else
        {
            appFullscreen = false;
            if (!fullscreen) screenMode.Exit();
        }
        AppFullscreenExit.Visibility = appFullscreen ? Visibility.Visible : Visibility.Collapsed;
        SizeHeader();
    }

    // Touches hors lecture : F11 bascule, Échap quitte le plein écran de l'application.
    private bool AppFullscreenKey(System.Windows.Input.Key key)
    {
        if (key == System.Windows.Input.Key.F11) { SetAppFullscreen(!appFullscreen); return true; }
        if (key == System.Windows.Input.Key.Escape && appFullscreen) { SetAppFullscreen(false); return true; }
        return false;
    }

    private void SizeHeader()
    {
        var inset = MaximizedFrameInset();
        WindowFrame.Margin = inset;
        CaptionRow.Height = new GridLength(fullscreen || appFullscreen || miniPlayer ? 0 : CaptionHeight);
        if (WindowChrome.GetWindowChrome(this) is { } chrome) chrome.CaptionHeight = CaptionHeight + inset.Top;

        // WPF widths are logical units: Windows applies the current monitor's DPI once.
        var width = Math.Max(0, ActualWidth - inset.Left - inset.Right);
        var compact = width < 1150;
        var controlHeight = compact ? 44 : width < 1600 ? 48 : width < 2200 ? 52 : 56;
        var fontSize = compact ? 14 : width < 1600 ? 15 : width < 2200 ? 16 : 17;
        var padding = compact ? 11 : width < 1600 ? 18 : 22;
        var gutter = Math.Clamp(width * .022, 24, 44);
        NavigationHeader.Height = controlHeight + 10;
        NavigationHeader.Margin = new Thickness(gutter, 10, gutter, 14);
        contentGutter = gutter + 8;
        NavigationBrand.FontSize = fontSize + 9;
        NavigationBrand.Width = controlHeight - 8;
        foreach (var button in new[] { HomeTab, LibraryTab, DiscoverTab, TvTab })
        {
            button.Height = controlHeight;
            button.FontSize = fontSize;
            button.Padding = new Thickness(padding, 0, padding, 0);
        }
        foreach (var button in new[] { MoreTab, SearchButton, BackButton, SyncHeaderButton })
        {
            button.Width = button.Height = controlHeight;
            button.FontSize = fontSize + 2;
        }
        HeaderSearch.Width = compact ? 130 : Math.Clamp(width * .18, 220, 380);
        HeaderSearch.Height = SearchBox.MinHeight = ProfileButton.Height = controlHeight;
        SearchBox.FontSize = SearchPlaceholder.FontSize = ProfileButton.FontSize = fontSize;
        // Texte saisi aligné sur l'indication et centré verticalement (hauteur de ligne ≈ 1,36 × taille).
        // Le gabarit des champs applique la marge intérieure deux fois : valeurs divisées par deux.
        SearchBox.Padding = new Thickness(19.5, Math.Max(2, (controlHeight - 2 - fontSize * 1.36) / 4), 6, 0);
        ProfileName.MaxWidth = compact ? 65 : 120;
        ProfileAvatar.Width = ProfileAvatar.Height = controlHeight - 18;
        ProfileAvatar.CornerRadius = new CornerRadius((controlHeight - 18) / 2.0);
        ApplyContentMargins();
    }

    private double contentGutter = 40;
    // Contenu sous le bandeau flottant ; les visuels « pleine largeur » (Tag bleed)
    // passent sous le bandeau et touchent les bords de la fenêtre.
    internal const string Bleed = "bleed";
    private void ApplyContentMargins()
    {
        var top = NavigationHeader.Height + NavigationHeader.Margin.Top + NavigationHeader.Margin.Bottom + 6;
        var tv = TvSidebar.Visibility == Visibility.Visible;
        TvSidebar.Margin = new Thickness(contentGutter, top, 0, 24);
        var margin = new Thickness(tv ? 22 : contentGutter, top, contentGutter, 36);
        if (PageContent.Margin != margin) PageContent.Margin = margin;
        // Pleine largeur ; sous le bandeau seulement pour le premier élément de la page.
        for (var index = 0; index < PageContent.Children.Count; index++)
            if (PageContent.Children[index] is FrameworkElement { Tag: Bleed } element)
                element.Margin = new Thickness(-margin.Left, index == 0 ? -margin.Top : 0, -margin.Right, element.Margin.Bottom);
    }

    private bool navigationSolid;
    private void UpdateNavigationSurface()
    {
        var solid = Scroller.VerticalOffset > 18;
        if (solid == navigationSolid) return;
        navigationSolid = solid;
        NavigationSolid.BeginAnimation(OpacityProperty, new System.Windows.Media.Animation.DoubleAnimation(solid ? 1 : 0,
            new Duration(TimeSpan.FromMilliseconds(220))) { EasingFunction = new System.Windows.Media.Animation.CubicEase() });
    }

    private Thickness MaximizedFrameInset()
    {
        if (fullscreen || appFullscreen || WindowState != WindowState.Maximized) return new Thickness();
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
