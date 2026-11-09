using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Media.Effects;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Brush BrushFor(string key) => (Brush)Resources[key];
    private static SolidColorBrush ColorOf(string hex) => new((Color)ColorConverter.ConvertFromString(hex));

    private TextBlock Text(string value, double size = 14, bool bold = false, string color = "Ink") => new()
    {
        Text = value, FontSize = size, FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal,
        FontFamily = size >= 20 ? (FontFamily)Resources["DisplayFont"] : FontFamily,
        Foreground = BrushFor(color)
    };

    private Button Action(string title, Action click, string style = "Action")
    {
        var button = new Button { Content = title, Style = (Style)Resources[style] };
        AutomationProperties.SetName(button, title);
        button.Click += (_, _) => click();
        return button;
    }

    private Border Message(string message)
    {
        var label = Text(message, 15, color: "Muted");
        label.TextWrapping = TextWrapping.Wrap;
        return new Border
        {
            Background = BrushFor("Panel"), BorderBrush = BrushFor("Outline"), BorderThickness = new Thickness(1),
            Padding = new Thickness(17, 14, 17, 14), CornerRadius = new CornerRadius(12),
            Margin = new Thickness(0, 0, 0, 14), Child = label
        };
    }

    private async Task RenderHome(Jellyfin account, CancellationToken cancellation)
    {
        var resumeTask = TryShelf(() => account.Resume(cancellation));
        var nextTask = TryShelf(() => account.NextUp(cancellation));
        var librariesTask = HomeLibraries(account, cancellation);
        await Task.WhenAll(new Task[] { resumeTask, nextTask, librariesTask });
        if (cancellation.IsCancellationRequested) return;
        var libraries = await librariesTask;
        using var libraryGate = new SemaphoreSlim(4);
        var updates = await Task.WhenAll(libraries.Select(async library =>
        {
            await libraryGate.WaitAsync(cancellation);
            try
            {
                try { return (library.Id, Page: await account.Browse(null, library.Id, null, 0, true, cancellation)); }
                catch (Exception error) when (error is HttpRequestException or JsonException or InvalidOperationException)
                { return (library.Id, Page: (ItemPage?)null); }
            }
            finally { libraryGate.Release(); }
        }));
        if (cancellation.IsCancellationRequested) return;
        var previews = updates.ToDictionary(value => value.Id, value => value.Page);
        var resume = (await resumeTask)?.Where(item => item.CanPlay && PlayRequest.Identifier(item.Id)).ToArray();
        var next = (await nextTask)?.Where(item => item.CanPlay && PlayRequest.Identifier(item.Id) &&
            !(resume ?? []).Any(watching => watching.Id == item.Id)).ToArray();
        var latest = updates.SelectMany(value => value.Page?.Items ?? []).Where(item => PlayRequest.Identifier(item.Id)).ToArray();
        PageContent.Children.Clear();
        var featured = resume?.FirstOrDefault() ?? next?.FirstOrDefault() ?? latest?.FirstOrDefault();
        if (featured != null)
        {
            var candidates = resume is { Length: > 0 } ? resume : next is { Length: > 0 } ? next : latest!;
            var banner = new Grid();
            var index = 0;
            var label = featured == resume?.FirstOrDefault() ? "CONTINUER À REGARDER" : featured == next?.FirstOrDefault() ? "À SUIVRE" : "DANS VOTRE BIBLIOTHÈQUE";
            void ShowFeatured()
            {
                var item = candidates[index];
                banner.Children.Clear();
                banner.Children.Add(Hero(item, label, item.DisplayTitle, item.Caption, null,
                    item.CanPlay ? item.Resume > 0 ? "▶   Reprendre" : "▶   Lire" : "Voir la fiche",
                    item.CanPlay ? () => StartPlayback(item) : () => OpenDetail(item, ButtonTab.Home),
                    item.CanPlay ? Action("Voir la fiche", () => OpenDetail(item, ButtonTab.Home)) : null, cancellation));
                if (candidates.Length <= 1) return;
                var controls = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 25, 25) };
                controls.Children.Add(Action("‹", () => { index = (index + candidates.Length - 1) % candidates.Length; ShowFeatured(); }));
                var count = Text($"{index + 1} / {candidates.Length}", 13, true);
                count.Margin = new Thickness(12, 0, 12, 0);
                count.VerticalAlignment = VerticalAlignment.Center;
                controls.Children.Add(count);
                controls.Children.Add(Action("›", () => { index = (index + 1) % candidates.Length; ShowFeatured(); }));
                banner.Children.Add(controls);
            }
            ShowFeatured();
            PageContent.Children.Add(banner);
        }
        else PageContent.Children.Add(Heading("Votre espace", "Retrouvez ici vos films et séries."));
        AddShelf("Continuer à regarder", resume, "Vos films et épisodes en cours apparaîtront ici.", true, cancellation);
        foreach (var library in libraries)
            AddShelf("Ajouts récents · " + library.Name, previews[library.Id]?.Items,
                "Aucun ajout récent dans cette médiathèque.", false, cancellation);
        AddShelf("À suivre", next, "Les prochains épisodes de vos séries apparaîtront ici.", true, cancellation);
        PageContent.Children.Add(new Border { Height = 1, Background = BrushFor("Outline"), Margin = new Thickness(0, 30, 0, 30) });
        PageContent.Children.Add(Heading("Vos médiathèques", "Choisissez votre prochain univers."));
        if (libraries.Length == 0) PageContent.Children.Add(Message("Médiathèques indisponibles pour ce profil. Cliquez sur Accueil pour réessayer."));
        else PageContent.Children.Add(LibraryTiles(account, libraries, cancellation, true, previews));
    }

    private static async Task<MediaItem[]> HomeLibraries(Jellyfin account, CancellationToken cancellation)
    {
        try { return ((await account.Libraries(cancellation)).Items ?? []).Where(LibraryVisible).DistinctBy(item => item.Id).ToArray(); }
        catch (Exception error) when (error is HttpRequestException or JsonException or InvalidOperationException) { return []; }
    }

    private static bool LibraryVisible(MediaItem item) => PlayRequest.Identifier(item.Id) &&
        item.Type != "BoxSet" && item.CollectionType != "boxsets";

    private static async Task<MediaItem[]?> TryShelf(Func<Task<MediaItem[]>> load)
    {
        try { return await load(); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    private FrameworkElement Hero(MediaItem item, string eyebrow, string title, string caption, string? synopsis,
        string primaryLabel, Action primary, Button? secondary, CancellationToken cancellation, Button? extra = null,
        Action<Button>? configurePrimary = null)
    {
        var image = new Image();
        var backdrop = new ImageBrush { Stretch = Stretch.Uniform, AlignmentX = AlignmentX.Right, AlignmentY = AlignmentY.Center };
        BindingOperations.SetBinding(backdrop, ImageBrush.ImageSourceProperty, new Binding(nameof(Image.Source)) { Source = image });
        var ambient = new ImageBrush { Stretch = Stretch.UniformToFill };
        BindingOperations.SetBinding(ambient, ImageBrush.ImageSourceProperty, new Binding(nameof(Image.Source)) { Source = image });
        var gradient = new LinearGradientBrush
        {
            StartPoint = new Point(0, 0), EndPoint = new Point(1, 0),
            GradientStops =
            {
                new GradientStop(Color.FromArgb(250, 9, 15, 32), 0),
                new GradientStop(Color.FromArgb(181, 9, 17, 34), .34),
                new GradientStop(Color.FromArgb(42, 15, 37, 54), .67),
                new GradientStop(Color.FromArgb(12, 7, 30, 48), 1)
            }
        };
        var layers = new Grid
        {
            Background = new LinearGradientBrush(Color.FromRgb(17, 32, 65), Color.FromRgb(30, 89, 102), 12),
            ClipToBounds = true
        };
        layers.Children.Add(new Border { Background = ambient, Opacity = .35, Effect = new BlurEffect { Radius = 28 } });
        var picture = new Border { Background = backdrop, HorizontalAlignment = HorizontalAlignment.Right };
        layers.Children.Add(picture);
        layers.Children.Add(new Border { Background = gradient });
        layers.Children.Add(new Border
        {
            Background = new LinearGradientBrush
            {
                StartPoint = new Point(.5, 0), EndPoint = new Point(.5, 1),
                GradientStops = { new GradientStop(Color.FromArgb(0, 8, 15, 31), .37), new GradientStop(Color.FromArgb(216, 8, 15, 31), 1) }
            }
        });
        var copy = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(45, 30, 32, 34), MaxWidth = 590
        };
        var badge = Text(eyebrow, 11, true, "Accent");
        copy.Children.Add(new Border
        {
            HorizontalAlignment = HorizontalAlignment.Left, Padding = new Thickness(10, 5, 10, 5),
            Background = ColorOf("#BD101E38"), BorderBrush = ColorOf("#626E9DCE"), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12), Child = badge
        });
        var heading = Text(title, 58, true);
        heading.Margin = new Thickness(0, 9, 0, 0);
        heading.TextTrimming = TextTrimming.CharacterEllipsis;
        var titleLogo = new Image { Height = 113, MaxWidth = 390, Stretch = Stretch.Uniform,
            HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 10, 0, 0), Visibility = Visibility.Collapsed };
        copy.Children.Add(titleLogo);
        copy.Children.Add(heading);
        if (artwork is { } art) _ = ShowLogo(art, titleLogo, heading, item, cancellation);
        var metadata = Text(caption, 15, color: "Muted");
        metadata.TextTrimming = TextTrimming.CharacterEllipsis;
        metadata.Margin = new Thickness(0, 4, 0, 0);
        copy.Children.Add(metadata);
        if (!string.IsNullOrWhiteSpace(synopsis))
        {
            var summary = Text(synopsis, 14);
            summary.TextWrapping = TextWrapping.Wrap;
            summary.TextTrimming = TextTrimming.CharacterEllipsis;
            summary.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
            summary.LineHeight = 20;
            summary.MaxHeight = 60;
            summary.Margin = new Thickness(0, 12, 0, 0);
            copy.Children.Add(summary);
        }
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 16, 0, 0) };
        var primaryButton = Action(primaryLabel, primary, "Primary");
        AutomationProperties.SetAutomationId(primaryButton, "PrimaryPlayback");
        configurePrimary?.Invoke(primaryButton);
        actions.Children.Add(primaryButton);
        if (secondary != null)
        {
            secondary.Margin = new Thickness(9, 0, 0, 0);
            actions.Children.Add(secondary);
        }
        if (extra != null)
        {
            extra.Margin = new Thickness(9, 0, 0, 0);
            actions.Children.Add(extra);
        }
        copy.Children.Add(actions);
        layers.Children.Add(copy);
        void FitPicture()
        {
            picture.Width = layers.ActualWidth * .78;
            var imageWidth = image.Source is { Height: > 0 } source ? Math.Min(picture.Width, layers.ActualHeight * source.Width / source.Height) : picture.Width;
            var edge = picture.Width > 0 ? Math.Clamp((picture.Width - imageWidth) / picture.Width, 0, .95) : 0;
            picture.OpacityMask = new LinearGradientBrush
            {
                StartPoint = new Point(0, .5), EndPoint = new Point(1, .5),
                GradientStops = { new GradientStop(Colors.Transparent, 0), new GradientStop(Colors.Transparent, edge),
                    new GradientStop(Colors.White, Math.Min(1, edge + .22)), new GradientStop(Colors.White, 1) }
            };
        }
        async Task LoadHeroArt()
        {
            if (artwork == null) return;
            await artwork.Load(image, item, true, 1500, cancellation);
            if (!cancellation.IsCancellationRequested) FitPicture();
        }
        _ = LoadHeroArt();
        _ = artwork?.Load(AmbientArt, item, true, 1000, cancellation);
        var hero = new Border
        {
            Height = 390, Background = ColorOf("#101C32"),
            BorderBrush = ColorOf("#40596C87"),
            BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(32), Child = layers,
            Effect = new DropShadowEffect { Color = Color.FromRgb(48, 112, 168), BlurRadius = 45, ShadowDepth = 6, Opacity = .23 }
        };
        layers.SizeChanged += (_, _) =>
        {
            FitPicture();
            layers.Clip = new RectangleGeometry(new Rect(layers.RenderSize), 31, 31);
            var height = Math.Clamp(layers.ActualWidth / 3.2, 390, 590);
            if (Math.Abs(hero.Height - height) > 1) hero.Height = height;
        };
        return hero;
    }

    private static async Task ShowLogo(Artwork artwork, Image logo, TextBlock text, MediaItem item, CancellationToken cancellation)
    {
        await artwork.LoadLogo(logo, item, cancellation);
        if (cancellation.IsCancellationRequested || logo.Source == null) return;
        logo.Visibility = Visibility.Visible;
        text.Visibility = Visibility.Collapsed;
    }

    private void AddShelf(string title, MediaItem[]? items, string empty, bool landscape, CancellationToken cancellation)
    {
        var head = new DockPanel { Margin = new Thickness(0, 24, 0, 12) };
        var label = Text(title, 22, true);
        label.VerticalAlignment = VerticalAlignment.Center;
        if (items is not { Length: > 0 })
        {
            head.Children.Add(label);
            PageContent.Children.Add(head);
            PageContent.Children.Add(Message(items == null ? "Section indisponible. Cliquez sur Accueil pour réessayer." : empty));
            return;
        }
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var scroll = new ScrollViewer
        {
            Content = row, HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, CanContentScroll = false
        };
        if (items.Length > 1)
        {
            var arrows = new StackPanel { Orientation = Orientation.Horizontal };
            DockPanel.SetDock(arrows, Dock.Right);
            var previous = Action("‹", () => scroll.ScrollToHorizontalOffset(Math.Max(0, scroll.HorizontalOffset - scroll.ViewportWidth * .75)));
            var next = Action("›", () => scroll.ScrollToHorizontalOffset(scroll.HorizontalOffset + scroll.ViewportWidth * .75));
            AutomationProperties.SetName(previous, title + " précédent");
            AutomationProperties.SetName(next, title + " suivant");
            foreach (var arrow in new[] { previous, next })
            {
                arrow.MinHeight = 32;
                arrow.Width = 34;
                arrow.Padding = new Thickness(0);
                arrow.Margin = new Thickness(7, 0, 0, 0);
                arrow.FontSize = 19;
                arrows.Children.Add(arrow);
            }
            scroll.ScrollChanged += (_, _) =>
            {
                previous.IsEnabled = scroll.HorizontalOffset > 0;
                next.IsEnabled = scroll.HorizontalOffset < scroll.ScrollableWidth - 1;
            };
            head.Children.Add(arrows);
        }
        head.Children.Add(label);
        foreach (var item in items) row.Children.Add(Card(item, landscape, ButtonTab.Home, cancellation));
        PageContent.Children.Add(head);
        PageContent.Children.Add(new Border { Width = 31, Height = 3, CornerRadius = new CornerRadius(2),
            HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, -6, 0, 12),
            Background = new LinearGradientBrush(Color.FromRgb(230, 183, 255), Color.FromRgb(99, 212, 239), 0) });
        PageContent.Children.Add(scroll);
    }

    private Button Card(MediaItem item, bool landscape, ButtonTab tab, CancellationToken cancellation)
    {
        var image = new Image { Stretch = Stretch.UniformToFill };
        var surface = new Grid { Height = landscape ? 132 : 231, ClipToBounds = true };
        surface.Background = new LinearGradientBrush(Color.FromRgb(51, 40, 75), Color.FromRgb(29, 25, 44), 48);
        surface.Children.Add(new TextBlock
        {
            Text = item.Name.Length > 0 ? item.Name[..1] : "N", Foreground = ColorOf("#AA98C6"),
            FontSize = 35, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center
        });
        surface.Children.Add(image);
        surface.SizeChanged += (_, _) => surface.Clip = new RectangleGeometry(new Rect(surface.RenderSize), 19, 19);
        if (item.Progress > 0)
        {
            var track = new ProgressBar
            {
                Height = 4, Minimum = 0, Maximum = 1, Value = item.Progress, VerticalAlignment = VerticalAlignment.Bottom,
                Foreground = BrushFor("Accent"), Background = ColorOf("#4A3C63"), BorderThickness = new Thickness(0)
            };
            surface.Children.Add(track);
        }
        else if (item.UserData?.Played == true)
        {
            var tick = Text("✓", 13, true, "Accent");
            surface.Children.Add(new Border
            {
                Background = ColorOf("#241A37"), CornerRadius = new CornerRadius(12), Padding = new Thickness(6, 1, 6, 1),
                HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(6), Child = tick
            });
        }
        var title = Text(item.DisplayTitle, 14, true);
        title.TextTrimming = TextTrimming.CharacterEllipsis;
        var subtitle = Text(item.Caption, 12, color: "Muted");
        subtitle.TextTrimming = TextTrimming.CharacterEllipsis;
        var labels = new StackPanel { Margin = new Thickness(2, 10, 4, 3) };
        labels.Children.Add(title);
        labels.Children.Add(subtitle);
        if (item.Type == "Series") labels.Children.Add(SeriesBadge(item.Id, cancellation));
        var content = new StackPanel();
        content.Children.Add(surface);
        content.Children.Add(labels);
        var button = Action(item.DisplayTitle, () =>
        {
            if (landscape && item.CanPlay) StartPlayback(item);
            else OpenDetail(item, tab);
        }, "Card");
        button.Content = content;
        button.ToolTip = item.DisplayTitle + " · " + item.Caption;
        button.Width = landscape ? 235 : 160;
        button.Margin = new Thickness(0, 0, 17, 9);
        _ = artwork?.Load(image, item, landscape, landscape ? 420 : 300, cancellation);
        return button;
    }

    private FrameworkElement Heading(string title, string subtitle)
    {
        var heading = new StackPanel { Margin = new Thickness(0, 0, 0, 19) };
        var name = Text(title, 34, true);
        name.TextWrapping = TextWrapping.Wrap;
        heading.Children.Add(name);
        heading.Children.Add(Text(subtitle, 14, color: "Muted"));
        return heading;
    }

    private Page BrowsePage(string title, ButtonTab tab, string? type = null, string? parent = null, string? search = null,
        int start = 0, bool favorite = false, string? watched = null, string? sort = null) =>
        new(title, tab, async (account, cancellation) =>
        {
            var result = await account.Browse(type, parent, search, start, false, cancellation, favorite, watched, sort);
            if (cancellation.IsCancellationRequested) return;
            var items = (result.Items ?? []).Where(item => PlayRequest.Identifier(item.Id)).ToArray();
            PageContent.Children.Clear();
            PageContent.Children.Add(Heading(search == null ? title : "« " + search + " »",
                result.TotalRecordCount is int count ? count == 1 ? "1 titre" : $"{count} titres" : "Catalogue Jellyfin"));
            if (search != null && account.NoctraRoot != null)
            {
                var discoverySearch = Action("Rechercher aussi dans Découverte", () => _ = Navigate(DiscoverySearchPage(search)));
                discoverySearch.HorizontalAlignment = HorizontalAlignment.Left;
                discoverySearch.Margin = new Thickness(0, 0, 0, 18);
                PageContent.Children.Add(discoverySearch);
            }
            var filters = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 16) };
            (string Label, string? Value)[] statuses = [("Tous les statuts", null), ("Vu", "IsPlayed"), ("Non vu", "IsUnplayed")];
            (string Label, string? Value)[] orders = [("Ordre alphabétique", null), ("Ajouts récents", "DateCreated"), ("Année de sortie", "ProductionYear")];
            var status = new ComboBox { ItemsSource = statuses.Select(x => x.Item1), Width = 154, MinHeight = 36,
                SelectedIndex = Array.FindIndex(statuses, option => option.Item2 == watched), Margin = new Thickness(0, 0, 8, 0) };
            var order = new ComboBox { ItemsSource = orders.Select(x => x.Item1), Width = 168, MinHeight = 36,
                SelectedIndex = Array.FindIndex(orders, option => option.Item2 == sort) };
            AutomationProperties.SetName(status, "Statut de lecture");
            AutomationProperties.SetName(order, "Trier");
            void ApplyFilters()
            {
                if (status.SelectedIndex < 0 || order.SelectedIndex < 0 || cancellation.IsCancellationRequested) return;
                _ = Navigate(BrowsePage(title, tab, type, parent, search, favorite: favorite,
                    watched: statuses[status.SelectedIndex].Value, sort: orders[order.SelectedIndex].Value), back: true);
            }
            status.SelectionChanged += (_, _) => ApplyFilters();
            order.SelectionChanged += (_, _) => ApplyFilters();
            filters.Children.Add(status);
            filters.Children.Add(order);
            PageContent.Children.Add(filters);
            if (items.Length == 0) PageContent.Children.Add(Message("Aucun titre sur cette page."));
            var cards = new WrapPanel();
            foreach (var item in items) cards.Children.Add(Card(item, false, tab, cancellation));
            PageContent.Children.Add(cards);
            var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 12, 0, 0) };
            if (start > 0)
                actions.Children.Add(Action("Page précédente", () => _ = Navigate(BrowsePage(title, tab, type, parent, search, start - 48, favorite, watched, sort), back: true)));
            if (result.TotalRecordCount > start + 48 || result.TotalRecordCount == null && items.Length == 48)
            {
                var more = Action("Page suivante", () => _ = Navigate(BrowsePage(title, tab, type, parent, search, start + 48, favorite, watched, sort), back: true));
                more.Margin = new Thickness(start > 0 ? 8 : 0, 0, 0, 0);
                actions.Children.Add(more);
            }
            if (actions.Children.Count > 0) PageContent.Children.Add(actions);
        });

    private async Task RenderLibraries(Jellyfin account, CancellationToken cancellation)
    {
        var libraries = await HomeLibraries(account, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Vos médiathèques", "Des univers à explorer, à votre rythme."));
        if (libraries.Length == 0) PageContent.Children.Add(Message("Aucune médiathèque accessible à ce profil."));
        else PageContent.Children.Add(LibraryTiles(account, libraries, cancellation));
    }

    private void OpenDetail(MediaItem item, ButtonTab tab) =>
        _ = Navigate(new(item.DisplayTitle, tab, (account, cancellation) => RenderDetail(account, item.Id, cancellation)));

    private async Task RenderDetail(Jellyfin account, string id, CancellationToken cancellation)
    {
        var item = await account.Detail(id, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        var type = item.Type switch { "Series" => "SÉRIE", "Episode" => "ÉPISODE", "BoxSet" => "COLLECTION", _ => "FILM" };
        var metadata = string.Join(" · ", new[] { item.Caption, item.OfficialRating }.Concat(item.Genres?.Take(2) ?? []).Where(value => !string.IsNullOrWhiteSpace(value)));
        var synopsis = string.IsNullOrWhiteSpace(item.Overview) ? "Synopsis indisponible." : item.Overview;
        var favorite = FavoriteButton(account, item, cancellation);
        if (item.Type == "BoxSet")
        {
            PageContent.Children.Add(Hero(item, type, item.DisplayTitle, "Collection Jellyfin", synopsis, "Parcourir la collection",
                () => _ = Navigate(BrowsePage(item.Name, ButtonTab.Library, parent: item.Id)), favorite, cancellation));
            return;
        }
        if (item.CanPlay)
        {
            var mark = MarkButton(account, item, cancellation);
            PageContent.Children.Add(Hero(item, type, item.DisplayTitle, metadata, synopsis, item.Resume > 0 ? "▶   Reprendre" : "▶   Lire",
                () => StartPlayback(item), mark, cancellation, favorite));
            var castButton = Action("Diffuser sur un autre écran", () => _ = Navigate(CastPage(item)));
            castButton.Margin = new Thickness(0, 14, 0, 0);
            castButton.HorizontalAlignment = HorizontalAlignment.Left;
            PageContent.Children.Add(castButton);
            if (item.SeriesId is { } series && PlayRequest.Identifier(series))
            {
                var open = Action("Voir la série", () => OpenDetail(item with { Id = series }, page?.Tab ?? ButtonTab.Home));
                open.HorizontalAlignment = HorizontalAlignment.Left;
                open.Margin = new Thickness(0, 12, 0, 0);
                PageContent.Children.Add(open);
            }
            AddPeople(item, cancellation);
            _ = AddRecommendations(account, item, cancellation);
            return;
        }
        var episodes = new StackPanel { Margin = new Thickness(0, 20, 0, 0) };
        MediaItem? playable = null;
        Button? seriesPlay = null;
        var seriesHero = Hero(item, type, item.DisplayTitle, metadata, synopsis, "▶   Lire la série", () =>
        {
            if (playable != null) StartPlayback(playable);
            else episodes.BringIntoView();
        }, favorite, cancellation, configurePrimary: button => { seriesPlay = button; button.IsEnabled = false; });
        PageContent.Children.Add(seriesHero);
        if (item.Type == "Series") PageContent.Children.Add(SeriesBadge(item.Id, cancellation, true));
        PageContent.Children.Add(episodes);
        if (item.Type != "Series") return;

        try { playable = await account.PlayableSeries(item.Id, cancellation); }
        catch (HttpRequestException) { }
        if (cancellation.IsCancellationRequested) return;
        if (seriesPlay != null)
        {
            seriesPlay.IsEnabled = true;
            seriesPlay.Content = playable == null ? "Voir les épisodes" : playable.Resume > 0 ?
                $"▶   Reprendre S{playable.ParentIndexNumber} E{playable.IndexNumber}" : $"▶   Lire S{playable.ParentIndexNumber} E{playable.IndexNumber}";
            AutomationProperties.SetName(seriesPlay, seriesPlay.Content.ToString());
        }
        var available = (await account.Seasons(item.Id, cancellation)).Items ?? [];
        if (cancellation.IsCancellationRequested) return;
        available = available.Where(season => PlayRequest.Identifier(season.Id)).OrderBy(season => season.IndexNumber ?? 0).ToArray();
        if (available.Length == 0)
        {
            episodes.Children.Add(Message("Aucun épisode disponible."));
            return;
        }
        episodes.Children.Add(Heading("Épisodes", "Choisissez une saison."));
        var seasons = new ComboBox
        {
            DisplayMemberPath = nameof(MediaItem.Name), ItemsSource = available, MinWidth = 180, MaxWidth = 340,
            HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 12),
            MinHeight = 36, FontSize = 14
        };
        AutomationProperties.SetName(seasons, "Saison");
        episodes.Children.Add(seasons);
        var list = new StackPanel();
        episodes.Children.Add(list);
        var change = 0;
        seasons.SelectionChanged += async (_, _) =>
        {
            if (seasons.SelectedItem is not MediaItem season) return;
            var request = ++change;
            list.Children.Clear();
            list.Children.Add(Message("Chargement des épisodes…"));
            try
            {
                var result = await account.Episodes(item.Id, season.Id, cancellation);
                if (cancellation.IsCancellationRequested || request != change) return;
                list.Children.Clear();
                foreach (var episode in result.Items ?? [])
                    if (episode.CanPlay && PlayRequest.Identifier(episode.Id)) list.Children.Add(EpisodeRow(account, episode, cancellation));
                if (list.Children.Count == 0) list.Children.Add(Message("Aucun épisode disponible pour cette saison."));
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
            {
                if (cancellation.IsCancellationRequested || request != change) return;
                list.Children.Clear();
                list.Children.Add(Message("Impossible de charger les épisodes. Rouvrez la fiche pour réessayer."));
            }
        };
        seasons.SelectedIndex = 0;
        AddPeople(item, cancellation);
        _ = AddRecommendations(account, item, cancellation);
    }

    private void AddPeople(MediaItem item, CancellationToken cancellation)
    {
        var actors = (item.People ?? []).Where(person => person.Type is "Actor" or "GuestStar").Take(10).ToArray();
        if (actors.Length == 0) return;
        var heading = Text("Distribution", 22, true);
        heading.Margin = new Thickness(0, 25, 0, 14);
        PageContent.Children.Add(heading);
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        foreach (var person in actors)
        {
            var image = new Image { Width = 74, Height = 94, Stretch = Stretch.UniformToFill };
            var card = new StackPanel { Width = 105, Margin = new Thickness(0, 0, 12, 0) };
            card.Children.Add(new Border { Background = BrushFor("Panel"), Child = image, CornerRadius = new CornerRadius(9) });
            var name = Text(person.Name, 12, true);
            name.TextTrimming = TextTrimming.CharacterEllipsis;
            name.Margin = new Thickness(0, 6, 0, 0);
            card.Children.Add(name);
            var role = Text(person.Role ?? "", 11, color: "Muted");
            role.TextTrimming = TextTrimming.CharacterEllipsis;
            card.Children.Add(role);
            row.Children.Add(card);
            _ = artwork?.Load(image, new MediaItem { Id = person.Id, Name = person.Name }, false, 150, cancellation);
        }
        PageContent.Children.Add(new ScrollViewer { Content = row, HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled });
    }

    private async Task AddRecommendations(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        try
        {
            var related = await account.Similar(item.SeriesId ?? item.Id, cancellation);
            if (cancellation.IsCancellationRequested || related.Items is not { Length: > 0 }) return;
            AddShelf("Titres similaires", related.Items, "", false, cancellation);
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException) { }
    }


    private Button FavoriteButton(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        var isFavorite = item.UserData?.IsFavorite == true;
        string Label() => isFavorite ? "♥  Favori" : "♡  Ajouter aux favoris";
        var button = Action(Label(), () => { });
        button.Click += async (_, _) =>
        {
            button.IsEnabled = false;
            try
            {
                await account.Favorite(item.Id, !isFavorite, cancellation);
                if (cancellation.IsCancellationRequested) return;
                isFavorite = !isFavorite;
                button.Content = Label();
                AutomationProperties.SetName(button, Label());
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
            {
                if (!cancellation.IsCancellationRequested) ShowStatus("Impossible de modifier les favoris.");
            }
            finally { button.IsEnabled = true; }
        };
        return button;
    }

    private Button MarkButton(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        var played = item.UserData?.Played == true;
        string Label() => played ? "Marquer non vu" : "Marquer vu";
        var button = Action(Label(), () => { });
        button.Click += async (_, _) =>
        {
            button.IsEnabled = false;
            try
            {
                await account.Mark(item.Id, !played, cancellation);
                if (cancellation.IsCancellationRequested) return;
                played = !played;
                button.Content = Label();
                AutomationProperties.SetName(button, Label());
                ShowStatus(played ? "Marqué comme vu." : "Marqué comme non vu.");
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
            {
                if (!cancellation.IsCancellationRequested) ShowStatus("La modification n’a pas été enregistrée. Réessayez.");
            }
            finally { button.IsEnabled = true; }
        };
        return button;
    }

    private FrameworkElement EpisodeRow(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        var row = new DockPanel();
        var play = Action(item.Resume > 0 ? "▶   Reprendre" : "▶   Lire", () => StartPlayback(item), "Primary");
        DockPanel.SetDock(play, Dock.Right);
        row.Children.Add(play);
        var mark = MarkButton(account, item, cancellation);
        mark.Margin = new Thickness(8, 0, 8, 0);
        DockPanel.SetDock(mark, Dock.Right);
        row.Children.Add(mark);
        var thumbnail = new Image { Width = 130, Height = 74, Stretch = Stretch.UniformToFill, Margin = new Thickness(0, 0, 15, 0) };
        var frame = new Border { Width = 130, Height = 74, CornerRadius = new CornerRadius(8), Child = thumbnail,
            Background = ColorOf("#27354A"), ClipToBounds = true, Margin = new Thickness(0, 0, 15, 0) };
        thumbnail.Margin = new Thickness(0);
        frame.SizeChanged += (_, _) => frame.Clip = new RectangleGeometry(new Rect(frame.RenderSize), 8, 8);
        DockPanel.SetDock(frame, Dock.Left);
        row.Children.Add(frame);
        _ = artwork?.Load(thumbnail, item, false, 280, cancellation);
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
        var label = Text(item.Caption, 15, true);
        label.TextTrimming = TextTrimming.CharacterEllipsis;
        copy.Children.Add(label);
        var overview = Text(item.Overview ?? (item.RunTimeTicks is > 0 ? $"{TimeSpan.FromTicks(item.RunTimeTicks.Value).TotalMinutes:0} min" : ""), 12, color: "Muted");
        overview.TextWrapping = TextWrapping.Wrap;
        overview.TextTrimming = TextTrimming.CharacterEllipsis;
        overview.MaxHeight = 34;
        overview.Margin = new Thickness(0, 5, 0, 0);
        copy.Children.Add(overview);
        row.Children.Add(copy);
        return new Border
        {
            Background = BrushFor("Panel"), BorderBrush = BrushFor("Outline"), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(11), Padding = new Thickness(14, 8, 9, 8), Margin = new Thickness(0, 0, 0, 8),
            Child = row
        };
    }
}
