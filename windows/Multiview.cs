using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Forms.Integration;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

// Une chaîne de la multivue : flux direct (lecteur Noctra) ou lecteur web externe (page du fournisseur).
internal sealed record MultiSource(string Name, LiveStream? Stream, Uri? Page = null, NoctraService? Service = null)
{
    internal string Key => Stream?.Url.AbsoluteUri ?? Page?.AbsoluteUri ?? Name;
    internal bool Web => Stream == null && Page != null;
}

// 0.8 : multivue au niveau de la PWA : jusqu'à 16 chaînes (directs et lecteurs web), grille adaptée au
// nombre, « mettre en avant » (grande case + colonne), plein écran d'une case, une seule sortie audio et
// volume par case, qualité commune plafonnée, retirer / réessayer, ajout à chaud depuis la TV.
internal sealed class MultiviewWindow : Window
{
    internal const int Maximum = 16;
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    private sealed class Tile
    {
        internal required MultiSource Source;
        internal required Border Root;
        internal required DockPanel Header;
        internal required TextBlock Status, Badge;
        internal required Button Feature, Sound, Retry;
        internal Slider? Volume;
        internal Forms.Panel? Panel;
        internal WindowsFormsHost? Host;
        internal Mpv? Engine;
        internal WebView2? Web;
        internal bool Started, Failed;
        internal int Attempts;
        internal DateTime Deadline;
        internal DateTime NextBadge;
    }

    private readonly MainWindow owner;
    private readonly string directory;
    private readonly List<Tile> tiles = [];
    private readonly Grid grid = new();
    private readonly DockPanel bar = new() { Margin = new Thickness(0, 0, 0, 10) };
    private readonly TextBlock title = new() { FontSize = 19, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBlock caption = new() { FontSize = 12, Foreground = new SolidColorBrush(Color.FromRgb(163, 169, 188)) };
    private readonly ComboBox quality = new() { Width = 170, MinHeight = 36, Margin = new Thickness(0, 0, 8, 0) };
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private readonly ScreenFullscreen screen;
    private readonly MultiviewInput input;
    private Tile? featured, solo, audio;
    private bool stopped;
    // Plein écran : rien que les images ; l'en-tête réapparaît par-dessus quand le pointeur touche le haut de l'écran.
    private readonly DockPanel layout = new() { Margin = new Thickness(12) };
    private readonly System.Windows.Controls.Primitives.Popup reveal = new()
    {
        Placement = System.Windows.Controls.Primitives.PlacementMode.Custom, AllowsTransparency = true, StaysOpen = true, Focusable = false
    };
    private DateTime revealUntil;
    private readonly Button fullButton;
    private static Task<CoreWebView2Environment>? webEnvironment;
    private static readonly (string Label, int Height)[] Qualities = [("Auto stable", -1), ("Auto sans limite", 0), ("1080p max", 1080), ("720p max", 720), ("480p max", 480), ("360p max", 360)];

    internal MultiviewWindow(MainWindow owner, IEnumerable<MultiSource> selected, string directory)
    {
        this.owner = owner;
        this.directory = directory;
        Owner = owner;
        Title = "Noctra · Multivue";
        Width = 1360; Height = 840; MinWidth = 820; MinHeight = 540;
        Background = new SolidColorBrush(Color.FromRgb(7, 8, 13));
        Foreground = Brushes.White;
        FontFamily = owner.FontFamily;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        screen = new ScreenFullscreen(this);
        SourceInitialized += (_, _) =>
        {
            var dark = 1;
            DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 20, ref dark, sizeof(int));
        };
        // En-tête : titre, qualité commune, plein écran, fermer.
        var tools = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        DockPanel.SetDock(tools, Dock.Right);
        foreach (var (label, _) in Qualities) quality.Items.Add(label);
        quality.SelectedIndex = 0;
        AutomationProperties.SetName(quality, "Qualité de la multivue");
        quality.SelectionChanged += (_, _) => { foreach (var tile in tiles) ApplyQuality(tile); };
        tools.Children.Add(quality);
        fullButton = Glyph("\uE740", "Plein écran de la multivue · F11", () => SetFullscreen(!screen.Active), pill: true, label: "Plein écran");
        tools.Children.Add(fullButton);
        tools.Children.Add(Glyph("", "Fermer la multivue", Close, pill: true, label: "Fermer"));
        bar.Children.Add(tools);
        var heading = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        heading.Children.Add(new TextBlock { Text = "NOCTRA MULTIVUE", FontSize = 11, FontWeight = FontWeights.Bold, Foreground = (Brush)owner.Resources["Accent"] });
        heading.Children.Add(title);
        heading.Children.Add(caption);
        bar.Children.Add(heading);
        var root = layout;
        DockPanel.SetDock(bar, Dock.Top);
        root.Children.Add(bar);
        root.Children.Add(grid);
        Content = root;
        // Menus déroulants au thème sombre de Noctra (styles de la fenêtre principale).
        foreach (var type in new[] { typeof(ComboBox), typeof(ComboBoxItem), typeof(System.Windows.Controls.Primitives.ScrollBar) })
            if (owner.TryFindResource(type) is Style style) Resources[type] = style;
        reveal.PlacementTarget = this;
        reveal.CustomPopupPlacementCallback = (_, _, _) => [new System.Windows.Controls.Primitives.CustomPopupPlacement(new Point(0, 0), System.Windows.Controls.Primitives.PopupPrimaryAxis.Horizontal)];
        foreach (var source in selected.Take(Maximum)) AddTile(source, open: false);
        Relayout();
        input = new MultiviewInput(this);
        Forms.Application.AddMessageFilter(input);
        Loaded += (_, _) => { foreach (var tile in tiles.ToArray()) Open(tile); timer.Start(); };
        Closing += (_, _) => Stop();
        PreviewKeyDown += (_, args) =>
        {
            if (args.Key == Key.F11) { SetFullscreen(!screen.Active); args.Handled = true; }
            else if (args.Key == Key.Escape && (solo != null || screen.Active)) { SetSolo(null); SetFullscreen(false); args.Handled = true; }
        };
        timer.Tick += (_, _) => Tick();
    }

