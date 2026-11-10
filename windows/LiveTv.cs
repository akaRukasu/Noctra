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

namespace Noctra.Windows;

public partial class MainWindow
{
    private sealed record TvServer(string Label, LiveStream? Stream = null, string? Resolver = null, Uri? External = null, bool ManualOnly = false);
    private TvSources? savedTvSources;
    private Jellyfin? savedTvOwner;
    private DateTime savedTvUntil;
    private void OpenTv(object sender, RoutedEventArgs args) => _ = Navigate(TvPage(), reset: true);
    private static bool SportsSource(TvSource source) => source.Section == "sports" || source.Section == null &&
        (source.Type is "streamed" or "ppv" or "brigitte" or "volkamax" or "dlstreams" or "daddylive" || source.Id.Contains("-sports", StringComparison.OrdinalIgnoreCase));
    // LiveWatch also calls regular channel identifiers eventId. The source section is authoritative.
    internal static bool SportsEntry(TvSource source, TvEntry entry) => entry.IsEvent || SportsSource(source);

    private Page TvPage(string? sourceId = null, bool sports = false, string? group = null, string? country = null) =>
        new(sports ? "Sports et PPV" : "TV en direct", ButtonTab.Tv, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(sports ? "Les grands rendez-vous" : "La télévision, autrement",
            sports ? "Événements sportifs et PPV, séparés des chaînes en continu." : "Vos chaînes en direct, réunies dans un même espace."));
        if (account.NoctraRoot == null) { PageContent.Children.Add(Message("Connectez-vous avec l’adresse Noctra pour accéder à la TV.")); return; }
        var service = new NoctraService(account, account.NoctraRoot);
        var loading = Message("Chargement des sources…"); PageContent.Children.Add(loading);
        TvSources data;
        try
        {
            if (savedTvOwner == account && savedTvSources != null && savedTvUntil > DateTime.UtcNow) data = savedTvSources;
            else
            {
                data = await service.Read<TvSources>("api/tv/sources", cancellation);
                if (data.Sources == null) throw new NoctraApiException("Le serveur Noctra a renvoyé une liste de sources incomplète.");
                if (!cancellation.IsCancellationRequested && client == account)
                { savedTvOwner = account; savedTvSources = data; savedTvUntil = DateTime.UtcNow.AddMinutes(5); }
            }
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or InvalidOperationException or OperationCanceledException)
        {
            if (cancellation.IsCancellationRequested) return;
            PageContent.Children.Remove(loading);
            PageContent.Children.Add(Message(error is NoctraApiException ? error.Message : "Impossible de joindre les sources TV de Noctra. Réessayez dans un instant."));
            if (savedTvOwner == account && savedTvSources != null) data = savedTvSources;
            else
            {
                var retry = Action("Réessayer les sources TV", () => _ = Navigate(TvPage(sourceId, sports, group, country), back: true));
                retry.HorizontalAlignment = HorizontalAlignment.Left; PageContent.Children.Add(retry); return;
            }
        }
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Remove(loading);
        var sources = (data.Sources ?? []).Where(source => !string.IsNullOrWhiteSpace(source.Id) && SportsSource(source) == sports).ToArray();
        var selected = sources.FirstOrDefault(source => source.Id == sourceId);
        var activeCountry = sports ? "*" : country ?? (selected == null ? "fr" : "*");
        Button? selectedSourceButton = null;
        void MenuItem(string name, Action open, bool active = false)
        {
            // 0.6 : menu latéral discret, entrée active surlignée en violet translucide.
            var button = Action(name, open); button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Margin = new Thickness(0, 0, 0, 4); button.MinHeight = 38; button.Padding = new Thickness(12, 6, 12, 6);
            button.Background = active ? ColorOf("#33BCAAFF") : Brushes.Transparent;
            var text = Text(name, 13, active); text.Foreground = BrushFor(active ? "Ink" : "Muted"); text.TextTrimming = TextTrimming.CharacterEllipsis;
            button.Content = text; TvMenu.Children.Add(button);
            if (active) selectedSourceButton = button;
        }
        MenuItem("Chaînes", () => _ = Navigate(TvPage(), back: true), !sports);
        MenuItem("Sports et PPV", () => _ = Navigate(TvPage(sports: true), back: true), sports);
        var sourceLabel = Text("VOS SOURCES", 10, true, "Muted"); sourceLabel.Margin = new Thickness(8, 18, 0, 12); TvMenu.Children.Add(sourceLabel);
        MenuItem("Toutes les sources", () => _ = Navigate(TvPage(sports: sports, country: activeCountry), back: true), selected == null);
        foreach (var source in sources) MenuItem(source.Name, () => _ = Navigate(TvPage(source.Id, sports), back: true), selected == source);
        TvSidebar.Visibility = Visibility.Visible;
        if (selectedSourceButton is { } sourceButton)
            _ = Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, () =>
            {
                if (!cancellation.IsCancellationRequested) sourceButton.BringIntoView();
            });
        var content = new StackPanel(); PageContent.Children.Add(content);
        var title = Text(selected?.Name ?? (sports ? "Tous les événements" : "Toutes les chaînes"), 23, true); content.Children.Add(title);
        if (sources.Length == 0) { content.Children.Add(Message("Aucune source dans cette section.")); return; }
        var waiting = Text("Les catalogues se chargent progressivement…", 12, color: "Muted"); waiting.Margin = new Thickness(0, 14, 0, 14); content.Children.Add(waiting);
        var scope = selected == null ? sources : new[] { selected }; var catalogs = new TvCatalog?[scope.Length];
        var errors = new string?[scope.Length];
        var childCatalogs = new List<(TvSource Source, TvCatalog Catalog, string? Bouquet)>();
        var childErrors = 0;
        if (tvCatalogOwner != account) { tvCatalogCache.Clear(); tvCatalogOwner = account; }
        string PathFor(int index) => group == null ? "api/tv/catalog?source=" + Uri.EscapeDataString(scope[index].Id) : "api/tv/catalog?ref=" + Uri.EscapeDataString(group);
        for (var index = 0; index < scope.Length; index++)
            if (tvCatalogCache.TryGetValue(PathFor(index), out var cached) && cached.Until > DateTime.UtcNow) catalogs[index] = cached.Value;
        var bouquets = new StackPanel(); content.Children.Add(bouquets);
        var countryBox = new ComboBox { Width = 260, HorizontalAlignment = HorizontalAlignment.Left, DisplayMemberPath = "Name", SelectedValuePath = "Code", Margin = new Thickness(0, 6, 0, 12) };
        AutomationProperties.SetAutomationId(countryBox, "TvCountry"); AutomationProperties.SetName(countryBox, "Pays des chaînes");
        var updatingCountries = false;
        var countrySignature = "";
        if (!sports) { content.Children.Add(Text("Pays", 12, color: "Muted")); content.Children.Add(countryBox); }
        var searchLabel = Text(sports ? "Rechercher un événement" : "Rechercher une chaîne", 12, color: "Muted");
        searchLabel.Margin = new Thickness(0, 16, 0, 6); content.Children.Add(searchLabel);
        var filter = new TextBox { Width = 360, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 16) };
        AutomationProperties.SetAutomationId(filter, "TvSearch");
        AutomationProperties.SetName(filter, sports ? "Filtrer les événements" : "Filtrer les chaînes"); content.Children.Add(filter);
        var count = Text("Chargement…", 12, color: "Muted"); count.Margin = new Thickness(0, 0, 0, 14); content.Children.Add(count);
        var listing = new StackPanel(); content.Children.Add(listing); var offset = 0;
        TvChannel[] channels = [];
        var loadingCatalogs = true;
        void RenderChannels()
        {
            if (cancellation.IsCancellationRequested) return;
            var matches = channels.Where(channel => ChannelKey(channel.Name).Contains(ChannelKey(filter.Text.Trim()), StringComparison.OrdinalIgnoreCase)).ToArray(); listing.Children.Clear();
            var grid = new AdaptiveTilePanel { MinimumCellWidth = sports ? 250 : 170, MaximumColumns = 10, Margin = new Thickness(-5, 0, -5, 0) };
            foreach (var channel in matches.Skip(offset).Take(60))
            {
                var card = TvCard(service, channel, cancellation, sports); card.Width = double.NaN; grid.Children.Add(card);
            }
            listing.Children.Add(grid);
            if (matches.Length == 0 && !loadingCatalogs && (selected == null && group == null || !catalogs.Any(catalog => catalog?.Groups?.Length > 0)))
                listing.Children.Add(Message(sports ? "Aucun événement publié pour cette sélection." : "Aucune chaîne disponible pour cette sélection."));
            var pages = new StackPanel { Orientation = Orientation.Horizontal };
            if (offset > 0) pages.Children.Add(Action("Précédent", () => { offset -= 60; RenderChannels(); title.BringIntoView(); }));
            if (offset + 60 < matches.Length) pages.Children.Add(Action("Suivant", () => { offset += 60; RenderChannels(); title.BringIntoView(); }));
            listing.Children.Add(pages);
        }
        void UpdateCatalogs()
        {
            if (cancellation.IsCancellationRequested) return;
            var entries = catalogs.SelectMany((catalog, index) => (catalog?.Channels ?? []).Select(entry => (Source: scope[index], Entry: entry)))
                .Concat(childCatalogs.SelectMany(part => (part.Catalog.Channels ?? []).Select(entry => (part.Source, Entry: string.IsNullOrWhiteSpace(entry.Group) && string.IsNullOrWhiteSpace(entry.Country) ? entry with { Group = part.Bouquet } : entry))))
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Entry.Name) && SportsEntry(pair.Source, pair.Entry) == sports)
                .DistinctBy(pair => (pair.Source.Id, pair.Entry.Name, pair.Entry.StreamUrl, pair.Entry.ResolverUrl, pair.Entry.EmbedUrl, pair.Entry.ExternalUrl)).ToArray();
            bouquets.Children.Clear();
            var groups = catalogs.SelectMany((catalog, index) => (catalog?.Groups ?? []).Select(category => (Category: category, Source: scope[index])))
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Category.Ref)).DistinctBy(pair => pair.Category.Ref).ToArray();
            if (!sports)
            {
                var codes = entries.Select(pair => TvCountry.Of(pair.Entry)).Concat(groups.Select(pair => TvCountry.Group(pair.Category.Name ?? pair.Category.Title)))
                    .Append(activeCountry).Append("fr").Distinct().Where(code => code != "*").OrderBy(code => code == "fr" ? 0 : 1).ThenBy(TvCountry.Label);
                var options = new[] { new TvCountryChoice("*", TvCountry.Label("*")) }.Concat(codes.Select(code => new TvCountryChoice(code, TvCountry.Label(code)))).ToArray();
                var signature = string.Join("|", options.Select(option => option.Code));
                if (signature != countrySignature && !countryBox.IsDropDownOpen)
                {
                    updatingCountries = true;
                    countryBox.ItemsSource = options; countryBox.SelectedValue = activeCountry; countrySignature = signature;
                    updatingCountries = false;
                }
            }
            channels = TvIdentity.Group(entries.Where(pair => sports || activeCountry == "*" || TvCountry.Of(pair.Entry) == activeCountry), sports)
                .OrderBy(channel => IsTvFavorite(channel.Name) ? 0 : 1)
                .ThenBy(channel => TvCountry.Of(channel.Entries[0].Entry) == "fr" ? 0 : 1).ThenBy(channel => channel.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
            // Comme la PWA : dans « Toutes les chaînes », les bouquets sont ouverts et leurs chaînes mêlées à la liste
            // (filtrée par pays) ; la grille des bouquets reste réservée à la page d'une source.
            if (selected == null && group == null) groups = [];
            groups = groups.Where(pair => sports || activeCountry == "*" || TvCountry.Group(pair.Category.Name ?? pair.Category.Title) is "zz" || TvCountry.Group(pair.Category.Name ?? pair.Category.Title) == activeCountry).ToArray();
            if (groups.Length > 0)
            {
                var heading = Text("Choisir un bouquet", 20, true); heading.Margin = new Thickness(0, 10, 0, 12); bouquets.Children.Add(heading);
                var groupGrid = new AdaptiveTilePanel { MinimumCellWidth = 210, MaximumColumns = 5 };
                foreach (var pair in groups)
                {
                    var label = pair.Category.Name ?? pair.Category.Title ?? "Bouquet";
                    var groupCountry = TvCountry.Group(label);
                    var button = Action(label, () => _ = Navigate(TvPage(pair.Source.Id, sports, pair.Category.Ref, groupCountry == "zz" ? activeCountry : groupCountry)));
                    button.HorizontalContentAlignment = HorizontalAlignment.Left; button.Margin = new Thickness(0, 0, 10, 10);
                    button.ToolTip = pair.Source.Name + " · " + label; groupGrid.Children.Add(button);
                }
                bouquets.Children.Add(groupGrid);
            }
            var failed = errors.Count(error => error != null) + childErrors;
            count.Text = (channels.Length > 0 || groups.Length == 0 ? $"{channels.Length} " + (sports ? "événements" : "chaînes") : $"{groups.Length} bouquets · choisissez une catégorie") +
                (failed > 0 ? $" · {failed} source(s) indisponible(s)" : "");
            waiting.Text = loadingCatalogs ? "Les autres sources arrivent… Vous pouvez déjà choisir une chaîne." :
                string.Join(" · ", catalogs.Select(catalog => catalog?.Warning).Where(warning => !string.IsNullOrWhiteSpace(warning)).Distinct().Take(2));
            waiting.Visibility = waiting.Text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
            RenderChannels();
            if (!loadingCatalogs && channels.Length == 0)
                foreach (var index in Enumerable.Range(0, scope.Length).Where(index => errors[index] != null).Take(3)) listing.Children.Add(Message(scope[index].Name + " · " + errors[index]));
        }
        filter.TextChanged += (_, _) => { offset = 0; RenderChannels(); }; UpdateCatalogs();
        countryBox.SelectionChanged += (_, _) =>
        {
            if (!updatingCountries && countryBox.SelectedItem is TvCountryChoice choice && choice.Code != activeCountry)
                _ = Navigate(TvPage(sourceId, sports, group, choice.Code), back: true);
        };
        countryBox.DropDownClosed += (_, _) => UpdateCatalogs();
        var refresh = Action("Actualiser les catalogues", () => { tvCatalogCache.Clear(); savedTvUntil = DateTime.MinValue; _ = Navigate(TvPage(sourceId, sports, group, activeCountry), back: true); });
        refresh.Margin = new Thickness(0, 16, 0, 0); refresh.HorizontalAlignment = HorizontalAlignment.Left; content.Children.Add(refresh);
        await Parallel.ForEachAsync(Enumerable.Range(0, scope.Length), new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = cancellation }, async (index, ct) =>
        {
            try
            {
                var path = PathFor(index);
                if (catalogs[index] == null || catalogs[index]!.Progressive)
                {
                    catalogs[index] = await service.Read<TvCatalog>(path, ct, timeoutSeconds: 18);
                    await Dispatcher.InvokeAsync(UpdateCatalogs);
                }
                for (var retry = 0; catalogs[index]?.Progressive == true && retry < 3; retry++)
                {
                    await Task.Delay(Math.Clamp(catalogs[index]!.RetryAfterMs, 1800, 7000) + retry * 1500, ct);
                    catalogs[index] = await service.Read<TvCatalog>(path, ct, timeoutSeconds: 12, retry: false);
                    await Dispatcher.InvokeAsync(UpdateCatalogs);
                }
                if (!ct.IsCancellationRequested && client == account && catalogs[index] is { } catalog)
                {
                    await Dispatcher.InvokeAsync(() => { if (tvCatalogCache.Count > 160) tvCatalogCache.Clear(); tvCatalogCache[path] = (DateTime.UtcNow.AddSeconds(catalog.Progressive ? 5 : 180), catalog); });
                }
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
            { errors[index] = error is NoctraApiException ? error.Message : "Catalogue momentanément indisponible."; }
        });
        if (cancellation.IsCancellationRequested) return;
        if (selected == null && group == null)
        {
            // Match the web client: expand published bouquets too, so their variants join the shared cards.
            var jobs = catalogs.SelectMany((catalog, index) => (catalog?.Groups ?? []).Where(category => !string.IsNullOrWhiteSpace(category.Ref))
                .Select(category => (Source: scope[index], Group: category)))
                .DistinctBy(job => (job.Source.Id, job.Group.Ref))
                .Where(job => sports || activeCountry == "*" || TvCountry.Group(job.Group.Name ?? job.Group.Title) is "zz" || TvCountry.Group(job.Group.Name ?? job.Group.Title) == activeCountry)
                .OrderByDescending(job => (job.Group.Name ?? job.Group.Title ?? "").Contains("France", StringComparison.OrdinalIgnoreCase)).Take(120).ToArray();
            await Parallel.ForEachAsync(jobs, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = cancellation }, async (job, ct) =>
            {
                try
                {
                    var path = "api/tv/catalog?ref=" + Uri.EscapeDataString(job.Group.Ref!);
                    TvCatalog? value = null;
                    await Dispatcher.InvokeAsync(() => { if (tvCatalogCache.TryGetValue(path, out var saved) && saved.Until > DateTime.UtcNow) value = saved.Value; });
                    value ??= await service.Read<TvCatalog>(path, ct, timeoutSeconds: 12, retry: false);
                    if (ct.IsCancellationRequested) return;
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (ct.IsCancellationRequested) return;
                        childCatalogs.Add((job.Source, value, job.Group.Name ?? job.Group.Title)); // une chaîne sans pays prend celui de son bouquet
                        if (tvCatalogCache.Count > 160) tvCatalogCache.Clear();
                        tvCatalogCache[path] = (DateTime.UtcNow.AddSeconds(90), value);
                        UpdateCatalogs();
                    });
                }
                catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
                { await Dispatcher.InvokeAsync(() => childErrors++); }
            });
        }
        if (cancellation.IsCancellationRequested) return;
        loadingCatalogs = false; UpdateCatalogs();
    });

    private readonly Dictionary<string, (DateTime Until, TvCatalog Value)> tvCatalogCache = [];
    private Jellyfin? tvCatalogOwner;

    private static string TvProviderLabel(TvChannel channel, TvSource source, TvEntry entry) =>
        (entry.Provider ?? source.Name) + (channel.Entries.Length > 1 || entry.Name != channel.Name ? " · " + source.Name + " · " + entry.Name : "");

    private static string ChannelKey(string name) => string.Concat(name.Where(value => char.IsLetterOrDigit(value) || value is '+' or '&')).ToUpperInvariant();
    private Button TvCard(NoctraService service, TvChannel channel, CancellationToken cancellation, bool sports)
    {
        var image = new Image { Height = sports ? 90 : 46, MaxWidth = sports ? 200 : 100, Stretch = Stretch.Uniform, Margin = new Thickness(8) };
        if (service.Link(channel.Entries.Select(pair => pair.Entry.Logo).FirstOrDefault(url => !string.IsNullOrWhiteSpace(url))) is { } url && artwork is { } art)
            _ = art.Fetch(image, url.AbsoluteUri, 250, ct => service.Image(url, ct), cancellation);
        // Sports : fond sombre teinté et mention « EN DIRECT » quand l'événement n'a pas d'affiche.
        var top = new Grid { Height = sports ? 132 : 74, Background = sports ? new LinearGradientBrush(Color.FromRgb(42, 33, 72), Color.FromRgb(17, 22, 36), 25) : ColorOf("#F0F1F6") };
        top.Children.Add(new TextBlock { Text = sports ? "\u25CF  EN DIRECT" : string.Concat(channel.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(3).Select(word => word[0])), FontSize = sports ? 15 : 25, FontWeight = FontWeights.Bold, Foreground = sports ? BrushFor("Accent") : ColorOf("#5A6078"), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center });
        var placeholderStyle = new Style(typeof(TextBlock));
        placeholderStyle.Setters.Add(new Setter(VisibilityProperty, Visibility.Collapsed));
        var noImage = new DataTrigger { Binding = new Binding(nameof(Image.Source)) { Source = image }, Value = null };
        noImage.Setters.Add(new Setter(VisibilityProperty, Visibility.Visible)); placeholderStyle.Triggers.Add(noImage);
        ((TextBlock)top.Children[0]).Style = placeholderStyle;
        top.Children.Add(image);
        FrameworkElement logoArea = top;
        // Chaîne favorite : étoile en haut à droite (les favorites passent en tête de liste).
        var star = IsTvFavorite(channel.Name) ? new Border { Width = 24, Height = 24, CornerRadius = new CornerRadius(12), Background = ColorOf("#E607080D"),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(8),
            Child = new TextBlock { Text = "\uE735", FontFamily = (FontFamily)Resources["IconFont"], FontSize = 12, Foreground = BrushFor("Accent"),
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } } : null;
        if (!sports)
        {
            var logoFrame = new Grid { Height = 105, Background = new LinearGradientBrush(Color.FromRgb(31, 33, 48), Color.FromRgb(20, 21, 31), 90) };
            top.SizeChanged += (_, _) => top.Clip = new RectangleGeometry(new Rect(top.RenderSize), 15, 15);
            logoFrame.Children.Add(new Border { Width = 120, Height = 74, Child = top, CornerRadius = new CornerRadius(16), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center });
            logoArea = logoFrame;
        }
        var labels = new StackPanel { Margin = new Thickness(14, 12, 14, 15) }; var title = Text(channel.Name, 13, true); title.TextTrimming = TextTrimming.CharacterEllipsis; labels.Children.Add(title);
        var subtitle = Text(channel.Entries.Select(pair => pair.Source.Name).Distinct().Count() > 1 ? "Plusieurs sources" : channel.Entries[0].Source.Name, 11, color: "Muted"); subtitle.TextTrimming = TextTrimming.CharacterEllipsis; subtitle.Margin = new Thickness(0, 5, 0, 0); labels.Children.Add(subtitle);
        var content = new StackPanel(); content.Children.Add(logoArea); content.Children.Add(labels);
        if (star != null && logoArea is Grid logoGrid) logoGrid.Children.Add(star);
        var panel = new Border { Background = ColorOf("#13151F"), BorderBrush = ColorOf("#1CFFFFFF"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Child = content, ClipToBounds = true,
            RenderTransformOrigin = new Point(.5, .5), RenderTransform = new ScaleTransform(1, 1) };
        panel.SizeChanged += (_, _) => panel.Clip = new RectangleGeometry(new Rect(panel.RenderSize), 15, 15);
        var button = Action(channel.Name, () => _ = Navigate(TvDetail(channel)), "Card"); button.Content = panel; button.Width = sports ? 245 : 165; button.Margin = new Thickness(6, 4, 6, 15); button.ToolTip = channel.Name;
        // Survol : carte légèrement agrandie et liseré clair.
        void Hover(bool on)
        {
            var zoom = (ScaleTransform)panel.RenderTransform;
            var scale = new System.Windows.Media.Animation.DoubleAnimation(on ? 1.04 : 1, TimeSpan.FromMilliseconds(200)) { EasingFunction = new System.Windows.Media.Animation.CubicEase() };
            zoom.BeginAnimation(ScaleTransform.ScaleXProperty, scale); zoom.BeginAnimation(ScaleTransform.ScaleYProperty, scale);
            panel.BorderBrush = ColorOf(on ? "#59FFFFFF" : "#1CFFFFFF"); Panel.SetZIndex(button, on ? 1 : 0);
        }
        button.MouseEnter += (_, _) => Hover(true); button.MouseLeave += (_, _) => Hover(false);
        button.GotKeyboardFocus += (_, _) => Hover(true); button.LostKeyboardFocus += (_, _) => Hover(false);
        return button;
    }

    private async Task AddTvGuide(NoctraService service, string guideId, CancellationToken cancellation)
    {
        var slot = new StackPanel();
        PageContent.Children.Insert(Math.Min(2, PageContent.Children.Count), slot);
        try
        {
            var guide = await service.Json("api/tv/programme?id=" + Uri.EscapeDataString(guideId), cancellation);
            if (cancellation.IsCancellationRequested || !guide.Flag("available")) return;
            var row = new WrapPanel { Margin = new Thickness(0, 0, 0, 18) };
            foreach (var (label, key) in new[] { ("MAINTENANT", "now"), ("ENSUITE", "next") })
            {
                var programme = guide.Field(key);
                var title = programme.Str("title");
                if (title.Length == 0) continue;
                static string Clock(double ms) => ms > 0 ? DateTimeOffset.FromUnixTimeMilliseconds((long)ms).ToLocalTime().ToString("HH:mm") : "";
                var start = Clock(programme.Num("start"));
                var stop = Clock(programme.Num("stop"));
                var copy = new StackPanel();
                copy.Children.Add(Text(label + (start.Length > 0 ? "  ·  " + start + (stop.Length > 0 ? " – " + stop : "") : ""), 11, true, "Accent"));
                var name = Text(title, 16, true);
                name.TextTrimming = TextTrimming.CharacterEllipsis;
                name.Margin = new Thickness(0, 5, 0, 0);
                copy.Children.Add(name);
                // Avancement du programme en cours.
                if (key == "now" && programme.Num("start") > 0 && programme.Num("stop") > programme.Num("start"))
                {
                    var progress = Math.Clamp((DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - programme.Num("start")) / (programme.Num("stop") - programme.Num("start")), 0, 1);
                    var track = new Grid { Height = 3, Margin = new Thickness(0, 10, 0, 0) };
                    track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Max(progress, .01), GridUnitType.Star) });
                    track.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Max(1 - progress, .01), GridUnitType.Star) });
                    var rail = new Border { CornerRadius = new CornerRadius(1.5), Background = ColorOf("#33FFFFFF") };
                    Grid.SetColumnSpan(rail, 2);
                    track.Children.Add(rail);
                    track.Children.Add(new Border { CornerRadius = new CornerRadius(1.5), Background = BrushFor("AccentGradient") });
                    copy.Children.Add(track);
                }
                row.Children.Add(new Border { Child = copy, Width = 340, Padding = new Thickness(18, 14, 18, 14), Margin = new Thickness(0, 0, 12, 0),
                    CornerRadius = new CornerRadius(14), Background = ColorOf("#0DFFFFFF"), BorderBrush = ColorOf("#17FFFFFF"), BorderThickness = new Thickness(1) });
            }
            if (row.Children.Count > 0) { slot.Children.Add(row); Reveal(row); }
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException) { }
    }

    private Page TvDetail(TvChannel channel) => new(channel.Name, ButtonTab.Tv, async (account, cancellation) =>
    {
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot); PageContent.Children.Clear();
        PageContent.Children.Add(Heading(channel.Name, $"{channel.Entries.Length} variante(s) réunie(s) · choisissez votre serveur. Les tests exigent une image vidéo."));
        // 0.6 : chaîne favorite (en tête de liste TV pour ce profil).
        string FavoriteLabel() => IsTvFavorite(channel.Name) ? "★  Chaîne favorite" : "☆  Ajouter aux favoris TV";
        var favorite = Action(FavoriteLabel(), () => { });
        favorite.HorizontalAlignment = HorizontalAlignment.Left; favorite.Margin = new Thickness(0, -8, 0, 18);
        favorite.Click += async (_, _) => { await ToggleTvFavorite(account, channel.Name); favorite.Content = FavoriteLabel(); AutomationProperties.SetName(favorite, FavoriteLabel()); };
        PageContent.Children.Add(favorite);
        // 0.6 : guide des programmes (maintenant / ensuite), comme la PWA (api/tv/programme).
        var guideId = channel.Entries.Select(pair => pair.Entry.IptvOrgId).FirstOrDefault(id => !string.IsNullOrWhiteSpace(id));
        if (guideId != null) _ = AddTvGuide(service, guideId, cancellation);
        var loading = Message("Recherche des serveurs et des lecteurs…"); PageContent.Children.Add(loading);
        var choices = new List<TvServer>(); var seen = new HashSet<string>(StringComparer.Ordinal);
        var qualityChecks = new Dictionary<string, (LiveStream Stream, TextBlock Status)>();
        var actions = new WrapPanel { Margin = new Thickness(0, 0, 0, 22) };
        var play = Action("▶   Lire le direct", () => StartLive(channel.Name, choices.Where(item => item.Stream != null && !item.ManualOnly)
            .Select(item => item.Stream!).DistinctBy(stream => stream.Url.AbsoluteUri).OrderByDescending(IsHealthy).ThenByDescending(VerifiedHeight).ToArray()), "Primary");
        play.IsEnabled = false; actions.Children.Add(play);
        var retest = Action("Rechercher à nouveau", () => { tvResolutionCache.Clear(); _ = Navigate(TvDetail(channel), back: true); });
        retest.Margin = new Thickness(9, 0, 0, 0); actions.Children.Add(retest); PageContent.Children.Add(actions);
        var checkQualities = Action("Vérifier les qualités des serveurs", () => { });
        var checkingQualities = false;
        checkQualities.IsEnabled = false;
        checkQualities.Margin = new Thickness(9, 0, 0, 0); actions.Children.Add(checkQualities);
        checkQualities.Click += async (_, _) =>
        {
            checkingQualities = true; checkQualities.IsEnabled = false; checkQualities.Content = "Vérification des qualités…";
            try { await Task.WhenAll(qualityChecks.Values.ToArray().Select(item => PaintServerHealth(item.Stream, item.Status, cancellation))); }
            finally { checkingQualities = false; checkQualities.IsEnabled = qualityChecks.Count > 0; checkQualities.Content = "Vérifier les qualités des serveurs"; }
        };
        var directArea = new StackPanel(); var webArea = new StackPanel(); var otherArea = new StackPanel();
        var sections = new Dictionary<StackPanel, TextBlock>();
        foreach (var (name, area) in new[] { ("Lecture native", directArea), ("Lecteurs externes protégés", webArea), ("Autres accès", otherArea) })
        {
            var heading = Text(name, 22, true); heading.Margin = new Thickness(0, 6, 0, 14); heading.Visibility = Visibility.Collapsed;
            sections[area] = heading; PageContent.Children.Add(heading); PageContent.Children.Add(area);
        }
        var serverNumber = 0; var probes = 0;
        void AddServer(TvServer server)
        {
            var url = server.Stream?.Url.AbsoluteUri ?? server.Resolver ?? server.External?.AbsoluteUri;
            var key = url == null ? null : server.Label + "\n" + url;
            if (key == null || !seen.Add(key)) return;
            choices.Add(server); play.IsEnabled = choices.Any(item => item.Stream != null && !item.ManualOnly);
            var status = Text(server.Stream != null ? "Prêt à lire · test disponible" :
                server.External != null ? "Lecture web protégée" : "Recherche disponible sans attendre les autres serveurs", 12, color: "Muted");
            var title = Text(server.Label, 15, true); title.TextTrimming = TextTrimming.CharacterEllipsis;
            var labels = new StackPanel { Margin = new Thickness(0, 0, 20, 0) }; labels.Children.Add(title); status.Margin = new Thickness(0, 6, 0, 0); labels.Children.Add(status);
            var bar = new DockPanel(); var buttons = new StackPanel { Orientation = Orientation.Horizontal }; DockPanel.SetDock(buttons, Dock.Right); bar.Children.Add(buttons); bar.Children.Add(labels);
            var button = Action(server.Label, () => { }); button.Content = server.External != null ? "Ouvrir le lecteur" : server.Resolver != null ? "Rechercher" : "Lire"; buttons.Children.Add(button);
            AutomationProperties.SetAutomationId(button, (server.External != null ? "ExternalServer" : "NativeServer") + serverNumber++);
            button.Click += async (_, _) =>
            {
                if (server.Stream != null) StartLive(channel.Name, [server.Stream]);
                else if (server.External != null) OpenExternalPlayer(channel.Name, server.External, service);
                else if (server.Resolver != null)
                {
                    button.IsEnabled = false; status.Text = "Recherche du serveur…";
                    try
                    {
                        var result = await ResolveTv(service, account, server.Resolver, cancellation); if (cancellation.IsCancellationRequested) return;
                        var resolved = DecodeServers(service, server.Label, result).ToArray();
                        foreach (var found in resolved) AddServer(found);
                        var streams = resolved.Where(item => item.Stream != null && !item.ManualOnly).Select(item => item.Stream!).ToArray();
                        if (streams.Length > 0) StartLive(channel.Name, streams);
                        else if (resolved.FirstOrDefault(item => item.External != null && !item.ManualOnly) is { External: { } page }) OpenExternalPlayer(channel.Name, page, service);
                        else status.Text = result.Warning ?? "Aucun lecteur disponible pour ce serveur.";
                    }
                    catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
                    { if (!cancellation.IsCancellationRequested) status.Text = error is NoctraApiException ? error.Message : "Délai dépassé ou serveur indisponible. Essayez un autre miroir."; }
                    finally { button.IsEnabled = true; }
                }
            };
            if (server.External != null && !server.ManualOnly)
            {
                // 0.8 : les lecteurs web entrent aussi dans la multivue (comme la PWA).
                var external = server.External;
                var webMulti = Action("Multivue +", () => SelectMultiview(channel.Name, external, service)); webMulti.Margin = new Thickness(8, 0, 0, 0);
                AutomationProperties.SetName(webMulti, "Multivue + · lecteur web");
                buttons.Children.Add(webMulti);
            }
            if (server.Stream != null)
            {
                qualityChecks.TryAdd(server.Stream.Url.AbsoluteUri, (server.Stream, status));
                checkQualities.IsEnabled = !checkingQualities;
                var multi = Action("Multivue +", () => SelectMultiview(channel.Name, server.Stream)); multi.Margin = new Thickness(8, 0, 0, 0); buttons.Children.Add(multi);
                var test = Action("Tester", () => _ = PaintServerHealth(server.Stream, status, cancellation)); test.Margin = new Thickness(8, 0, 0, 0); buttons.Children.Add(test);
                if (probes++ < 4) _ = PaintServerHealth(server.Stream, status, cancellation);
            }
            var card = new Border { Child = bar, Background = ColorOf("#0DFFFFFF"), BorderBrush = ColorOf("#17FFFFFF"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = new Thickness(20, 16, 18, 16), Margin = new Thickness(0, 0, 0, 10) };
            var area = server.Stream != null ? directArea : server.External != null ? webArea : otherArea;
            sections[area].Visibility = Visibility.Visible; area.Children.Add(card);
        }
        foreach (var pair in channel.Entries)
        {
            var entry = pair.Entry; var label = TvProviderLabel(channel, pair.Source, entry);
            if (service.Stream(entry.StreamUrl) is { } stream) AddServer(new(label + " · direct", stream));
            if (service.Link(entry.EmbedUrl) is { } embed) AddServer(new(label + " · lecteur externe", External: embed));
            if (service.Link(entry.ExternalUrl) is { } external && !external.AbsolutePath.StartsWith("/embed/", StringComparison.Ordinal))
                AddServer(new(label + " · page du fournisseur", External: external, ManualOnly: true));
            if (entry.ResolverUrl != null && service.IsApi(entry.ResolverUrl)) AddServer(new(label + " · rechercher à nouveau", Resolver: entry.ResolverUrl));
        }
        var pending = channel.Entries.Where(pair => service.IsApi(pair.Entry.ResolverUrl)).DistinctBy(pair => pair.Entry.ResolverUrl).Take(12).ToArray();
        using var gate = new SemaphoreSlim(4);
        var completed = 0; var failures = 0;
        await Task.WhenAll(pending.Select(async pair =>
        {
            await gate.WaitAsync(cancellation);
            try
            {
                var result = await ResolveTv(service, account, pair.Entry.ResolverUrl!, cancellation);
                if (!cancellation.IsCancellationRequested)
                    foreach (var server in DecodeServers(service, TvProviderLabel(channel, pair.Source, pair.Entry), result)) AddServer(server);
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException) { failures++; }
            finally { gate.Release(); completed++; if (!cancellation.IsCancellationRequested) MessageLabel(loading).Text = $"{completed}/{pending.Length} sources explorées · les lecteurs trouvés sont utilisables immédiatement"; }
        }));
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Remove(loading);
        if (failures > 0) PageContent.Children.Add(Message($"{failures} source(s) n’ont pas répondu. Vous pouvez utiliser les lecteurs affichés ou relancer une recherche."));
        if (choices.Count == 0) PageContent.Children.Add(Message("Aucun lecteur proposé par cette source."));
    });

    private readonly Dictionary<string, (DateTime Until, TvResolved Value)> tvResolutionCache = [];
    private Jellyfin? tvResolutionOwner;
    private async Task<TvResolved> ResolveTv(NoctraService service, Jellyfin account, string path, CancellationToken cancellation)
    {
        if (tvResolutionOwner != account) { tvResolutionCache.Clear(); tvResolutionOwner = account; }
        if (tvResolutionCache.TryGetValue(path, out var cached) && cached.Until > DateTime.UtcNow) return cached.Value;
        var value = await service.Read<TvResolved>(path, cancellation, timeoutSeconds: 10, retry: false);
        if (!cancellation.IsCancellationRequested && client == account)
        {
            if (tvResolutionCache.Count > 200) tvResolutionCache.Clear();
            tvResolutionCache[path] = (DateTime.UtcNow.AddMinutes(1), value);
        }
        return value;
    }

    private static IEnumerable<TvServer> DecodeServers(NoctraService service, string provider, TvResolved resolved)
    {
        foreach (var option in (resolved.Options ?? []).Concat(resolved.ServerChoices ?? []).Concat(resolved.Embeds ?? []))
        {
            var label = provider + " · " + (option.Label ?? "Serveur");
            if (service.Stream(option.StreamUrl ?? (option.PlaybackType == "stream" ? option.Url : null)) is { } stream) yield return new(label, stream, ManualOnly: option.ManualOnly);
            if (option.ResolveUrl != null && service.IsApi(option.ResolveUrl)) yield return new(label, Resolver: option.ResolveUrl, ManualOnly: option.ManualOnly);
            var raw = option.EmbedUrl ?? option.ExternalUrl ?? (option.PlaybackType is "embed" or "iframe" or "external" || option.PlaybackType == null && option.StreamUrl == null && option.ResolveUrl == null ? option.Url : null);
            if (service.Link(raw) is { } external) yield return new(label, External: external, ManualOnly: option.ManualOnly);
        }
        if (service.Link(resolved.ExternalUrl) is { } fallback) yield return new(provider + " · page du fournisseur", External: fallback, ManualOnly: true);
    }
}
