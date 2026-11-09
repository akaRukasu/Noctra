using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Noctra.Windows;

public partial class MainWindow
{
    private readonly SemaphoreSlim libraryPreviewGate = new(3);

    private FrameworkElement LibraryTiles(Jellyfin account, MediaItem[] libraries, CancellationToken cancellation,
        bool compact = false, Dictionary<string, ItemPage?>? previews = null)
    {
        var grid = new AdaptiveTilePanel { MinimumCellWidth = compact ? 300 : 340, MaximumColumns = 2,
            BalanceFour = true, Margin = new Thickness(-9, 0, -9, 0) };
        foreach (var library in libraries)
        {
            // 0.6 : une grande image par médiathèque (visuel d'un titre récent), nom et compte en surimpression.
            var tile = new Grid { Height = compact ? 196 : 240, ClipToBounds = true, Background = ColorOf("#161927") };
            var picture = new Image { Stretch = Stretch.UniformToFill, RenderTransformOrigin = new Point(.5, .5) };
            RenderOptions.SetBitmapScalingMode(picture, BitmapScalingMode.HighQuality);
            FadeInWhenLoaded(picture);
            var zoom = new ScaleTransform(1, 1);
            picture.RenderTransform = zoom;
            tile.Children.Add(picture);
            tile.Children.Add(new Border { Background = new LinearGradientBrush
            {
                StartPoint = new Point(0, 0), EndPoint = new Point(0, 1),
                GradientStops = { new GradientStop(Color.FromArgb(20, 7, 8, 13), 0), new GradientStop(Color.FromArgb(70, 7, 8, 13), .45), new GradientStop(Color.FromArgb(235, 7, 8, 13), 1) }
            } });
            var footer = new DockPanel { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(24, 0, 22, 20) };
            var arrow = new Border { Width = 38, Height = 38, CornerRadius = new CornerRadius(19), Background = ColorOf("#26FFFFFF"),
                VerticalAlignment = VerticalAlignment.Center, Child = new TextBlock { Text = "\uE76C", FontFamily = (FontFamily)Resources["IconFont"],
                FontSize = 12, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = BrushFor("Ink") } };
            DockPanel.SetDock(arrow, Dock.Right);
            footer.Children.Add(arrow);
            var labels = new StackPanel();
            var title = Text(library.Name, compact ? 26 : 30, true);
            title.TextTrimming = TextTrimming.CharacterEllipsis;
            labels.Children.Add(title);
            var count = Text("Explorer les titres", 13, color: "Muted");
            count.Margin = new Thickness(0, 4, 0, 0);
            labels.Children.Add(count);
            footer.Children.Add(labels);
            tile.Children.Add(footer);
            var shine = new Border { BorderBrush = ColorOf("#40FFFFFF"), BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(18), Opacity = 0 };
            tile.Children.Add(shine);
            tile.SizeChanged += (_, _) => tile.Clip = new RectangleGeometry(new Rect(tile.RenderSize), 18, 18);
            var button = Action(library.Name, () => _ = Navigate(BrowsePage(library.Name, ButtonTab.Library, parent: library.Id)), "Card");
            System.Windows.Automation.AutomationProperties.SetAutomationId(button, "LibraryTile-" + library.Id);
            button.Content = tile;
            button.Margin = new Thickness(9, 0, 9, 18);
            void Hover(bool on)
            {
                var ease = new System.Windows.Media.Animation.CubicEase { EasingMode = System.Windows.Media.Animation.EasingMode.EaseOut };
                var scale = new System.Windows.Media.Animation.DoubleAnimation(on ? 1.06 : 1, TimeSpan.FromMilliseconds(420)) { EasingFunction = ease };
                zoom.BeginAnimation(ScaleTransform.ScaleXProperty, scale);
                zoom.BeginAnimation(ScaleTransform.ScaleYProperty, scale);
                shine.BeginAnimation(OpacityProperty, new System.Windows.Media.Animation.DoubleAnimation(on ? 1 : 0, TimeSpan.FromMilliseconds(200)));
            }
            button.MouseEnter += (_, _) => Hover(true);
            button.MouseLeave += (_, _) => Hover(false);
            button.GotKeyboardFocus += (_, _) => Hover(true);
            button.LostKeyboardFocus += (_, _) => Hover(false);
            grid.Children.Add(button);
            _ = FillLibraryMosaic(account, library, [picture], count, cancellation, previews);
        }
        return grid;
    }

    private async Task FillLibraryMosaic(Jellyfin account, MediaItem library, Image[] images, TextBlock count,
        CancellationToken cancellation, Dictionary<string, ItemPage?>? previews)
    {
        try
        {
            ItemPage? result;
            if (previews != null) previews.TryGetValue(library.Id, out result);
            else
            {
                await libraryPreviewGate.WaitAsync(cancellation);
                try { result = await account.Browse(null, library.Id, null, 0, true, cancellation); }
                finally { libraryPreviewGate.Release(); }
            }
            if (cancellation.IsCancellationRequested || client != account) return;
            count.Text = result == null ? "Catalogue indisponible" : result.TotalRecordCount is int total ?
                total == 1 ? "1 titre à découvrir" : $"{total:N0} titres à découvrir" : "Explorer les titres";
            var items = (result?.Items ?? []).Where(item => item.BackdropImageTags is { Length: > 0 } || item.ParentBackdropItemId != null)
                .Concat(result?.Items ?? []).Take(images.Length).ToArray();
            if (artwork is not { } art) return;
            // Visuel paysage d'un titre récent ; sinon l'image de la médiathèque.
            await Task.WhenAll(images.Select((image, index) => items.Length == 0
                ? art.Load(image, library, false, 900, cancellation)
                : art.Load(image, items[index % items.Length], true, 900, cancellation)));
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
        { if (!cancellation.IsCancellationRequested) count.Text = "Explorer la médiathèque"; }
    }
}