    internal bool Contains(MultiSource source) => tiles.Any(tile => tile.Source.Key == source.Key);
    internal int Count => tiles.Count;

    // Ajout à chaud (« Multivue + » pendant que la multivue est ouverte).
    internal bool Add(MultiSource source)
    {
        if (stopped || Contains(source) || tiles.Count >= Maximum) return false;
        AddTile(source, open: IsLoaded);
        Relayout();
        if (screen.Active) ApplyChrome();
        return true;
    }

    private Button Glyph(string glyph, string tip, Action click, bool pill = false, string? label = null)
    {
        var button = new Button
        {
            Style = (Style)owner.Resources[pill ? "PlayerPill" : "PlayerGlass"], Width = pill ? double.NaN : 34, Height = pill ? 36 : 34, FontSize = 13,
            Margin = new Thickness(pill ? 8 : 2, 0, 0, 0), ToolTip = tip, Background = new SolidColorBrush(Color.FromArgb(pill ? (byte)38 : (byte)0, 255, 255, 255)),
            Content = pill && label != null ? label : glyph, FontFamily = pill && label != null ? owner.FontFamily : (FontFamily)owner.Resources["IconFont"]
        };
        AutomationProperties.SetName(button, label ?? tip);
        button.Click += (_, _) => click();
        return button;
    }

