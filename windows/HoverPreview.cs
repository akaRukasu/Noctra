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
                if (hoverPending is { } pending && pending.Card.IsMouseOver && !pending.Token.IsCancellationRequested && IsActive &&
                    LibraryShell.IsVisible && client != null) ShowHoverPreview(pending.Card, pending.Item, pending.Token);
            };
            hoverWatch = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(160) };
            hoverWatch.Tick += (_, _) =>
            {
                if (hoverPopup?.IsOpen != true) { hoverWatch.Stop(); return; }
                if (hoverPanel?.IsMouseOver != true && hoverCard?.IsMouseOver != true) CloseHoverPreview();
            };
            Scroller.ScrollChanged += (_, args) => { if (args.VerticalChange != 0) CloseHoverPreview(); };
            Deactivated += (_, _) => CloseHoverPreview();
        }
        // Un vrai survol (plusieurs mouvements du pointeur), pas un simple passage.
        var moves = 0;
        card.MouseEnter += (_, _) => moves = 0;
        card.MouseMove += (_, _) =>
        {
            if (++moves != 3) return;
            hoverPending = (card, item, cancellation);
            hoverDelay.Stop();
            hoverDelay.Start();
        };
        card.MouseLeave += (_, _) => { if (hoverPending?.Card == card && hoverPopup?.IsOpen != true) hoverDelay.Stop(); };
    }

    private void CloseHoverPreview()
    {
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
        var shadow = new Border { Padding = new Thickness(26), Child = panel };
        panel.Effect = new DropShadowEffect { BlurRadius = 36, ShadowDepth = 10, Opacity = .7, Color = Colors.Black };
        hoverPanel = panel;
        hoverCard = card;
        hoverPopup = new Popup { AllowsTransparency = true, Placement = PlacementMode.Center, PlacementTarget = card, StaysOpen = true, Child = shadow, Focusable = false };
        _ = artwork?.Load(image, item, true, 760, cancellation);
        hoverPopup.IsOpen = true;
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
