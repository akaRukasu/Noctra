using System;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Threading;

namespace Noctra.Windows;

// 0.7 : aperçu au survol des cartes. Quand le pointeur s'attarde sur une affiche, une carte
// agrandie s'ouvre par-dessus (visuel, note, durée, synopsis, lecture directe, fiche, favori).
public partial class MainWindow
{
    private static readonly bool HoverPreviews = Environment.GetEnvironmentVariable("NOCTRA_HOVER_PREVIEW") != "0";
    private Popup? hoverPopup;
    private Border? hoverPanel;
    private Button? hoverCard;
    private (Button Card, MediaItem Item, CancellationToken Token)? hoverPending;
    private DispatcherTimer? hoverDelay, hoverWatch;

    private void AttachHoverPreview(Button card, MediaItem item, CancellationToken cancellation)
    {
        if (!HoverPreviews || item.Type is not ("Movie" or "Series" or "Episode") || !PlayRequest.Identifier(item.Id)) return;
        if (hoverDelay == null)
        {
            hoverDelay = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(650) };
            hoverDelay.Tick += (_, _) =>
            {
                hoverDelay.Stop();
                if (hoverPending is { } pending && !(hoverPopup?.IsOpen == true && hoverCard == pending.Card) && pending.Card.IsMouseOver && !pending.Token.IsCancellationRequested && IsActive &&
                    LibraryShell.IsVisible && client != null) ShowHoverPreview(pending.Card, pending.Item, pending.Token);
            };
            hoverWatch = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(160) };
            hoverWatch.Tick += (_, _) =>
            {
                if (hoverPopup?.IsOpen != true) { hoverWatch.Stop(); return; }
                // Position réelle du pointeur (l'état « survolé » de WPF n'est pas mis à jour quand le
                // pointeur part directement vers la barre de titre ou hors de la fenêtre).
                if (!PointerInside(hoverPanel) && !PointerInside(hoverCard)) CloseHoverPreview();
            };
            Scroller.ScrollChanged += (_, args) => { if (args.VerticalChange != 0) CloseHoverPreview(); };
            // Fenêtre d'une autre application au premier plan : l'aperçu se ferme (pas pour l'extrait de Noctra lui-même).
            Deactivated += (_, _) => { if (!ForegroundIsNoctra()) CloseHoverPreview(); };
        }
        // Un vrai survol (plusieurs mouvements du pointeur), pas un simple passage.
        var moves = 0;
        card.MouseEnter += (_, _) => moves = 0;
        card.MouseMove += (_, _) =>
        {
            // Aperçu de cette carte déjà ouvert : les mouvements (y compris ceux que Windows envoie quand l'extrait
            // s'ouvre au-dessus) ne le relancent pas ; avant, l'aperçu se rouvrait et coupait l'extrait sans cesse.
            if (hoverPopup?.IsOpen == true && hoverCard == card) { moves = 0; return; }
            if (++moves != 3) return;
            hoverPending = (card, item, cancellation);
            hoverDelay.Stop();
            hoverDelay.Start();
        };
        card.MouseLeave += (_, _) => { if (hoverPending?.Card == card && hoverPopup?.IsOpen != true) hoverDelay.Stop(); };
    }

    private static bool ForegroundIsNoctra()
    {
        var foreground = GetForegroundWindow();
        return foreground != IntPtr.Zero && GetWindowThreadProcessId(foreground, out var process) != 0 && process == (uint)Environment.ProcessId;
    }
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);

    private static bool PointerInside(FrameworkElement? element)
    {
        if (element is not { IsVisible: true } || PresentationSource.FromVisual(element) == null) return false;
        try
        {
            var first = element.PointToScreen(new Point());
            var last = element.PointToScreen(new Point(element.ActualWidth, element.ActualHeight));
            var pointer = System.Windows.Forms.Cursor.Position;
            return pointer.X >= Math.Min(first.X, last.X) && pointer.X < Math.Max(first.X, last.X) &&
                pointer.Y >= Math.Min(first.Y, last.Y) && pointer.Y < Math.Max(first.Y, last.Y);
        }
        catch (InvalidOperationException) { return false; }
    }

    private void CloseHoverPreview()
    {
        StopHoverClip();
        hoverDelay?.Stop();
        hoverWatch?.Stop();
        hoverPending = null;
        if (hoverPopup is not { IsOpen: true } popup) return;
        popup.IsOpen = false;
        hoverCard = null;
    }

    private void ShowHoverPreview(Button card, MediaItem item, CancellationToken cancellation)
    {
        CloseHoverPreview();
        var width = Math.Clamp(card.ActualWidth * 1.55, 340, 420);
        var image = new Image { Stretch = Stretch.UniformToFill };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(image);
        var visual = new Grid { Height = Math.Round(width * 9 / 16), Background = new LinearGradientBrush(Color.FromRgb(36, 32, 62), Color.FromRgb(16, 20, 34), 45) };
        visual.Children.Add(image);
        visual.Children.Add(new Border { Background = new LinearGradientBrush
        {
            StartPoint = new Point(.5, .35), EndPoint = new Point(.5, 1),
            GradientStops = { new GradientStop(Color.FromArgb(0, 19, 21, 31), 0), new GradientStop(Color.FromArgb(255, 19, 21, 31), 1) }
        } });
        var logo = new Image { MaxHeight = 64, MaxWidth = width * .6, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(16, 0, 16, 10), Visibility = Visibility.Collapsed };
        visual.Children.Add(logo);
        var body = new StackPanel { Margin = new Thickness(16, 6, 16, 16) };
        var title = Text(item.DisplayTitle, 19, true);
        title.TextTrimming = TextTrimming.CharacterEllipsis;
        body.Children.Add(title);
        if (artwork is { } art) _ = ShowLogo(art, logo, title, item, cancellation);
        var facts = new[]
        {
            item.Type == "Episode" ? item.Caption : item.ProductionYear?.ToString(CultureInfo.InvariantCulture),
            item.CommunityRating is > 0 ? "★ " + item.CommunityRating.Value.ToString("0.0", CultureInfo.CurrentCulture) : null,
            item.RunTimeTicks is > 0 && item.Type != "Series" ? Duration(TimeSpan.FromTicks(item.RunTimeTicks.Value)) : item.Type == "Series" ? "Série" : null,
            item.OfficialRating
        }.Where(part => !string.IsNullOrWhiteSpace(part));
        var meta = Text(string.Join("  ·  ", facts), 12.5, color: "Muted");
        meta.Margin = new Thickness(0, 4, 0, 0);
        body.Children.Add(meta);
        if (item.Genres is { Length: > 0 } genres)
        {
            var tags = Text(string.Join(" • ", genres.Take(3)), 12, true, "Accent");
            tags.Margin = new Thickness(0, 6, 0, 0);
            body.Children.Add(tags);
        }
        if (!string.IsNullOrWhiteSpace(item.Overview))
        {
            var overview = Text(item.Overview, 13, color: "Ink");
            overview.Opacity = .8;
            overview.TextWrapping = TextWrapping.Wrap;
            overview.TextTrimming = TextTrimming.WordEllipsis;
            overview.MaxHeight = 58;
            overview.LineHeight = 19;
            overview.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
            overview.Margin = new Thickness(0, 10, 0, 0);
            body.Children.Add(overview);
        }
        if (item.Progress > 0)
        {
            var track = new Grid { Height = 4, Margin = new Thickness(0, 12, 0, 0) };
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(item.Progress, .02, 1), GridUnitType.Star) });
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(1 - item.Progress, 0, .98), GridUnitType.Star) });
            var rail = new Border { CornerRadius = new CornerRadius(2), Background = ColorOf("#33FFFFFF") };
            Grid.SetColumnSpan(rail, 2);
            track.Children.Add(rail);
            track.Children.Add(new Border { CornerRadius = new CornerRadius(2), Background = BrushFor("AccentGradient") });
            body.Children.Add(track);
        }
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 14, 0, 0) };
        var play = Action(item.Resume > 0 ? "▶   Reprendre" : "▶   Lire", async () =>
        {
            CloseHoverPreview();
            if (item.CanPlay) { StartPlayback(item); return; }
            if (client is not { } account) return;
            try { if (await account.PlayableSeries(item.Id, cancellation) is { } episode) StartPlayback(episode); else OpenDetail(item, page?.Tab ?? ButtonTab.Home); }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { OpenDetail(item, page?.Tab ?? ButtonTab.Home); }
        }, "Primary");
        AutomationProperties.SetName(play, "Aperçu · " + (item.Resume > 0 ? "Reprendre" : "Lire"));
        actions.Children.Add(play);
        Button Round(string glyph, string name, Action click)
        {
            var button = Action(name, click, "Round");
            button.Content = glyph;
            button.Margin = new Thickness(8, 0, 0, 0);
            button.Background = ColorOf("#1FFFFFFF");
            button.ToolTip = name;
            return button;
        }
        actions.Children.Add(Round("", "Voir la fiche", () => { CloseHoverPreview(); OpenDetail(item, page?.Tab ?? ButtonTab.Home); }));
        var favorite = item.UserData?.IsFavorite == true;
        Button? heart = null;
        heart = Round(favorite ? "" : "", favorite ? "Retirer des favoris" : "Ajouter aux favoris", async () =>
        {
            if (client is not { } account) return;
            try
            {
                await account.Favorite(item.Id, !favorite, cancellation);
                favorite = !favorite;
                heart!.Content = favorite ? "" : "";
                AutomationProperties.SetName(heart, favorite ? "Retirer des favoris" : "Ajouter aux favoris");
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { }
        });
        actions.Children.Add(heart);
        body.Children.Add(actions);
        var content = new StackPanel();
        content.Children.Add(visual);
        content.Children.Add(body);
        var panel = new Border
        {
            Width = width, Child = content, Background = ColorOf("#13151F"), BorderBrush = ColorOf("#33FFFFFF"), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(16), RenderTransformOrigin = new Point(.5, .5), RenderTransform = new ScaleTransform(1, 1)
        };
        AutomationProperties.SetAutomationId(panel, "HoverPreview");
        content.SizeChanged += (_, _) => content.Clip = new RectangleGeometry(new Rect(content.RenderSize), 15, 15);
        // 0.8 : ombre dessinée par des contours dégradés (une fenêtre transparente est rendue sans
        // accélération graphique : un effet d'ombre y coûtait cher à chaque image).
        UIElement halo = panel;
        foreach (var (alpha, radius) in new[] { ((byte)70, 20.0), ((byte)36, 25.0), ((byte)16, 30.0) })
            halo = new Border { Child = halo, Padding = new Thickness(5), CornerRadius = new CornerRadius(radius),
                Background = new SolidColorBrush(Color.FromArgb(alpha, 0, 0, 0)) };
        var shadow = new Border { Padding = new Thickness(12, 8, 12, 16), Child = halo };
        hoverPanel = panel;
        hoverCard = card;
        // Centré sur la carte, mais toujours entier dans la fenêtre (cartes au bord, bas de page).
        hoverPopup = new Popup
        {
            AllowsTransparency = true, Placement = PlacementMode.Custom, PlacementTarget = card, StaysOpen = true, Child = shadow, Focusable = false,
            CustomPopupPlacementCallback = (popupSize, targetSize, _) =>
            {
                var scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
                var origin = card.TranslatePoint(new Point(0, 0), LibraryShell);
                var left = origin.X * scale + (targetSize.Width - popupSize.Width) / 2;
                var top = origin.Y * scale + (targetSize.Height - popupSize.Height) / 2;
                left = Math.Clamp(left, 0, Math.Max(0, LibraryShell.ActualWidth * scale - popupSize.Width));
                top = Math.Clamp(top, NavigationBar.ActualHeight * scale * .5, Math.Max(0, LibraryShell.ActualHeight * scale - popupSize.Height));
                return [new CustomPopupPlacement(new Point(left - origin.X * scale, top - origin.Y * scale), PopupPrimaryAxis.None)];
            }
        };
        _ = artwork?.Load(image, item, true, 760, cancellation);
        hoverPopup.IsOpen = true;
        _ = StartHoverClip(visual, item, cancellation);
        if (SystemParameters.ClientAreaAnimation)
        {
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            var grow = new DoubleAnimation(.88, 1, TimeSpan.FromMilliseconds(220)) { EasingFunction = ease };
            ((ScaleTransform)panel.RenderTransform).BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            ((ScaleTransform)panel.RenderTransform).BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            panel.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180)));
        }
        hoverWatch?.Start();
    }

    // ---------- 0.8 : extrait vidéo dans l'aperçu d'un titre en cours (« Continuer à regarder ») ----------
    // La carte d'aperçu est une fenêtre transparente, où le lecteur ne peut pas dessiner : l'extrait est joué (son coupé,
    // là où la lecture s'était arrêtée) dans une petite fenêtre sans bordure posée exactement sur son visuel.
    private sealed class ClipWindow : System.Windows.Forms.Form
    {
        protected override bool ShowWithoutActivation => true;
        protected override System.Windows.Forms.CreateParams CreateParams
        {
            get { var parameters = base.CreateParams; parameters.ExStyle |= 0x08000000 | 0x00000080; return parameters; } // pas d'activation, pas d'entrée dans Alt+Tab
        }
    }
    private ClipWindow? clipWindow;
    private Mpv? clipEngine;
    private DispatcherTimer? clipTimer;
    private CancellationTokenSource? clipCancel;

    private async System.Threading.Tasks.Task StartHoverClip(FrameworkElement visual, MediaItem item, CancellationToken cancellation)
    {
        StopHoverClip();
        if (!item.CanPlay || item.IsAudio || item.Resume <= 0 || client is not { } account || active != null || pendingMedia != null || pendingLive != null ||
            !System.IO.File.Exists(Mpv.LibraryPath)) return;
        var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        clipCancel = stop;
        var popup = hoverPopup;
        try
        {
            await System.Threading.Tasks.Task.Delay(450, stop.Token); // après l'animation d'ouverture de la carte
            var request = new PlayRequest(item.Id, account.User.Id, account.Token, account.DeviceId, Math.Clamp(item.Resume, 0, TimeSpan.TicksPerDay));
            if (!request.IsValid()) return;
            var session = new JellyfinPlayback(Jellyfin.Http, account.Root, request, false, null);
            var media = await session.Prepare(stop.Token, allowDirect: true);
            if (stop.IsCancellationRequested || hoverPopup != popup || popup?.IsOpen != true || ClipBounds(visual) is not { } bounds) return;
            var window = new ClipWindow
            {
                FormBorderStyle = System.Windows.Forms.FormBorderStyle.None, ShowInTaskbar = false, TopMost = true,
                StartPosition = System.Windows.Forms.FormStartPosition.Manual, BackColor = System.Drawing.Color.Black, Bounds = bounds,
                Cursor = System.Windows.Forms.Cursors.Hand
            };
            RoundTopCorners(window, bounds);
            window.Click += (_, _) => { CloseHoverPreview(); StartPlayback(item); };
            var engine = new Mpv(window.Handle, session.MediaAuthorization, session.StartSeconds, software: !preferences.HardwareDecoding, muted: true);
            engine.Load(media);
            clipWindow = window; clipEngine = engine;
            Trace($"extrait demandé {item.Id} à {session.StartSeconds:0.0} s");
            var shown = false;
            clipTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
            clipTimer.Tick += (_, _) =>
            {
                if (clipEngine != engine || hoverPopup != popup || popup?.IsOpen != true) { StopHoverClip(); return; }
                foreach (var (kind, _) in engine.Poll())
                {
                    if (kind == Mpv.Event.PlaybackRestart && !shown)
                    {
                        // Affichée à la première image : jamais de rectangle noir sur la carte.
                        shown = true;
                        window.Show();
                        Trace($"extrait affiché {item.Id}");
                    }
                    else if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown) { StopHoverClip(); return; }
                }
                // La carte peut se replacer (titre remplacé par le logo) : l'extrait la suit.
                if (ClipBounds(visual) is { } now && now != window.Bounds) { window.Bounds = now; RoundTopCorners(window, now); }
            };
            clipTimer.Start();
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or InvalidOperationException or System.Text.Json.JsonException or DllNotFoundException) { }
    }

    private static System.Drawing.Rectangle? ClipBounds(FrameworkElement visual)
    {
        if (!visual.IsVisible || PresentationSource.FromVisual(visual) == null || visual.ActualWidth < 40) return null;
        try
        {
            var first = visual.PointToScreen(new Point());
            var last = visual.PointToScreen(new Point(visual.ActualWidth, visual.ActualHeight));
            return new System.Drawing.Rectangle((int)Math.Round(first.X), (int)Math.Round(first.Y), (int)Math.Round(last.X - first.X), (int)Math.Round(last.Y - first.Y));
        }
        catch (InvalidOperationException) { return null; }
    }

    // Coins du haut arrondis comme la carte (les coins du bas, sous le dégradé, restent droits).
    private void RoundTopCorners(System.Windows.Forms.Form window, System.Drawing.Rectangle bounds)
    {
        var radius = (int)Math.Round(30 * VisualTreeHelper.GetDpi(this).DpiScaleX);
        var region = CreateRoundRectRgn(0, 0, bounds.Width + 1, bounds.Height + radius, radius, radius);
        if (region == IntPtr.Zero) return;
        window.Region = System.Drawing.Region.FromHrgn(region);
        DeleteObject(region);
    }
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int width, int height);
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr handle);

    private void StopHoverClip()
    {
        clipCancel?.Cancel();
        clipCancel = null;
        clipTimer?.Stop();
        clipTimer = null;
        if (clipEngine is { } engine) { clipEngine = null; engine.Dispose(); Trace("extrait fermé"); }
        if (clipWindow is { } window) { clipWindow = null; window.Close(); window.Dispose(); }
    }

    // « Regarder ensemble » depuis une fiche : groupe créé avec ce titre, ou titre lancé pour le groupe.
    private Button TogetherButton(MediaItem item)
    {
        var button = Action(syncGroup != null ? "Lancer pour le groupe" : "Regarder ensemble", () =>
        {
            if (syncGroup != null) { SyncPlayItem(item, item.Resume); return; }
            if (!realtimeConnected) { ShowStatus("Connexion temps réel au serveur indisponible : SyncPlay ne peut pas démarrer."); return; }
            SyncCreate("Soirée de " + (client?.User.Name ?? "Noctra"), item);
            _ = Navigate(SyncPlayPage);
        });
        AutomationProperties.SetAutomationId(button, "TogetherButton");
        return button;
    }
}