    private void AddTile(MultiSource source, bool open)
    {
        var status = new TextBlock { Text = "Connexion…", FontSize = 11.5, Foreground = new SolidColorBrush(Color.FromRgb(195, 200, 216)), VerticalAlignment = VerticalAlignment.Center };
        var badge = new TextBlock { Text = source.Web ? "WEB" : "AUTO", FontSize = 10.5, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(10, 10, 18)) };
        var header = new DockPanel { Margin = new Thickness(10, 6, 6, 6) };
        Tile? tile = null;
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        DockPanel.SetDock(buttons, Dock.Right);
        var feature = Glyph("", "Mettre en avant · double-clic sur l'image", () => SetFeatured(tile!), label: "Mettre en avant");
        var full = Glyph("", "Plein écran de cette chaîne", () => { SetSolo(tile!); SetFullscreen(true); }, label: "Plein écran de la chaîne");
        var sound = Glyph("", "Écouter cette chaîne (une seule sortie audio)", () => SetAudio(tile!), label: "Son");
        var retry = Glyph("", "Réessayer", () => Reopen(tile!), label: "Réessayer");
        var remove = Glyph("", "Retirer de la multivue", () => Remove(tile!), label: "Retirer");
        buttons.Children.Add(feature);
        buttons.Children.Add(full);
        buttons.Children.Add(sound);
        Slider? volume = null;
        if (!source.Web)
        {
            volume = new Slider { Minimum = 0, Maximum = 100, Value = 100, Width = 70, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 4, 0) };
            AutomationProperties.SetName(volume, "Volume " + source.Name);
            volume.ValueChanged += (_, args) =>
            {
                if (tile?.Engine is { } engine)
                    try { engine.Command("set", "volume", args.NewValue.ToString("0", CultureInfo.InvariantCulture)); } catch (InvalidOperationException) { }
            };
            buttons.Children.Add(volume);
        }
        buttons.Children.Add(retry);
        buttons.Children.Add(remove);
        header.Children.Add(buttons);
        var pill = new Border { Child = badge, CornerRadius = new CornerRadius(6), Padding = new Thickness(6, 2, 6, 2), Margin = new Thickness(0, 0, 8, 0),
            VerticalAlignment = VerticalAlignment.Center, Background = (Brush)owner.Resources["AccentGradient"] };
        DockPanel.SetDock(pill, Dock.Left);
        header.Children.Add(pill);
        var labels = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        labels.Children.Add(new TextBlock { Text = source.Name, FontSize = 13.5, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis });
        labels.Children.Add(status);
        header.Children.Add(labels);
        var body = new Grid { Background = Brushes.Black };
        var area = new DockPanel();
        DockPanel.SetDock(header, Dock.Top);
        area.Children.Add(header);
        area.Children.Add(body);
        var root = new Border
        {
            Child = area, Margin = new Thickness(4), CornerRadius = new CornerRadius(12), ClipToBounds = true, BorderThickness = new Thickness(1.5),
            BorderBrush = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)), Background = new SolidColorBrush(Color.FromRgb(16, 18, 26))
        };
        tile = new Tile { Source = source, Root = root, Header = header, Status = status, Badge = badge, Feature = feature, Sound = sound, Retry = retry, Volume = volume };
        if (source.Web)
        {
            tile.Web = new WebView2 { DefaultBackgroundColor = System.Drawing.Color.Black };
            body.Children.Add(tile.Web);
        }
        else
        {
            tile.Panel = new Forms.Panel { BackColor = System.Drawing.Color.Black };
            tile.Host = new WindowsFormsHost { Child = tile.Panel };
            body.Children.Add(tile.Host);
        }
        tiles.Add(tile);
        grid.Children.Add(root);
        if (audio == null) audio = tile;
        if (open) Dispatcher.BeginInvoke(() => Open(tile), DispatcherPriority.Loaded);
        UpdateAudioButtons();
    }

    // Grille : 2, 3, 4 ou 5 colonnes selon le nombre ; mise en avant : grande case à gauche, les autres en colonne.
    private void Relayout()
    {
        grid.RowDefinitions.Clear();
        grid.ColumnDefinitions.Clear();
        var count = tiles.Count;
        title.Text = count + (count > 1 ? " chaînes simultanées" : " chaîne");
        var web = tiles.Count(tile => tile.Source.Web);
        caption.Text = (count - web) + " direct" + (count - web > 1 ? "s" : "") + (web > 0 ? " · " + web + " lecteur" + (web > 1 ? "s" : "") + " web" : "") +
            " · clic sur une image : son · double-clic : mettre en avant · F11 : plein écran";
        if (featured != null && !tiles.Contains(featured)) featured = null;
        if (solo != null && !tiles.Contains(solo)) solo = null;
        foreach (var tile in tiles) tile.Root.Visibility = solo == null || tile == solo ? Visibility.Visible : Visibility.Collapsed;
        if (solo != null)
        {
            Place(solo, 0, 0, 1, 1);
            return;
        }
        if (featured != null && count > 1)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            for (var row = 0; row < count - 1; row++) grid.RowDefinitions.Add(new RowDefinition());
            Place(featured, 0, 0, 1, count - 1);
            var index = 0;
            foreach (var tile in tiles.Where(tile => tile != featured)) Place(tile, index++, 1, 1, 1);
        }
        else
        {
            var columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5;
            var rows = (int)Math.Ceiling(count / (double)columns);
            for (var column = 0; column < columns; column++) grid.ColumnDefinitions.Add(new ColumnDefinition());
            for (var row = 0; row < Math.Max(1, rows); row++) grid.RowDefinitions.Add(new RowDefinition());
            for (var index = 0; index < count; index++) Place(tiles[index], index / columns, index % columns, 1, 1);
        }
        foreach (var tile in tiles)
        {
            var active = tile == featured;
            tile.Feature.Content = active ? "" : "";
            AutomationProperties.SetName(tile.Feature, active ? "Revenir à la grille" : "Mettre en avant");
            tile.Root.BorderBrush = active ? (Brush)owner.Resources["Accent"] : new SolidColorBrush(Color.FromArgb(40, 255, 255, 255));
        }
        foreach (var tile in tiles) ApplyQuality(tile);
    }

    private static void Place(Tile tile, int row, int column, int columnSpan, int rowSpan)
    {
        Grid.SetRow(tile.Root, row);
        Grid.SetColumn(tile.Root, column);
        Grid.SetColumnSpan(tile.Root, columnSpan);
        Grid.SetRowSpan(tile.Root, Math.Max(1, rowSpan));
    }

    private void SetFeatured(Tile tile)
    {
        featured = featured == tile ? null : tile;
        // La chaîne mise en avant devient celle que l'on écoute.
        if (featured != null && audio != featured) SetAudio(featured);
        Relayout();
    }

    private void SetSolo(Tile? tile)
    {
        solo = tile;
        if (tile != null && audio != tile) SetAudio(tile);
        Relayout();
    }

    private void SetFullscreen(bool enabled)
    {
        if (enabled == screen.Active) { if (!enabled && solo != null) SetSolo(null); return; }
        if (enabled) screen.Enter(); else screen.Exit();
        if (!screen.Active && solo != null) SetSolo(null);
        ApplyChrome();
    }

    // Plein écran : en-tête de la multivue et bandeaux des chaînes retirés, cases bord à bord ;
    // l'en-tête revient par-dessus l'image quand le pointeur touche le haut de l'écran.
    private void ApplyChrome()
    {
        var clean = screen.Active;
        fullButton.Content = clean ? "Quitter le plein écran" : "Plein écran";
        AutomationProperties.SetName(fullButton, clean ? "Quitter le plein écran" : "Plein écran");
        layout.Margin = new Thickness(clean ? 0 : 12);
        foreach (var tile in tiles)
        {
            tile.Header.Visibility = clean ? Visibility.Collapsed : Visibility.Visible;
            tile.Root.Margin = new Thickness(clean ? 1 : 4);
            tile.Root.CornerRadius = new CornerRadius(clean ? 0 : 12);
            tile.Root.BorderThickness = new Thickness(clean ? 0 : 1.5);
        }
        if (clean && bar.Parent == layout)
        {
            layout.Children.Remove(bar);
            bar.Margin = new Thickness(18, 12, 18, 12);
            reveal.Child = new Border { Child = bar, Background = new SolidColorBrush(Color.FromArgb(235, 9, 10, 16)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)), BorderThickness = new Thickness(0, 0, 0, 1) };
        }
        else if (!clean && bar.Parent != layout)
        {
            reveal.IsOpen = false;
            if (reveal.Child is Border holder) holder.Child = null;
            reveal.Child = null;
            bar.Margin = new Thickness(0, 0, 0, 10);
            layout.Children.Insert(0, bar);
        }
        if (reveal.Child is FrameworkElement shown) shown.Width = ActualWidth;
    }

    private void UpdateReveal()
    {
        if (!screen.Active || reveal.Child == null) { if (reveal.IsOpen) reveal.IsOpen = false; return; }
        var pointer = Forms.Cursor.Position;
        var handle = new WindowInteropHelper(this).Handle;
        var area = Forms.Screen.FromHandle(handle).Bounds;
        var overBar = reveal.IsOpen && reveal.Child is FrameworkElement shown && shown.IsMouseOver;
        if (area.Contains(pointer) && pointer.Y - area.Top < 8 || overBar) revealUntil = DateTime.UtcNow.AddSeconds(2.5);
        var open = DateTime.UtcNow < revealUntil && IsActive;
        if (open && reveal.Child is FrameworkElement content) content.Width = ActualWidth;
        if (reveal.IsOpen != open) reveal.IsOpen = open;
    }

    // Clic simple sur l'image d'un direct : cette chaîne prend le son.
    internal void VideoClick(IntPtr window)
    {
        var tile = tiles.FirstOrDefault(item => item.Panel is { IsHandleCreated: true } panel && (panel.Handle == window || IsChild(panel.Handle, window)));
        if (tile == null || tile == audio) return;
        SetAudio(tile);
        if (tile.Engine is { } engine)
            try { engine.Command("show-text", "Son · " + tile.Source.Name, "1200"); } catch (InvalidOperationException) { }
    }

    // Une seule sortie audio : la chaîne choisie a le son, toutes les autres sont muettes.
    private void SetAudio(Tile tile)
    {
        audio = audio == tile ? null : tile;
        foreach (var other in tiles) Mute(other, other != audio);
        UpdateAudioButtons();
    }

    private void Mute(Tile tile, bool muted)
    {
        if (tile.Engine is { } engine)
            try { engine.Command("set", "mute", muted ? "yes" : "no"); } catch (InvalidOperationException) { }
        if (tile.Web?.CoreWebView2 is { } web)
            try { web.IsMuted = muted; } catch (Exception error) when (error is InvalidOperationException or COMException) { }
    }

    private void UpdateAudioButtons()
    {
        foreach (var tile in tiles)
        {
            var on = tile == audio;
            tile.Sound.Content = on ? "" : "";
            AutomationProperties.SetName(tile.Sound, on ? "Couper le son" : "Son");
            tile.Sound.Foreground = on ? (Brush)owner.Resources["Accent"] : Brushes.White;
        }
    }

    private void Open(Tile tile)
    {
        if (stopped || !tiles.Contains(tile)) return;
        tile.Started = tile.Failed = false;
        tile.Status.Text = "Connexion…";
        tile.Retry.Visibility = Visibility.Collapsed;
        if (tile.Source.Web) { _ = OpenWeb(tile); return; }
        try
        {
            tile.Host!.UpdateLayout();
            tile.Engine?.Dispose();
            tile.Engine = new Mpv(tile.Panel!.Handle, null, 0, tile.Source.Stream!.NoctraToken, live: true);
            tile.Engine.Command("set", "mute", tile == audio ? "no" : "yes");
            if (tile.Volume != null) tile.Engine.Command("set", "volume", tile.Volume.Value.ToString("0", CultureInfo.InvariantCulture));
            tile.Engine.Load(tile.Source.Stream.Url);
            tile.Deadline = DateTime.UtcNow.AddSeconds(20);
        }
        catch (Exception error) when (error is InvalidOperationException or DllNotFoundException or BadImageFormatException)
        {
            tile.Engine?.Dispose();
            tile.Engine = null;
            Fail(tile, "Ce flux n’a pas pu être ouvert.");
        }
    }

    private void Reopen(Tile tile)
    {
        tile.Attempts = 0;
        if (tile.Web?.CoreWebView2 is { } web) { tile.Status.Text = "Actualisation…"; web.Reload(); return; }
        Open(tile);
    }

    private void Fail(Tile tile, string message)
    {
        tile.Failed = true;
        tile.Status.Text = message;
        tile.Retry.Visibility = Visibility.Visible;
    }

    private void Remove(Tile tile)
    {
        if (!tiles.Remove(tile)) return;
        tile.Engine?.Dispose();
        tile.Engine = null;
        try { tile.Web?.Dispose(); } catch (Exception error) when (error is InvalidOperationException or COMException) { }
        grid.Children.Remove(tile.Root);
        owner.MultiviewRemoved(tile.Source);
        if (audio == tile) audio = tiles.FirstOrDefault();
        if (audio != null) foreach (var other in tiles) Mute(other, other != audio);
        UpdateAudioButtons();
        if (tiles.Count == 0) { Close(); return; }
        Relayout();
    }

    private void Tick()
    {
        UpdateReveal();
        foreach (var tile in tiles.ToArray())
        {
            if (tile.Engine is not { } engine) continue;
            foreach (var (kind, _) in engine.Poll())
            {
                if (kind == Mpv.Event.PlaybackRestart && !tile.Started)
                {
                    tile.Started = true;
                    tile.Attempts = 0;
                    tile.Status.Text = "En direct";
                    ApplyQuality(tile);
                }
                else if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown)
                {
                    tile.Engine?.Dispose();
                    tile.Engine = null;
                    // Coupure : un nouvel essai automatique, puis bouton « Réessayer ».
                    if (tile.Attempts++ < 1) { tile.Status.Text = "Coupure · nouvel essai…"; Dispatcher.BeginInvoke(() => Open(tile), DispatcherPriority.Background); }
                    else Fail(tile, "Direct interrompu · essayez un autre serveur");
                    break;
                }
            }
            if (tile.Engine == null) continue;
            if (!tile.Started && DateTime.UtcNow > tile.Deadline)
            {
                tile.Engine.Dispose();
                tile.Engine = null;
                Fail(tile, "Aucune image reçue · essayez un autre serveur");
                continue;
            }
            if (tile.Started && DateTime.UtcNow >= tile.NextBadge)
            {
                tile.NextBadge = DateTime.UtcNow.AddSeconds(2);
                if (engine.Seconds("video-params/h") is > 0 and var height) tile.Badge.Text = height.ToString("0", CultureInfo.InvariantCulture) + "p";
            }
        }
    }

    // Qualité commune : « Auto stable » plafonne selon le nombre de chaînes (720p jusqu'à 4, 540p jusqu'à 9, 480p au-delà),
    // comme la PWA ; la case mise en avant ou en plein écran garde la meilleure qualité.
    private int TargetHeight(Tile tile)
    {
        var choice = Qualities[Math.Max(0, quality.SelectedIndex)].Height;
        if (choice >= 0) return choice;
        if (tile == solo || tile == featured || tiles.Count == 1) return 0;
        return tiles.Count <= 4 ? 720 : tiles.Count <= 9 ? 540 : 480;
    }

    private void ApplyQuality(Tile tile)
    {
        if (tile.Engine is not { } engine || !tile.Started) return;
        try
        {
            var renditions = TvQuality.Read(engine);
            if (renditions.Length < 2) return;
            var target = TargetHeight(tile);
            var chosen = target == 0 ? renditions[0] : renditions.FirstOrDefault(item => item.Height > 0 && item.Height <= target) ?? renditions[^1];
            if (!chosen.Selected) TvQuality.Select(engine, chosen);
        }
        catch (InvalidOperationException) { }
    }

    // Lecteur web dans une case : mêmes protections que le lecteur externe (navigation limitée, publicités
    // bloquées, jeton Noctra seulement pour les adresses TV, aucune fenêtre ni téléchargement).
    private async Task OpenWeb(Tile tile)
    {
        var page = tile.Source.Page!;
        var service = tile.Source.Service!;
        try
        {
            webEnvironment ??= CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(directory, "multiview-players"),
                options: new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
            var environment = await webEnvironment;
            if (stopped || tile.Web == null) return;
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = true;
            await tile.Web.EnsureCoreWebView2Async(environment, options);
            if (stopped || tile.Web?.CoreWebView2 is not { } web) return;
            var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { page.Host };
            var redirects = 0;
            web.Settings.AreHostObjectsAllowed = false; web.Settings.AreDevToolsEnabled = false;
            web.Settings.AreDefaultContextMenusEnabled = false; web.Settings.IsStatusBarEnabled = false;
            web.Settings.IsPasswordAutosaveEnabled = false; web.Settings.IsGeneralAutofillEnabled = false;
            web.Settings.IsSwipeNavigationEnabled = false; web.Settings.AreDefaultScriptDialogsEnabled = false;
            web.PermissionRequested += (_, request) => request.State = CoreWebView2PermissionState.Deny;
            web.DownloadStarting += (_, request) => request.Cancel = true;
            web.NewWindowRequested += (_, request) => request.Handled = true;
            web.NavigationStarting += (_, request) =>
            {
                if (!Uri.TryCreate(request.Uri, UriKind.Absolute, out var target) || !WebUri(target) || !service.AllowWebRequest(target) || AdProtection.Blocked(target))
                { request.Cancel = true; return; }
                if (hosts.Contains(target.Host)) return;
                if (request.IsRedirected && redirects++ < 4) { hosts.Add(target.Host); return; }
                request.Cancel = true;
            };
            web.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            web.WebResourceRequested += (_, request) =>
            {
                if (!Uri.TryCreate(request.Request.Uri, UriKind.Absolute, out var target)) return;
                if (!WebUri(target) && target.Scheme is not ("data" or "blob") || !service.AllowWebRequest(target) || AdProtection.Blocked(target))
                { request.Response = environment.CreateWebResourceResponse(Stream.Null, 403, "Blocked", "Content-Type: text/plain"); return; }
                if (request.Request.Headers.Contains("x-noctra-token")) request.Request.Headers.RemoveHeader("x-noctra-token");
                if (service.WebToken(target) is { } token) request.Request.Headers.SetHeader("x-noctra-token", token);
            };
            web.NavigationCompleted += (_, result) =>
            {
                if (stopped) return;
                if (!result.IsSuccess && result.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled) Fail(tile, "Le lecteur n’a pas chargé · réessayez");
                else if (!tile.Started) tile.Status.Text = "Lecteur web chargé · lancez la vidéo si nécessaire";
            };
            void Message(object? sender, CoreWebView2WebMessageReceivedEventArgs message)
            {
                try
                {
                    if (stopped || message.WebMessageAsJson.Length > 40000) return;
                    using var data = JsonDocument.Parse(message.WebMessageAsJson);
                    var height = data.RootElement.Num("height");
                    if (data.RootElement.Str("type") != "noctra-video" || !(height > 0 && height < 10000)) return;
                    tile.Started = true;
                    tile.Status.Text = "Image reçue";
                    tile.Badge.Text = height.ToString("0", CultureInfo.InvariantCulture) + "p";
                }
                catch (Exception error) when (error is JsonException or COMException) { }
            }
            web.WebMessageReceived += Message;
            void Observe(CoreWebView2Frame frame) { frame.WebMessageReceived += Message; frame.FrameCreated += (_, args) => Observe(args.Frame); }
            web.FrameCreated += (_, args) => Observe(args.Frame);
            web.ProcessFailed += (_, _) => Fail(tile, "Le lecteur s’est interrompu · réessayez");
            await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.ProtectionScript(true));
            await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.OhaMediaCompatibility);
            await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.TargetChannel(tile.Source.Name));
            web.IsMuted = tile != audio;
            web.Navigate(page.AbsoluteUri);
        }
        catch (WebView2RuntimeNotFoundException) { Fail(tile, "Composant Microsoft WebView2 absent · relancez le setup"); }
        catch (Exception error) when (error is InvalidOperationException or COMException or IOException) { if (!stopped) Fail(tile, "Impossible d’ouvrir ce lecteur · réessayez"); }
    }

    private static bool WebUri(Uri uri) => uri.UserInfo.Length == 0 && (uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback);

    // Double-clic sur l'image d'un direct : mettre en avant (l'image appartient au lecteur, d'où ce filtre).
    internal void VideoDoubleClick(IntPtr window)
    {
        var tile = tiles.FirstOrDefault(item => item.Panel is { IsHandleCreated: true } panel && (panel.Handle == window || IsChild(panel.Handle, window)));
        if (tile == null) return;
        if (solo != null) { SetSolo(null); SetFullscreen(false); return; }
        SetFeatured(tile);
    }
    internal void ToggleFullscreen() => SetFullscreen(!screen.Active);
    internal void LeaveFullscreen() { SetSolo(null); SetFullscreen(false); }
    internal bool OwnsVideo(IntPtr window) => tiles.Any(item => item.Panel is { IsHandleCreated: true } panel && (panel.Handle == window || IsChild(panel.Handle, window)));
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);

    private void Stop()
    {
        if (stopped) return;
        stopped = true;
        timer.Stop();
        Forms.Application.RemoveMessageFilter(input);
        reveal.IsOpen = false;
        foreach (var tile in tiles)
        {
            tile.Engine?.Dispose();
            tile.Engine = null;
            try { tile.Web?.Dispose(); } catch (Exception error) when (error is InvalidOperationException or COMException) { }
        }
    }

    private sealed class MultiviewInput(MultiviewWindow owner) : Forms.IMessageFilter
    {
        private IntPtr lastWindow, clickWindow;
        private long lastDown;
        private Forms.Timer? clickDelay;
        public bool PreFilterMessage(ref Forms.Message message)
        {
            if (message.Msg == 0x0100 && owner.OwnsVideo(message.HWnd))
            {
                // Touches reçues par l'image d'un direct : plein écran (F11) et sortie (Échap).
                var key = (Forms.Keys)(int)message.WParam;
                if (key == Forms.Keys.F11) { owner.ToggleFullscreen(); return true; }
                if (key == Forms.Keys.Escape) { owner.LeaveFullscreen(); return true; }
                return false;
            }
            if (message.Msg is not (0x0201 or 0x0203) || !owner.OwnsVideo(message.HWnd)) return false;
            var now = Environment.TickCount64;
            var same = message.HWnd == lastWindow && now - lastDown <= Forms.SystemInformation.DoubleClickTime;
            lastWindow = message.HWnd;
            lastDown = now;
            if (message.Msg == 0x0203 || same)
            {
                lastDown = 0;
                clickDelay?.Stop();
                owner.VideoDoubleClick(message.HWnd);
                return false;
            }
            // Clic simple, après le délai d'un éventuel double-clic : le son passe à cette chaîne.
            if (clickDelay == null)
            {
                clickDelay = new Forms.Timer { Interval = Math.Clamp(Forms.SystemInformation.DoubleClickTime, 200, 500) };
                clickDelay.Tick += (_, _) => { clickDelay.Stop(); owner.VideoClick(clickWindow); };
            }
            clickWindow = message.HWnd;
            clickDelay.Stop();
            clickDelay.Start();
            return false;
        }
    }
}

