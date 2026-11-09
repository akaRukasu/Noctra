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
        var grid = new AdaptiveTilePanel { MinimumCellWidth = compact ? 250 : 310, MaximumColumns = 2,
            BalanceFour = true, Margin = new Thickness(-8, 0, -8, 0) };
        foreach (var library in libraries)
        {
            var mosaic = new Grid { Height = compact ? 140 : 218, ClipToBounds = true,
                Background = ColorOf("#15253B") };
            var images = Enumerable.Range(0, 3).Select(_ => new Image { Stretch = Stretch.UniformToFill }).ToArray();
            for (var index = 0; index < images.Length; index++)
            {
                mosaic.ColumnDefinitions.Add(new ColumnDefinition());
                Grid.SetColumn(images[index], index);
                images[index].Margin = new Thickness(index == 0 ? 0 : 3, 0, 0, 0);
                mosaic.Children.Add(images[index]);
            }
            var shade = new Border { Background = new LinearGradientBrush(Color.FromArgb(0, 9, 17, 31), Color.FromArgb(160, 9, 17, 31), 90) };
            Grid.SetColumnSpan(shade, 3);
            mosaic.Children.Add(shade);
            var marker = new Border { Background = ColorOf("#CB0C1728"), CornerRadius = new CornerRadius(12),
                Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(13), HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top, Child = Text("MÉDIATHÈQUE", 10, true, "Muted") };
            Grid.SetColumnSpan(marker, 3);
            mosaic.Children.Add(marker);
            var footer = new DockPanel { Margin = new Thickness(19, 15, 18, 18) };
            var arrow = Text("›", 25, color: "Accent");
            arrow.VerticalAlignment = VerticalAlignment.Center;
            arrow.Margin = new Thickness(10, 0, 0, 0);
            DockPanel.SetDock(arrow, Dock.Right);
            footer.Children.Add(arrow);
            var labels = new StackPanel();
            var title = Text(library.Name, compact ? 19 : 23, true);
            title.TextTrimming = TextTrimming.CharacterEllipsis;
            labels.Children.Add(title);
            var count = Text("Explorer les titres", 12, color: "Muted");
            count.Margin = new Thickness(0, 5, 0, 0);
            labels.Children.Add(count);
            footer.Children.Add(labels);
            var content = new StackPanel();
            content.Children.Add(mosaic);
            content.Children.Add(footer);
            var panel = new Border { Background = ColorOf("#D0122032"), BorderBrush = ColorOf("#35465A70"),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(24), Child = content, ClipToBounds = true };
            panel.SizeChanged += (_, _) => panel.Clip = new RectangleGeometry(new Rect(panel.RenderSize), 23, 23);
            var button = Action(library.Name, () => _ = Navigate(BrowsePage(library.Name, ButtonTab.Library, parent: library.Id)), "Card");
            System.Windows.Automation.AutomationProperties.SetAutomationId(button, "LibraryTile-" + library.Id);
            button.Content = panel;
            button.Margin = new Thickness(8, 0, 8, 20);
            grid.Children.Add(button);
            _ = FillLibraryMosaic(account, library, images, count, cancellation, previews);
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
            var items = (result?.Items ?? []).Take(3).ToArray();
            if (artwork is not { } art) return;
            await Task.WhenAll(images.Select((image, index) => art.Load(image,
                items.Length == 0 ? library : items[index % items.Length], items.Length == 0, 330, cancellation)));
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
        { if (!cancellation.IsCancellationRequested) count.Text = "Explorer la médiathèque"; }
    }
}
