using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

namespace Noctra.Windows;

public partial class MainWindow
{
    private async Task RenderDiscovery(Jellyfin account, string category, int index, string? query, CancellationToken cancellation)
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(query == null ? "Des histoires à découvrir" : "« " + query + " »", "Trouvez votre prochain film ou votre prochaine série."));
        if (account.NoctraRoot == null) { PageContent.Children.Add(Message("Connectez-vous avec l’adresse Noctra pour accéder à Découverte.")); return; }
        var service = new NoctraService(account, account.NoctraRoot);
        var navigation = new DockPanel { Margin = new Thickness(0, 0, 0, 22) };
        var tools = new StackPanel { Orientation = Orientation.Horizontal }; DockPanel.SetDock(tools, Dock.Right);
        tools.Children.Add(Action("Mes demandes", () => _ = Navigate(RequestsPage)));
        var roulette = Action("Roulette", () => _ = Navigate(RoulettePage)); roulette.Margin = new Thickness(8, 0, 0, 0); tools.Children.Add(roulette); navigation.Children.Add(tools);
        var tabs = new WrapPanel();
        foreach (var (key, label) in new[] { ("smart", "Pour vous"), ("trending", "Tendances"), ("cinema", "Au cinéma"), ("streaming", "Sur vos plateformes") })
        {
            var tab = Action(label, () => _ = Navigate(DiscoverPage(key, 1), back: true), category == key ? "Primary" : "Action");
            tab.Margin = new Thickness(0, 0, 7, 7); tabs.Children.Add(tab);
        }
        navigation.Children.Add(tabs); PageContent.Children.Add(navigation);
        var loading = Message("Préparation de votre sélection…"); PageContent.Children.Add(loading);
        var data = await service.Read<DiscoverPage>(query == null ? $"api/discovery?category={category}&mode=balanced&page={index}" :
            "api/jellyseerr/search?q=" + Uri.EscapeDataString(query), cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Remove(loading);
        var items = (data.Results ?? []).Where(item => item.Id > 0 && item.MediaType is "movie" or "tv").ToArray();
        if (items.Length == 0) { PageContent.Children.Add(Message(data.Warning ?? "Aucun titre dans cette sélection.")); return; }
        if (query == null && index == 1) PageContent.Children.Add(DiscoveryHero(service, items[0], cancellation));
        var filter = new WrapPanel { Margin = new Thickness(0, 24, 0, 16) }; PageContent.Children.Add(filter);
        var results = new StackPanel(); PageContent.Children.Add(results);
        var currentType = "all";
        void Render()
        {
            results.Children.Clear();
            foreach (Button button in filter.Children) button.Style = (Style)Resources[(string)button.Tag == currentType ? "Primary" : "Action"];
            var selected = items.Where(item => currentType == "all" || item.MediaType == currentType).ToArray();
            foreach (var type in new[] { "movie", "tv" })
            {
                var group = selected.Where(item => item.MediaType == type).ToArray(); if (group.Length == 0) continue;
                var title = Text(type == "movie" ? "Films à découvrir" : "Séries à découvrir", 24, true); title.Margin = new Thickness(0, 5, 0, 18); results.Children.Add(title);
                var grid = new WrapPanel { Margin = new Thickness(-7, 0, -7, 20) };
                foreach (var item in group) grid.Children.Add(DiscoveryCard(service, item, cancellation));
                grid.SizeChanged += (_, _) =>
                {
                    var columns = Math.Max(3, (int)(grid.ActualWidth / 195));
                    foreach (Button card in grid.Children) card.Width = Math.Max(145, grid.ActualWidth / columns - 16);
                };
                results.Children.Add(grid);
            }
        }
        foreach (var (type, label) in new[] { ("all", "Tout explorer"), ("movie", "Films"), ("tv", "Séries") })
        {
            var button = Action(label, () => { currentType = type; Render(); }); button.Tag = type; button.Margin = new Thickness(0, 0, 8, 0); filter.Children.Add(button);
        }
        Render();
        var pages = new WrapPanel();
        if (index > 1) pages.Children.Add(Action("Page précédente", () => _ = Navigate(DiscoverPage(category, index - 1), back: true)));
        if (data.HasMore && data.NextPage > index) pages.Children.Add(Action("Page suivante", () => _ = Navigate(DiscoverPage(category, data.NextPage), back: true)));
        PageContent.Children.Add(pages);
    }

    private void TmdbImage(NoctraService service, Image image, string? path, bool backdrop, CancellationToken cancellation)
    {
        if (path is { Length: > 1 and < 240 } && path.StartsWith('/') && !path.StartsWith("//") && !path.Contains('\\') &&
            Uri.TryCreate("https://image.tmdb.org/t/p/" + (backdrop ? "w1280" : "w342") + path, UriKind.Absolute, out var url) && artwork is { } art)
            _ = art.Fetch(image, url.AbsoluteUri, backdrop ? 1200 : 360, ct => service.Image(url, ct), cancellation);
    }

    private FrameworkElement DiscoveryHero(NoctraService service, DiscoverItem item, CancellationToken cancellation, bool detail = false)
    {
        var image = new Image { Stretch = Stretch.UniformToFill };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(image);
        TmdbImage(service, image, item.BackdropPath ?? item.PosterPath, item.BackdropPath != null, cancellation);
        var surface = new Grid { Height = detail ? 540 : 380, ClipToBounds = true, Background = ColorOf("#161927") };
        surface.Children.Add(image);
        surface.Children.Add(new Border { Background = new LinearGradientBrush(ColorOf("#F507080D").Color, ColorOf("#0007080D").Color, 0) });
        surface.Children.Add(new Border { Background = new LinearGradientBrush(ColorOf("#0007080D").Color, ColorOf(detail ? "#FF07080D" : "#9907080D").Color, 90) { StartPoint = new Point(.5, .45), EndPoint = new Point(.5, 1) } });
        var copy = new StackPanel { Margin = new Thickness(36), MaxWidth = 620, VerticalAlignment = detail ? VerticalAlignment.Bottom : VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left };
        copy.Children.Add(Text("À L’AFFICHE DANS DÉCOUVERTE", 10, true, "Accent"));
        var title = Text(item.Label, 38, true); title.TextWrapping = TextWrapping.Wrap; title.MaxHeight = 105; title.TextTrimming = TextTrimming.CharacterEllipsis; title.Margin = new Thickness(0, 9, 0, 8); copy.Children.Add(title);
        var description = Text(item.Overview ?? "Une nouvelle histoire vous attend.", 14); description.TextWrapping = TextWrapping.Wrap; description.MaxHeight = 60; description.TextTrimming = TextTrimming.CharacterEllipsis; copy.Children.Add(description);
        var label = detail ? PlayRequest.Identifier(item.MediaInfo?.JellyfinMediaId) ? "Ouvrir la médiathèque" : item.MediaInfo?.Status is >= 2 ? "Suivre la demande" : "Demander ce titre" : "Voir la fiche";
        var button = Action(label, () =>
        {
            if (!detail) _ = Navigate(DiscoverDetail(item));
            else if (PlayRequest.Identifier(item.MediaInfo?.JellyfinMediaId)) OpenDetail(new MediaItem { Id = item.MediaInfo!.JellyfinMediaId!, Name = item.Label }, ButtonTab.Discover);
            else _ = Navigate(item.MediaInfo?.Status is >= 2 ? RequestsPage : RequestPage(item));
        }, "Primary"); button.HorizontalAlignment = HorizontalAlignment.Left; button.Margin = new Thickness(0, 18, 0, 0); copy.Children.Add(button); surface.Children.Add(copy);
        Reveal(copy, 120, 16);
        if (detail)
        {
            // Fiche : visuel pleine largeur sous le bandeau, texte aligné sur la page.
            var full = new Border { Child = surface, Tag = Bleed };
            void Align() => copy.Margin = new Thickness(PageContent.Margin.Left + 6, PageContent.Margin.Top, 40, 48);
            full.Loaded += (_, _) => { ApplyContentMargins(); Align(); };
            surface.SizeChanged += (_, _) => Align();
            return full;
        }
        surface.SizeChanged += (_, _) => surface.Clip = new RectangleGeometry(new Rect(surface.RenderSize), 20, 20);
        return new Border { Child = surface, CornerRadius = new CornerRadius(20), Margin = new Thickness(0, 0, 0, 10) };
    }

    private Button DiscoveryCard(NoctraService service, DiscoverItem item, CancellationToken cancellation)
    {
        var image = new Image { Stretch = Stretch.UniformToFill, RenderTransformOrigin = new Point(.5, .5), RenderTransform = new ScaleTransform(1, 1) };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(image);
        TmdbImage(service, image, item.PosterPath, false, cancellation);
        var poster = new Grid { Height = 262, ClipToBounds = true, Background = ColorOf("#161927") }; poster.Children.Add(image);
        poster.SizeChanged += (_, _) => poster.Clip = new RectangleGeometry(new Rect(poster.RenderSize), 12, 12);
        if (item.MediaInfo?.Status is >= 2)
            poster.Children.Add(new Border { Background = ColorOf("#D907080D"), CornerRadius = new CornerRadius(8), Padding = new Thickness(8, 4, 8, 4),
                Margin = new Thickness(8), VerticalAlignment = VerticalAlignment.Bottom, HorizontalAlignment = HorizontalAlignment.Left,
                Child = Text(PlayRequest.Identifier(item.MediaInfo.JellyfinMediaId) ? "Dans votre médiathèque" : "Déjà demandé", 10, true) });
        var labels = new StackPanel { Margin = new Thickness(2, 11, 2, 6) };
        var name = Text(item.Label, 14, true); name.TextTrimming = TextTrimming.CharacterEllipsis; labels.Children.Add(name);
        var date = item.ReleaseDate ?? item.FirstAirDate;
        labels.Children.Add(Text((item.MediaType == "tv" ? "Série" : "Film") + (date?.Length >= 4 ? " · " + date[..4] : "") +
            (item.VoteAverage is > 0 ? $" · ★ {item.VoteAverage:0.0}" : ""), 12, color: "Muted"));
        var content = new StackPanel(); content.Children.Add(poster); content.Children.Add(labels);
        var button = Action(item.Label, () => _ = Navigate(DiscoverDetail(item)), "Card"); button.Content = content; button.Width = 176; button.Margin = new Thickness(8, 0, 8, 22); button.ToolTip = item.Label;
        void Hover(bool on)
        {
            var zoom = (ScaleTransform)image.RenderTransform;
            var scale = new System.Windows.Media.Animation.DoubleAnimation(on ? 1.07 : 1, TimeSpan.FromMilliseconds(300)) { EasingFunction = new System.Windows.Media.Animation.CubicEase() };
            zoom.BeginAnimation(ScaleTransform.ScaleXProperty, scale); zoom.BeginAnimation(ScaleTransform.ScaleYProperty, scale);
        }
        button.MouseEnter += (_, _) => Hover(true); button.MouseLeave += (_, _) => Hover(false);
        button.GotKeyboardFocus += (_, _) => Hover(true); button.LostKeyboardFocus += (_, _) => Hover(false);
        return button;
    }
}