public partial class MainWindow
{
    private readonly List<MultiSource> multiviewSelection = [];
    private MultiviewWindow? multiview;

    private void SelectMultiview(string name, LiveStream stream) => SelectMultiview(new MultiSource(name, stream));
    private void SelectMultiview(string name, Uri page, NoctraService service) => SelectMultiview(new MultiSource(name, null, page, service));

    private void SelectMultiview(MultiSource source)
    {
        // Multivue ouverte : la chaîne y entre tout de suite.
        if (multiview is { IsLoaded: true } open)
        {
            if (open.Contains(source)) { ShowStatus("Cette chaîne est déjà dans la multivue."); return; }
            if (!open.Add(source)) { ShowStatus("La multivue contient déjà " + MultiviewWindow.Maximum + " chaînes."); return; }
            if (!multiviewSelection.Any(item => item.Key == source.Key)) multiviewSelection.Add(source);
            ShowStatus(source.Name + " ajoutée à la multivue (" + open.Count + ").");
            open.Activate();
            return;
        }
        if (multiviewSelection.Any(item => item.Key == source.Key)) { ShowStatus("Cette chaîne est déjà dans la multivue."); return; }
        if (multiviewSelection.Count >= MultiviewWindow.Maximum)
        {
            ShowStatus("La multivue contient déjà " + MultiviewWindow.Maximum + " chaînes.");
            return;
        }
        multiviewSelection.Add(source);
        if (pendingLive == null) _ = Navigate(MultiviewPage);
        else ShowStatus(source.Name + " ajoutée à la multivue (" + multiviewSelection.Count + "/" + MultiviewWindow.Maximum + ").");
    }

