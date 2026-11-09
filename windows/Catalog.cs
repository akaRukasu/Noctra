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
using System.Windows.Media.Animation;
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
        var button = new Button { Style = (Style)Resources[style] };
        SetLabel(button, title);
        button.Click += (_, _) => click();
        return button;
    }

    // 0.6 : les libellés « ▶ … », « ♡ … », « ♥ … » s'affichent avec une vraie icône ;
    // le nom accessible reste le libellé d'origine (navigation clavier, lecteurs d'écran, tests).
    private void SetLabel(Button button, string title)
    {
        AutomationProperties.SetName(button, title);
        var glyph = title.StartsWith('▶') ? "\uE768" : title.StartsWith('♡') ? "\uE734" : title.StartsWith('♥') ? "\uE735" : null;
        if (glyph == null) { button.Content = title; return; }
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(new TextBlock { Text = glyph, FontFamily = (FontFamily)Resources["IconFont"], FontSize = 15,
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0) });
        row.Children.Add(new TextBlock { Text = title[1..].Trim(), VerticalAlignment = VerticalAlignment.Center });
        foreach (TextBlock part in row.Children)
            part.SetBinding(TextBlock.ForegroundProperty, new Binding(nameof(Button.Foreground)) { Source = button });
        button.Content = row;
    }

    private FrameworkElement Message(string message)
    {
        var loading = message.EndsWith('…');
        var label = Text(message, 15, color: "Muted");
        label.TextWrapping = TextWrapping.Wrap;
        label.VerticalAlignment = VerticalAlignment.Center;
        if (loading)
        {
            // Chargement : texte discret et barre animée, sans cadre.
            var wait = new StackPanel { Margin = new Thickness(2, 18, 0, 22), HorizontalAlignment = HorizontalAlignment.Left, Tag = label };
            wait.Children.Add(label);
            wait.Children.Add(new ProgressBar { IsIndeterminate = true, Height = 3, Width = 180, Margin = new Thickness(0, 12, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Left, BorderThickness = new Thickness(0),
                Foreground = BrushFor("AccentGradient"), Background = ColorOf("#1AFFFFFF") });
            return wait;
        }
        var row = new DockPanel();
        var icon = new TextBlock { Text = "\uE946", FontFamily = (FontFamily)Resources["IconFont"], FontSize = 16,
            Foreground = BrushFor("Accent"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 14, 0) };
        DockPanel.SetDock(icon, Dock.Left);
        row.Children.Add(icon);
        row.Children.Add(label);
        return new Border
        {
            Background = ColorOf("#0DFFFFFF"), BorderBrush = ColorOf("#1AFFFFFF"), BorderThickness = new Thickness(1),
            Padding = new Thickness(18, 15, 18, 15), CornerRadius = new CornerRadius(14),
            Margin = new Thickness(0, 0, 0, 14), Child = row, Tag = label
        };
    }

    // Texte d'un message (mis à jour pendant un chargement progressif).
    private static TextBlock MessageLabel(FrameworkElement message) => (TextBlock)message.Tag;

    // Entrée en douceur d'un élément (fondu et léger glissement vers le haut).
    private static void Reveal(UIElement element, double delay = 0, double distance = 14)
    {
        if (!SystemParameters.ClientAreaAnimation) return;
        var move = new TranslateTransform(0, distance);
        element.RenderTransform = move;
        element.Opacity = 0;
        var begin = TimeSpan.FromMilliseconds(delay);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        element.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(380)) { BeginTime = begin, EasingFunction = ease });
        move.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(distance, 0, TimeSpan.FromMilliseconds(460)) { BeginTime = begin, EasingFunction = ease });
    }

    // Visuel affiché en fondu dès qu'il arrive (les images se chargent en arrière-plan).
    private static void FadeInWhenLoaded(Image image)
    {
        if (!SystemParameters.ClientAreaAnimation) return;
        image.Opacity = 0;
        var descriptor = System.ComponentModel.DependencyPropertyDescriptor.FromProperty(Image.SourceProperty, typeof(Image));
        void Shown(object? sender, EventArgs args)
        {
            if (image.Source == null) return;
            descriptor.RemoveValueChanged(image, Shown);
            image.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(320)));
        }
        descriptor.AddValueChanged(image, Shown);
    }

    // Défilement horizontal animé des rangées (flèches).
    private static void GlideTo(ScrollViewer scroll, double target)
    {
        target = Math.Clamp(target, 0, scroll.ScrollableWidth);
        var from = scroll.HorizontalOffset;
        if (!SystemParameters.ClientAreaAnimation || Math.Abs(target - from) < 1) { scroll.ScrollToHorizontalOffset(target); return; }
        var started = System.Diagnostics.Stopwatch.GetTimestamp();
        void Step(object? sender, EventArgs args)
        {
            var t = Math.Min(1, System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds / 420);
            var eased = 1 - Math.Pow(1 - t, 3);
            scroll.ScrollToHorizontalOffset(from + (target - from) * eased);
            if (t >= 1) CompositionTarget.Rendering -= Step;
        }
        CompositionTarget.Rendering += Step;
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
            var candidates = (resume is { Length: > 0 } ? resume : next is { Length: > 0 } ? next : latest!).Take(8).ToArray();
            var label = featured == resume?.FirstOrDefault() ? "CONTINUER À REGARDER" : featured == next?.FirstOrDefault() ? "À SUIVRE" : "DANS VOTRE BIBLIOTHÈQUE";
            PageContent.Children.Add(FeaturedCarousel(candidates, label, cancellation));
        }
        else PageContent.Children.Add(Heading("Votre espace", "Retrouvez ici vos films et séries."));
        AddShelf("Continuer à regarder", resume, "Vos films et épisodes en cours apparaîtront ici.", true, cancellation);
        foreach (var library in libraries)
            AddShelf("Ajouts récents · " + library.Name, previews[library.Id]?.Items,
                "Aucun ajout récent dans cette médiathèque.", false, cancellation);
        AddShelf("À suivre", next, "Les prochains épisodes de vos séries apparaîtront ici.", true, cancellation);
        var librariesHeading = Heading("Vos médiathèques", "Choisissez votre prochain univers.");
        librariesHeading.Margin = new Thickness(0, 34, 0, 18);
        PageContent.Children.Add(librariesHeading);
        if (libraries.Length == 0) PageContent.Children.Add(Message("Médiathèques indisponibles pour ce profil. Cliquez sur Accueil pour réessayer."));
        else PageContent.Children.Add(LibraryTiles(account, libraries, cancellation, true, previews));
        ApplyContentMargins();
        for (var index = 1; index < PageContent.Children.Count; index++) Reveal(PageContent.Children[index], Math.Min(index, 8) * 35);
    }

    // Grand visuel d'accueil : titres mis en avant, défilement automatique (pause au survol),
    // fondu enchaîné et points de pagination.
    private FrameworkElement FeaturedCarousel(MediaItem[] candidates, string label, CancellationToken cancellation)
    {
        var banner = new Grid { Tag = Bleed };
        var index = 0;
        var dots = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom };
        var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(9) };
        cancellation.Register(() => Dispatcher.BeginInvoke(timer.Stop));
        void Show(int target, bool animate)
        {
            if (cancellation.IsCancellationRequested) return;
            index = (target + candidates.Length) % candidates.Length;
            var item = candidates[index];
            var hero = Hero(item, label, item.DisplayTitle, item.Caption, item.Overview,
                item.CanPlay ? item.Resume > 0 ? "▶   Reprendre" : "▶   Lire" : "Voir la fiche",
                item.CanPlay ? () => StartPlayback(item) : () => OpenDetail(item, ButtonTab.Home),
                item.CanPlay ? Action("Voir la fiche", () => OpenDetail(item, ButtonTab.Home)) : null, cancellation);
            var previous = banner.Children.OfType<FrameworkElement>().Where(child => child.Tag as string == "slide").ToArray();
            hero.Tag = "slide";
            banner.Children.Insert(banner.Children.Count - (candidates.Length > 1 ? 1 : 0), hero);
            if (animate && SystemParameters.ClientAreaAnimation)
            {
                var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(520)) { EasingFunction = new CubicEase() };
                fade.Completed += (_, _) => { foreach (var old in previous) banner.Children.Remove(old); };
                hero.BeginAnimation(UIElement.OpacityProperty, fade);
            }
            else foreach (var old in previous) banner.Children.Remove(old);
            for (var dot = 0; dot < dots.Children.Count; dot++)
                if (dots.Children[dot] is Button { Content: Border pill })
                {
                    pill.Width = dot == index ? 22 : 7;
                    pill.Background = dot == index ? BrushFor("Ink") : ColorOf("#55FFFFFF");
                }
        }
        if (candidates.Length > 1)
        {
            var pager = new Grid { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 44, 70) };
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            var previousButton = Action("‹", () => { Show(index - 1, true); timer.Stop(); timer.Start(); }, "DockIcon");
            previousButton.Content = "\uE76B"; previousButton.Foreground = BrushFor("Ink");
            AutomationProperties.SetName(previousButton, "Titre précédent");
            var nextButton = Action("›", () => { Show(index + 1, true); timer.Stop(); timer.Start(); }, "DockIcon");
            nextButton.Content = "\uE76C"; nextButton.Foreground = BrushFor("Ink");
            AutomationProperties.SetName(nextButton, "Titre suivant");
            for (var dot = 0; dot < candidates.Length; dot++)
            {
                var target = dot;
                var pill = new Border { Height = 7, Width = 7, CornerRadius = new CornerRadius(3.5), Background = ColorOf("#55FFFFFF") };
                var hit = new Button { Style = (Style)Resources["Card"], Content = pill, Padding = new Thickness(4), Margin = new Thickness(2, 0, 2, 0),
                    VerticalAlignment = VerticalAlignment.Center, Background = Brushes.Transparent };
                AutomationProperties.SetName(hit, $"Titre {dot + 1} sur {candidates.Length}");
                hit.Click += (_, _) => { Show(target, true); timer.Stop(); timer.Start(); };
                dots.Children.Add(hit);
            }
            row.Children.Add(previousButton);
            dots.Margin = new Thickness(6, 0, 6, 0);
            row.Children.Add(dots);
            row.Children.Add(nextButton);
            pager.Children.Add(row);
            banner.Children.Add(pager);
            timer.Tick += (_, _) => { if (!banner.IsMouseOver && banner.IsVisible) Show(index + 1, true); };
            banner.Loaded += (_, _) => timer.Start();
            banner.Unloaded += (_, _) => timer.Stop();
        }
        Show(0, false);
        return banner;
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
        // 0.6 : visuel pleine largeur (sous le bandeau), image gardée dans ses proportions
        // et calée à droite, fond flouté du même visuel, fondus vers la page.
        var canvas = ((SolidColorBrush)BrushFor("Canvas")).Color;
        Color Shade(byte alpha) => Color.FromArgb(alpha, canvas.R, canvas.G, canvas.B);
        var image = new Image();
        var backdrop = new ImageBrush { Stretch = Stretch.UniformToFill, AlignmentX = AlignmentX.Right, AlignmentY = AlignmentY.Top };
        BindingOperations.SetBinding(backdrop, ImageBrush.ImageSourceProperty, new Binding(nameof(Image.Source)) { Source = image });
        var ambient = new ImageBrush { Stretch = Stretch.UniformToFill };
        BindingOperations.SetBinding(ambient, ImageBrush.ImageSourceProperty, new Binding(nameof(Image.Source)) { Source = image });
        var layers = new Grid { Background = BrushFor("Canvas"), ClipToBounds = true };
        var glow = new Border { Background = ambient, Opacity = 0, Effect = new BlurEffect { Radius = 70, KernelType = KernelType.Gaussian } };
        layers.Children.Add(glow);
        var picture = new Border { Background = backdrop, HorizontalAlignment = HorizontalAlignment.Right, Opacity = 0 };
        layers.Children.Add(picture);
        // Lisibilité du texte à gauche, du bandeau en haut, et fondu vers la page en bas.
        layers.Children.Add(new Border { Background = new LinearGradientBrush
        {
            StartPoint = new Point(0, 0), EndPoint = new Point(1, 0),
            GradientStops = { new GradientStop(Shade(245), 0), new GradientStop(Shade(200), .28), new GradientStop(Shade(70), .55), new GradientStop(Shade(0), .78) }
        } });
        layers.Children.Add(new Border { Background = new LinearGradientBrush
        {
            StartPoint = new Point(.5, 0), EndPoint = new Point(.5, 1),
            GradientStops = { new GradientStop(Shade(150), 0), new GradientStop(Shade(0), .22), new GradientStop(Shade(0), .58), new GradientStop(Shade(255), 1) }
        } });
        var copy = new StackPanel { HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Bottom, MaxWidth = 620 };
        var badge = Text(eyebrow, 12, true, "Accent");
        badge.FontWeight = FontWeights.Bold;
        copy.Children.Add(badge);
        var heading = Text(title, 60, true);
        heading.Margin = new Thickness(0, 8, 0, 0);
        heading.TextWrapping = TextWrapping.Wrap;
        heading.MaxHeight = 150;
        heading.TextTrimming = TextTrimming.CharacterEllipsis;
        heading.LineHeight = 66;
        heading.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
        var titleLogo = new Image { MaxHeight = 150, MaxWidth = 480, Stretch = Stretch.Uniform,
            HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 14, 0, 6), Visibility = Visibility.Collapsed };
        RenderOptions.SetBitmapScalingMode(titleLogo, BitmapScalingMode.HighQuality);
        copy.Children.Add(titleLogo);
        copy.Children.Add(heading);
        if (artwork is { } art) _ = ShowLogo(art, titleLogo, heading, item, cancellation);
        var metadata = Text(caption, 15, color: "Muted");
        metadata.TextTrimming = TextTrimming.CharacterEllipsis;
        metadata.Margin = new Thickness(0, 8, 0, 0);
        copy.Children.Add(metadata);
        if (!string.IsNullOrWhiteSpace(synopsis))
        {
            var summary = Text(synopsis, 15, color: "Ink");
            summary.Opacity = .86;
            summary.TextWrapping = TextWrapping.Wrap;
            summary.TextTrimming = TextTrimming.WordEllipsis;
            summary.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
            summary.LineHeight = 23;
            summary.MaxHeight = 69;
            summary.MaxWidth = 560;
            summary.HorizontalAlignment = HorizontalAlignment.Left;
            summary.Margin = new Thickness(0, 14, 0, 0);
            copy.Children.Add(summary);
        }
        var actions = new WrapPanel { Margin = new Thickness(0, 22, 0, 0) };
        var primaryButton = Action(primaryLabel, primary, "Primary");
        primaryButton.MinHeight = 48;
        AutomationProperties.SetAutomationId(primaryButton, "PrimaryPlayback");
        configurePrimary?.Invoke(primaryButton);
        actions.Children.Add(primaryButton);
        foreach (var other in new[] { secondary, extra })
        {
            if (other == null) continue;
            other.Margin = new Thickness(10, 0, 0, 0);
            other.MinHeight = 48;
            actions.Children.Add(other);
        }
        copy.Children.Add(actions);
        layers.Children.Add(copy);
        var hero = new Border { Child = layers, Tag = Bleed, Height = 560 };
        void Fit()
        {
            var height = Math.Clamp(Math.Min(Scroller.ViewportHeight * .74, layers.ActualWidth * .58), 440, 860);
            if (Math.Abs(hero.Height - height) > 1) hero.Height = height;
            var top = PageContent.Margin.Top;
            copy.Margin = new Thickness(PageContent.Margin.Left + 6, top, 40, 58);
            // Image dans ses proportions, calée à droite ; à gauche, le même visuel flouté.
            var source = image.Source;
            var aspect = source is { Height: > 0 } ? source.Width / source.Height : 16 / 9.0;
            var width = Math.Min(layers.ActualWidth, hero.Height * aspect);
            picture.Width = width;
            var edge = layers.ActualWidth > 0 ? Math.Clamp(1 - width / layers.ActualWidth, 0, .9) : 0;
            picture.OpacityMask = edge < .02 ? null : new LinearGradientBrush
            {
                StartPoint = new Point(0, .5), EndPoint = new Point(1, .5),
                GradientStops = { new GradientStop(Colors.Transparent, 0), new GradientStop(Colors.White, Math.Min(.45, .12 + edge)), new GradientStop(Colors.White, 1) }
            };
        }
        layers.SizeChanged += (_, _) => Fit();
        Scroller.SizeChanged += (_, _) => Fit();
        hero.Loaded += (_, _) => { ApplyContentMargins(); Fit(); };
        async Task LoadHeroArt()
        {
            if (artwork == null) return;
            await artwork.Load(image, item, true, 1920, cancellation);
            if (cancellation.IsCancellationRequested || image.Source == null) return;
            Fit();
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            picture.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(600)) { EasingFunction = ease });
            glow.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(.45, TimeSpan.FromMilliseconds(800)) { EasingFunction = ease });
            // Léger zoom arrière (effet « Ken Burns » discret) à l'apparition.
            if (SystemParameters.ClientAreaAnimation)
            {
                var zoom = new ScaleTransform(1.04, 1.04);
                picture.RenderTransformOrigin = new Point(.7, .4);
                picture.RenderTransform = zoom;
                var settle = new DoubleAnimation(1.04, 1, TimeSpan.FromSeconds(7)) { EasingFunction = ease };
                zoom.BeginAnimation(ScaleTransform.ScaleXProperty, settle);
                zoom.BeginAnimation(ScaleTransform.ScaleYProperty, settle);
            }
        }
        _ = LoadHeroArt();
        _ = artwork?.Load(AmbientArt, item, true, 1000, cancellation);
        Reveal(copy, 120, 18);
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
        var head = new DockPanel { Margin = new Thickness(0, 30, 0, 4) };
        var label = Text(title, 21, true);
        label.VerticalAlignment = VerticalAlignment.Center;
        if (items is not { Length: > 0 })
        {
            head.Children.Add(label);
            head.Margin = new Thickness(0, 30, 0, 12);
            PageContent.Children.Add(head);
            PageContent.Children.Add(Message(items == null ? "Section indisponible. Cliquez sur Accueil pour réessayer." : empty));
            return;
        }
        var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(12, 14, 12, 12) };
        var scroll = new ScrollViewer
        {
            Content = row, HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, CanContentScroll = false,
            Margin = new Thickness(-12, 0, -12, 0), Focusable = false
        };
        if (items.Length > 1)
        {
            var arrows = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            DockPanel.SetDock(arrows, Dock.Right);
            var previous = Action("‹", () => GlideTo(scroll, scroll.HorizontalOffset - scroll.ViewportWidth * .8), "DockIcon");
            var next = Action("›", () => GlideTo(scroll, scroll.HorizontalOffset + scroll.ViewportWidth * .8), "DockIcon");
            previous.Content = "\uE76B";
            next.Content = "\uE76C";
            AutomationProperties.SetName(previous, title + " précédent");
            AutomationProperties.SetName(next, title + " suivant");
            foreach (var arrow in new[] { previous, next })
            {
                arrow.Width = arrow.Height = arrow.MinHeight = 34;
                arrow.FontSize = 12;
                arrow.Margin = new Thickness(6, 0, 0, 0);
                arrow.Background = ColorOf("#14FFFFFF");
                arrows.Children.Add(arrow);
            }
            previous.IsEnabled = false;
            scroll.ScrollChanged += (_, _) =>
            {
                previous.IsEnabled = scroll.HorizontalOffset > 1;
                next.IsEnabled = scroll.HorizontalOffset < scroll.ScrollableWidth - 1;
            };
            head.Children.Add(arrows);
        }
        head.Children.Add(label);
        foreach (var item in items) row.Children.Add(Card(item, landscape, ButtonTab.Home, cancellation));
        PageContent.Children.Add(head);
        PageContent.Children.Add(scroll);
    }

    private Button Card(MediaItem item, bool landscape, ButtonTab tab, CancellationToken cancellation)
    {
        var width = landscape ? 264 : 168;
        var image = new Image { Stretch = Stretch.UniformToFill };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(image);
        var surface = new Grid { Height = landscape ? 148 : 252, ClipToBounds = true, RenderTransformOrigin = new Point(.5, .5) };
        var zoom = new ScaleTransform(1, 1);
        surface.RenderTransform = zoom;
        surface.Background = new LinearGradientBrush(Color.FromRgb(30, 32, 46), Color.FromRgb(18, 19, 28), 60);
        surface.Children.Add(new TextBlock
        {
            Text = item.Name.Length > 0 ? item.Name[..1] : "N", Foreground = ColorOf("#4D5268"),
            FontFamily = (FontFamily)Resources["DisplayFont"], FontSize = 38, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center
        });
        surface.Children.Add(image);
        // Fin de visuel assombrie : la barre de progression reste lisible sur les images claires.
        if (item.Progress > 0)
        {
            surface.Children.Add(new Border { Height = 46, VerticalAlignment = VerticalAlignment.Bottom,
                Background = new LinearGradientBrush(Color.FromArgb(0, 0, 0, 0), Color.FromArgb(170, 0, 0, 0), 90) });
            var track = new Grid { Height = 4, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(12, 0, 12, 11) };
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(item.Progress, .02, 1), GridUnitType.Star) });
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(1 - item.Progress, 0, .98), GridUnitType.Star) });
            var rail = new Border { CornerRadius = new CornerRadius(2), Background = ColorOf("#4DFFFFFF") };
            Grid.SetColumnSpan(rail, 2);
            track.Children.Add(rail);
            track.Children.Add(new Border { CornerRadius = new CornerRadius(2), Background = BrushFor("AccentGradient") });
            surface.Children.Add(track);
        }
        else if (item.UserData?.Played == true)
        {
            surface.Children.Add(new Border
            {
                Width = 24, Height = 24, CornerRadius = new CornerRadius(12), Background = ColorOf("#EBF5F4FA"),
                HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(8),
                Child = new TextBlock { Text = "\uE73E", FontFamily = (FontFamily)Resources["IconFont"], FontSize = 12, Foreground = ColorOf("#0A0A12"),
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }
            });
            AutomationProperties.SetHelpText(surface, "Vu");
        }
        var shine = new Border { BorderBrush = ColorOf("#59FFFFFF"), BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(12), Opacity = 0 };
        surface.Children.Add(shine);
        surface.SizeChanged += (_, _) => surface.Clip = new RectangleGeometry(new Rect(surface.RenderSize), 12, 12);
        var title = Text(item.DisplayTitle, 14, true);
        title.TextTrimming = TextTrimming.CharacterEllipsis;
        var subtitle = Text(item.Caption, 12.5, color: "Muted");
        subtitle.TextTrimming = TextTrimming.CharacterEllipsis;
        subtitle.Margin = new Thickness(0, 2, 0, 0);
        var labels = new StackPanel { Margin = new Thickness(2, 11, 4, 2) };
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
        button.Width = width;
        button.Margin = new Thickness(0, 0, 18, 6);
        // Survol : visuel légèrement agrandi et liseré clair, animés.
        void Lift(bool up)
        {
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            var scale = new DoubleAnimation(up ? 1.05 : 1, TimeSpan.FromMilliseconds(up ? 200 : 240)) { EasingFunction = ease };
            zoom.BeginAnimation(ScaleTransform.ScaleXProperty, scale);
            zoom.BeginAnimation(ScaleTransform.ScaleYProperty, scale);
            shine.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(up ? 1 : 0, TimeSpan.FromMilliseconds(200)));
            Panel.SetZIndex(button, up ? 1 : 0);
        }
        button.MouseEnter += (_, _) => Lift(true);
        button.MouseLeave += (_, _) => Lift(false);
        button.GotKeyboardFocus += (_, _) => { Lift(true); button.BringIntoView(); };
        button.LostKeyboardFocus += (_, _) => Lift(false);
        _ = artwork?.Load(image, item, landscape, landscape ? 560 : 360, cancellation);
        return button;
    }

    private FrameworkElement Heading(string title, string subtitle)
    {
        var heading = new StackPanel { Margin = new Thickness(0, 8, 0, 22) };
        var name = Text(title, 36, true);
        name.TextWrapping = TextWrapping.Wrap;
        heading.Children.Add(name);
        var caption = Text(subtitle, 15, color: "Muted");
        caption.Margin = new Thickness(0, 6, 0, 0);
        caption.TextWrapping = TextWrapping.Wrap;
        heading.Children.Add(caption);
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
            SetLabel(seriesPlay, playable == null ? "Voir les épisodes" : playable.Resume > 0 ?
                $"▶   Reprendre S{playable.ParentIndexNumber} E{playable.IndexNumber}" : $"▶   Lire S{playable.ParentIndexNumber} E{playable.IndexNumber}");
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
                SetLabel(button, Label());
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
                SetLabel(button, Label());
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
        play.VerticalAlignment = VerticalAlignment.Center;
        DockPanel.SetDock(play, Dock.Right);
        row.Children.Add(play);
        var mark = MarkButton(account, item, cancellation);
        mark.Margin = new Thickness(8, 0, 10, 0);
        mark.VerticalAlignment = VerticalAlignment.Center;
        DockPanel.SetDock(mark, Dock.Right);
        row.Children.Add(mark);
        var thumbnail = new Image { Stretch = Stretch.UniformToFill };
        RenderOptions.SetBitmapScalingMode(thumbnail, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(thumbnail);
        var frame = new Grid { Width = 192, Height = 108, Background = ColorOf("#1A1D29"), ClipToBounds = true, Margin = new Thickness(0, 0, 18, 0) };
        frame.Children.Add(thumbnail);
        if (item.Progress > 0)
        {
            var track = new Grid { Height = 3, VerticalAlignment = VerticalAlignment.Bottom };
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(item.Progress, .02, 1), GridUnitType.Star) });
            track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Clamp(1 - item.Progress, 0, .98), GridUnitType.Star) });
            var rail = new Border { Background = ColorOf("#59FFFFFF") };
            Grid.SetColumnSpan(rail, 2);
            track.Children.Add(rail);
            track.Children.Add(new Border { Background = BrushFor("AccentGradient") });
            frame.Children.Add(track);
        }
        frame.SizeChanged += (_, _) => frame.Clip = new RectangleGeometry(new Rect(frame.RenderSize), 10, 10);
        DockPanel.SetDock(frame, Dock.Left);
        row.Children.Add(frame);
        _ = artwork?.Load(thumbnail, item, false, 400, cancellation);
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
        var label = Text(item.Caption, 16, true);
        label.TextTrimming = TextTrimming.CharacterEllipsis;
        copy.Children.Add(label);
        if (item.RunTimeTicks is > 0)
        {
            var length = Text($"{TimeSpan.FromTicks(item.RunTimeTicks.Value).TotalMinutes:0} min" + (item.UserData?.Played == true ? " · Vu" : ""), 12.5, color: "Muted");
            length.Margin = new Thickness(0, 3, 0, 0);
            copy.Children.Add(length);
        }
        if (!string.IsNullOrWhiteSpace(item.Overview))
        {
            var overview = Text(item.Overview, 13, color: "Muted");
            overview.TextWrapping = TextWrapping.Wrap;
            overview.TextTrimming = TextTrimming.WordEllipsis;
            overview.MaxHeight = 38;
            overview.LineHeight = 19;
            overview.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
            overview.Margin = new Thickness(0, 6, 0, 0);
            copy.Children.Add(overview);
        }
        row.Children.Add(copy);
        var card = new Border
        {
            Background = ColorOf("#0AFFFFFF"), CornerRadius = new CornerRadius(14), Padding = new Thickness(12, 12, 14, 12),
            Margin = new Thickness(0, 0, 0, 10), Child = row
        };
        card.MouseEnter += (_, _) => card.Background = ColorOf("#14FFFFFF");
        card.MouseLeave += (_, _) => card.Background = ColorOf("#0AFFFFFF");
        return card;
    }
}