    internal void MultiviewRemoved(MultiSource source)
    {
        multiviewSelection.RemoveAll(item => item.Key == source.Key);
        if (page?.Title == "Multivue") _ = Navigate(MultiviewPage, back: true);
    }

    // Lecteur TV : la chaîne en cours (serveur actuel) part dans la multivue.
    private void AddLiveToMultiview(object sender, RoutedEventArgs args)
    {
        if (pendingLive is not { } state || state.Next < 1 || state.Next > state.Streams.Length) return;
        SelectMultiview(MediaTitle.Text, state.Streams[state.Next - 1]);
    }

    private Page MultiviewPage => new("Multivue", ButtonTab.Tv, (account, cancellation) =>
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Multivue", "Jusqu’à " + MultiviewWindow.Maximum + " chaînes, directs et lecteurs web. Une case peut être mise en avant ; le son suit la chaîne choisie."));
        foreach (var item in multiviewSelection.ToArray())
            PageContent.Children.Add(Row(item.Name, item.Web ? "Lecteur web externe" : "Flux direct", Action("Retirer", () =>
            {
                multiviewSelection.Remove(item);
                _ = Navigate(MultiviewPage, back: true);
            })));
        var buttons = new WrapPanel();
        var add = Action("Ajouter une chaîne", () => _ = Navigate(TvPage()));
        buttons.Children.Add(add);
        var play = Action("Lancer la multivue", () =>
        {
            multiview?.Close();
            multiview = new MultiviewWindow(this, multiviewSelection.ToArray(), dataDirectory);
            multiview.Closed += (_, _) => multiview = null;
            multiview.Show();
        }, "Primary");
        play.IsEnabled = multiviewSelection.Count > 0;
        play.Margin = new Thickness(8, 0, 0, 0);
        buttons.Children.Add(play);
        if (multiviewSelection.Count > 0)
        {
            var clear = Action("Vider la sélection", () => { multiviewSelection.Clear(); _ = Navigate(MultiviewPage, back: true); });
            clear.Margin = new Thickness(8, 0, 0, 0);
            buttons.Children.Add(clear);
        }
        PageContent.Children.Add(buttons);
        return System.Threading.Tasks.Task.CompletedTask;
    });
}
