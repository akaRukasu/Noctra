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
    private sealed record TvServer(string Label, LiveStream? Stream = null, string? Resolver = null, Uri? External = null, bool ManualOnly = false, bool BowdAd = false);
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
        var scope = selected == null ? sources.Where(source => source.Section != "portals").ToArray() : new[] { selected }; var catalogs = new TvCatalog?[scope.Length];
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
        TvChannel[] channels = []; string[] channelKeys = [];
        (TvGroup Category, TvSource Source)[] groups = [];
        var loadingCatalogs = true;
        var renderedSignature = "";
        void RenderChannels(bool force = false)
        {
            if (cancellation.IsCancellationRequested) return;
            var needle = ChannelKey(filter.Text.Trim());
            var matches = Enumerable.Range(0, channels.Length).Where(index => needle.Length == 0 || channelKeys[index].Contains(needle, StringComparison.OrdinalIgnoreCase))
                .Select(index => channels[index]).ToArray();
            offset = Math.Max(0, Math.Min(offset, (matches.Length - 1) / 60 * 60));
            var page = matches.Skip(offset).Take(60).ToArray();
            var empty = matches.Length == 0 && !loadingCatalogs && (selected == null && group == null || !catalogs.Any(catalog => catalog?.Groups?.Length > 0));
            // 0.8 : les cartes ne sont refaites que si la page affichée change (avant : à chaque catalogue reçu).
            var signature = string.Join("\n", page.Select(channel => channel.Name + "|" + IsTvFavorite(channel.Name) + "|" + string.Join(",", channel.Entries.Select(pair =>
                pair.Source.Id + " " + pair.Entry.StreamUrl + " " + pair.Entry.ResolverUrl + " " + pair.Entry.EmbedUrl + " " + pair.Entry.ExternalUrl + " " + pair.Entry.Logo)))) +
                "#" + offset + "#" + matches.Length + "#" + empty;
            if (!force && signature == renderedSignature) return;
            renderedSignature = signature; listing.Children.Clear();
            var grid = new AdaptiveTilePanel { MinimumCellWidth = sports ? 250 : 170, MaximumColumns = 10, Margin = new Thickness(-5, 0, -5, 0) };
            foreach (var channel in page)
            {
                var card = TvCard(service, channel, cancellation, sports); card.Width = double.NaN; grid.Children.Add(card);
            }
            listing.Children.Add(grid);
            if (empty) listing.Children.Add(Message(sports ? "Aucun événement publié pour cette sélection." : "Aucune chaîne disponible pour cette sélection."));
            var pages = new StackPanel { Orientation = Orientation.Horizontal };
            if (offset > 0) pages.Children.Add(Action("Précédent", () => { offset -= 60; RenderChannels(); title.BringIntoView(); }));
            if (offset + 60 < matches.Length) pages.Children.Add(Action("Suivant", () => { offset += 60; RenderChannels(); title.BringIntoView(); }));
            listing.Children.Add(pages);
        }
        // 0.8 : la liste réunie (des milliers d'entrées, jusqu'à 120 bouquets) est calculée hors du fil de l'interface,
        // au plus une fois toutes les 1,2 s pendant le chargement ; avant, chaque catalogue reçu la recalculait sur l'interface.
        var updateRunning = false; var updatePending = false; var lastUpdate = DateTime.MinValue;
        var updateTimer = new System.Windows.Threading.DispatcherTimer();
        updateTimer.Tick += (_, _) => { updateTimer.Stop(); _ = UpdateCatalogsNow(); };
        void UpdateCatalogs()
        {
            if (cancellation.IsCancellationRequested) return;
            if (updateRunning) { updatePending = true; return; }
            var wait = TimeSpan.FromMilliseconds(1200) - (DateTime.UtcNow - lastUpdate);
            if (!loadingCatalogs || wait <= TimeSpan.Zero) { updateTimer.Stop(); _ = UpdateCatalogsNow(); }
            else if (!updateTimer.IsEnabled) { updateTimer.Interval = wait; updateTimer.Start(); }
        }
        async Task UpdateCatalogsNow()
        {
            if (cancellation.IsCancellationRequested) return;
            updateRunning = true; lastUpdate = DateTime.UtcNow;
            try
            {
                var parts = catalogs.Select((catalog, index) => (Source: scope[index], Catalog: catalog)).ToArray();
                var children = childCatalogs.ToArray();
                var favorites = (preferences.TvFavorites ?? []).ToHashSet();
                var country = activeCountry;
                var aggregated = selected == null && group == null;
                var result = await Task.Run(() =>
                {
                    var allGroups = parts.SelectMany(part => (part.Catalog?.Groups ?? []).Select(category => (Category: category, part.Source)))
                        .Where(pair => !string.IsNullOrWhiteSpace(pair.Category.Ref)).DistinctBy(pair => pair.Category.Ref).ToArray();
                    TvChannel[] grouped; TvCountryChoice[] options = [];
                    if (sports)
                    {
                        var events = parts.SelectMany(part => (part.Catalog?.Channels ?? []).Select(entry => (part.Source, Entry: entry)))
                            .Concat(children.SelectMany(part => (part.Catalog.Channels ?? []).Select(entry => (part.Source, Entry: entry))))
                            .Where(pair => !string.IsNullOrWhiteSpace(pair.Entry.Name) && SportsEntry(pair.Source, pair.Entry))
                            .DistinctBy(pair => (pair.Source.Id, pair.Entry.Name, pair.Entry.StreamUrl, pair.Entry.ResolverUrl, pair.Entry.EmbedUrl, pair.Entry.ExternalUrl));
                        grouped = TvIdentity.Group(events, true).OrderBy(channel => favorites.Contains(ChannelKey(channel.Name)) ? 0 : 1)
                            .ThenBy(channel => channel.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
                    }
                    else
                    {
                        // 0.8 : chaînes réunies par les règles du serveur (Web et PWA, noctra-tv-unified.js 200.0.181) :
                        // une carte par chaîne, pays, numéros TNT et déclinaisons BowdTV comme sur le Web.
                        string BouquetCountry(string? name) => TvUnified.GroupCountry(new TvGroup(name, null, null));
                        var loaded = parts.Where(part => part.Catalog != null).Select(part => (part.Source, Channels: part.Catalog!.Channels ?? []))
                            .Concat(children.Select(part => (part.Source, Channels: (part.Catalog.Channels ?? []).Select(entry =>
                                // Bouquet d'un autre pays : une chaîne sans pays ni catégorie prend le pays du bouquet.
                                string.IsNullOrWhiteSpace(entry.Group) && string.IsNullOrWhiteSpace(entry.Country) && BouquetCountry(part.Bouquet) is { Length: > 0 } code && code != "fr"
                                    ? entry with { Group = part.Bouquet } : entry).ToArray())))
                            .Select(part => (part.Source, part.Channels.Where(entry => !entry.IsEvent).ToArray()));
                        var cards = TvUnified.Merge(loaded);
                        static string CodeOf(TvUnifiedChannel card) => TvUnified.IsFrench(card) ? "fr" : card.Country.Length > 0 ? card.Country : "zz";
                        var codes = cards.Select(CodeOf).Concat(allGroups.Select(pair => BouquetCountry(pair.Category.Name) is { Length: > 0 } code ? code : "zz"))
                            .Append(country).Append("fr").Distinct().Where(code => code != "*").OrderBy(code => code == "fr" ? 0 : code == "zz" ? 2 : 1).ThenBy(TvCountry.Label);
                        options = new[] { new TvCountryChoice("*", TvCountry.Label("*")) }.Concat(codes.Select(code => new TvCountryChoice(code, TvCountry.Label(code)))).ToArray();
                        grouped = cards.Where(card => country == "*" || CodeOf(card) == country)
                            .OrderBy(card => favorites.Contains(ChannelKey(card.Name)) ? 0 : 1)
                            .Select(card => new TvChannel(card.Name, card.Entries, card.Variants)).ToArray();
                    }
                    // Comme la PWA : dans « Toutes les chaînes », les bouquets sont ouverts et leurs chaînes mêlées à la liste
                    // (filtrée par pays) ; la grille des bouquets reste réservée à la page d'une source.
                    var shown = aggregated ? [] : allGroups.Where(pair => sports || country == "*" || TvUnified.GroupCountry(pair.Category) is var code && (code.Length == 0 || code == country)).ToArray();
                    // Recherche : par le nom de la carte et par les noms d'origine dans chaque source (comme le Web).
                    var keys = grouped.Select(channel => string.Join("|", channel.Entries.Select(pair => pair.Entry.Name ?? "").Prepend(channel.Name).Distinct().Take(13).Select(ChannelKey))).ToArray();
                    return (Channels: grouped, Keys: keys, Groups: shown, Options: options);
                }, cancellation);
                if (cancellation.IsCancellationRequested) return;
                if (!sports)
                {
                    var signature = string.Join("|", result.Options.Select(option => option.Code));
                    if (signature != countrySignature && !countryBox.IsDropDownOpen)
                    {
                        updatingCountries = true;
                        countryBox.ItemsSource = result.Options; countryBox.SelectedValue = activeCountry; countrySignature = signature;
                        updatingCountries = false;
                    }
                }
                channels = result.Channels; channelKeys = result.Keys;
                var groupSignature = string.Join("\n", result.Groups.Select(pair => pair.Category.Ref));
                if (groupSignature != string.Join("\n", groups.Select(pair => pair.Category.Ref)) || bouquets.Children.Count == 0 && result.Groups.Length > 0)
                {
                    groups = result.Groups; bouquets.Children.Clear();
                    if (groups.Length > 0)
                    {
                        var heading = Text("Choisir un bouquet", 20, true); heading.Margin = new Thickness(0, 10, 0, 12); bouquets.Children.Add(heading);
                        var groupGrid = new AdaptiveTilePanel { MinimumCellWidth = 210, MaximumColumns = 5 };
                        foreach (var pair in groups)
                        {
                            var label = pair.Category.Name ?? pair.Category.Title ?? "Bouquet";
                            var groupCountry = TvUnified.GroupCountry(pair.Category);
                            var button = Action(label, () => _ = Navigate(TvPage(pair.Source.Id, sports, pair.Category.Ref, groupCountry.Length == 0 ? activeCountry : groupCountry)));
                            button.HorizontalContentAlignment = HorizontalAlignment.Left; button.Margin = new Thickness(0, 0, 10, 10);
                            button.ToolTip = pair.Source.Name + " · " + label; groupGrid.Children.Add(button);
                        }
                        bouquets.Children.Add(groupGrid);
                    }
                }
                var failed = errors.Count(error => error != null) + childErrors;
                count.Text = (channels.Length > 0 || groups.Length == 0 ? $"{channels.Length} " + (sports ? "événements" : "chaînes") : $"{groups.Length} bouquets · choisissez une catégorie") +
                    (failed > 0 ? $" · {failed} source(s) indisponible(s)" : "");
                waiting.Text = loadingCatalogs ? "Les autres sources arrivent… Vous pouvez déjà choisir une chaîne." :
                    string.Join(" · ", catalogs.Select(catalog => catalog?.Warning).Where(warning => !string.IsNullOrWhiteSpace(warning)).Distinct().Take(2));
                waiting.Visibility = waiting.Text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
                var showErrors = !loadingCatalogs && channels.Length == 0;
                RenderChannels(force: showErrors);
                if (showErrors)
                    foreach (var index in Enumerable.Range(0, scope.Length).Where(index => errors[index] != null).Take(3)) listing.Children.Add(Message(scope[index].Name + " · " + errors[index]));
            }
            catch (OperationCanceledException) { }
            finally
            {
                updateRunning = false; lastUpdate = DateTime.UtcNow;
                if (updatePending && !cancellation.IsCancellationRequested) { updatePending = false; UpdateCatalogs(); }
            }
        }
        // Recherche : appliquée 250 ms après la dernière frappe.
        var filterTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        filterTimer.Tick += (_, _) => { filterTimer.Stop(); offset = 0; RenderChannels(); };
        filter.TextChanged += (_, _) => { filterTimer.Stop(); filterTimer.Start(); }; UpdateCatalogs();
        countryBox.SelectionChanged += (_, _) =>
        {
            if (!updatingCountries && countryBox.SelectedItem is TvCountryChoice choice && choice.Code != activeCountry)
                _ = Navigate(TvPage(sourceId, sports, group, choice.Code), back: true);
        };
        countryBox.DropDownClosed += (_, _) => UpdateCatalogs();
        cancellation.Register(() => Dispatcher.BeginInvoke(() => { updateTimer.Stop(); filterTimer.Stop(); }));
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
                // Comme la PWA (tvUnifiedGroupOrder) : bouquets français ou sans pays, français d'abord ; BowdTV publie déjà la France
                // à la racine. Un autre pays choisi charge aussi ses bouquets.
                .Where(job => sports || activeCountry == "*" || !(job.Source.Id == "bowdtv-guide" && activeCountry == "fr") &&
                    TvUnified.GroupCountry(job.Group) is var code && (code.Length == 0 || code == activeCountry))
                .OrderBy(job => TvUnified.FrenchGroupName(job.Group) ? 0 : 1).Take(120).ToArray();
            await Parallel.ForEachAsync(jobs, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = cancellation }, async (job, ct) =>
            {
                try
                {
                    var path = "api/tv/catalog?ref=" + Uri.EscapeDataString(job.Group.Ref!);
                    TvCatalog? value = null;
                    await Dispatcher.InvokeAsync(() => { if (tvCatalogCache.TryGetValue(path, out var saved) && saved.Until > DateTime.UtcNow) value = saved.Value; });
                    // Comme la PWA : un bouquet en échec est redemandé une fois.
                    for (var attempt = 0; value == null; attempt++)
                    {
                        try { value = await service.Read<TvCatalog>(path, ct, timeoutSeconds: 12, retry: false); }
                        catch (Exception error) when (attempt == 0 && !ct.IsCancellationRequested && error is HttpRequestException or JsonException or OperationCanceledException)
                        { await Task.Delay(800, ct); }
                    }
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
        var play = Action("▶   Lire le direct", () =>
        {
            var streams = choices.Where(item => item.Stream != null && !item.ManualOnly)
                .Select(item => item.Stream!).DistinctBy(stream => stream.Url.AbsoluteUri).OrderByDescending(IsHealthy).ThenByDescending(VerifiedHeight).ToArray();
            if (streams.Length > 0) StartLive(channel.Name, streams);
            // BowdTV : le direct HLS n'est donné qu'après sa publicité (comme la PWA).
            else if (choices.FirstOrDefault(item => item.BowdAd) is { Resolver: { } bowd }) _ = PlayBowd(service, channel.Name, bowd, cancellation);
        }, "Primary");
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
            choices.Add(server); play.IsEnabled = choices.Any(item => item.Stream != null && !item.ManualOnly || item.BowdAd);
            var status = Text(server.BowdAd ? "Direct HLS après une courte publicité BowdTV, comme sur la PWA" : server.Stream != null ? "Prêt à lire · test disponible" :
                server.External != null ? "Lecture web protégée" : "Recherche disponible sans attendre les autres serveurs", 12, color: "Muted");
            var title = Text(server.Label, 15, true); title.TextTrimming = TextTrimming.CharacterEllipsis;
            var labels = new StackPanel { Margin = new Thickness(0, 0, 20, 0) }; labels.Children.Add(title); status.Margin = new Thickness(0, 6, 0, 0); labels.Children.Add(status);
            var bar = new DockPanel(); var buttons = new StackPanel { Orientation = Orientation.Horizontal }; DockPanel.SetDock(buttons, Dock.Right); bar.Children.Add(buttons); bar.Children.Add(labels);
            var button = Action(server.Label, () => { }); button.Content = server.External != null ? "Ouvrir le lecteur" : server.BowdAd ? "Lire" : server.Resolver != null ? "Rechercher" : "Lire"; buttons.Children.Add(button);
            AutomationProperties.SetAutomationId(button, (server.External != null ? "ExternalServer" : "NativeServer") + serverNumber++);
            button.Click += async (_, _) =>
            {
                if (server.Stream != null) StartLive(channel.Name, [server.Stream]);
                else if (server.BowdAd && server.Resolver != null) await PlayBowd(service, channel.Name, server.Resolver, cancellation, status);
                else if (server.External != null) OpenExternalPlayer(channel.Name, server.External, service);
                else if (server.Resolver != null)
                {
                    button.IsEnabled = false; status.Text = "Recherche du serveur…";
                    try
                    {
                        var result = await ResolveTv(service, account, server.Resolver, cancellation); if (cancellation.IsCancellationRequested) return;
                        var resolved = DecodeServers(service, server.Label, result, server.Resolver).ToArray();
                        foreach (var found in resolved) AddServer(found);
                        var streams = resolved.Where(item => item.Stream != null && !item.ManualOnly).Select(item => item.Stream!).ToArray();
                        if (streams.Length > 0) StartLive(channel.Name, streams);
                        else if (resolved.FirstOrDefault(item => item.BowdAd) is { Resolver: { } bowd }) await PlayBowd(service, channel.Name, bowd, cancellation, status);
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
            // Déclinaison BowdTV (Caraïbes, Réunion, différé…) : serveur manuel sous la chaîne principale, comme sur le Web.
            var manual = channel.Variants?.ContainsKey(entry) == true;
            if (service.Stream(entry.StreamUrl) is { } stream) AddServer(new(label + " · direct", stream, ManualOnly: manual));
            if (service.Link(entry.EmbedUrl) is { } embed) AddServer(new(label + " · lecteur externe", External: embed, ManualOnly: manual));
            if (service.Link(entry.ExternalUrl) is { } external && !external.AbsolutePath.StartsWith("/embed/", StringComparison.Ordinal))
                AddServer(new(label + " · page du fournisseur", External: external, ManualOnly: true));
            if (entry.ResolverUrl != null && service.IsApi(entry.ResolverUrl)) AddServer(new(label + " · rechercher à nouveau", Resolver: entry.ResolverUrl));
        }
        var pending = channel.Entries.Where(pair => service.IsApi(pair.Entry.ResolverUrl) && channel.Variants?.ContainsKey(pair.Entry) != true).DistinctBy(pair => pair.Entry.ResolverUrl).Take(12).ToArray();
        using var gate = new SemaphoreSlim(4);
        var completed = 0; var failures = 0;
        await Task.WhenAll(pending.Select(async pair =>
        {
            await gate.WaitAsync(cancellation);
            try
            {
                var result = await ResolveTv(service, account, pair.Entry.ResolverUrl!, cancellation);
                if (!cancellation.IsCancellationRequested)
                    foreach (var server in DecodeServers(service, TvProviderLabel(channel, pair.Source, pair.Entry), result, pair.Entry.ResolverUrl)) AddServer(server);
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
        TvResolved value;
        try { value = await service.Read<TvResolved>(path, cancellation, timeoutSeconds: 10, retry: false); }
        catch (HttpRequestException error) when (error.StatusCode == null && !cancellation.IsCancellationRequested)
        {
            // Connexion perdue avant toute réponse : un nouvel essai (un serveur qui répond une erreur n'est pas réinterrogé).
            await Task.Delay(500, cancellation);
            value = await service.Read<TvResolved>(path, cancellation, timeoutSeconds: 10, retry: false);
        }
        // Une publicité BowdTV n'est valable que deux minutes : jamais gardée en cache.
        if (!cancellation.IsCancellationRequested && client == account && value.BowdAd == null)
        {
            if (tvResolutionCache.Count > 200) tvResolutionCache.Clear();
            tvResolutionCache[path] = (DateTime.UtcNow.AddMinutes(1), value);
        }
        return value;
    }

    // BowdTV : nouvelle demande au serveur (la publicité expire vite), publicité puis direct dans le lecteur.
    private async Task PlayBowd(NoctraService service, string name, string resolver, CancellationToken cancellation, TextBlock? status = null)
    {
        if (status != null) status.Text = "Demande du direct BowdTV…";
        try
        {
            var result = await service.Read<TvResolved>(resolver, cancellation, timeoutSeconds: 30, retry: false);
            if (cancellation.IsCancellationRequested) return;
            if (result.BowdAd is { VideoUrl: { } video, ActionUrl: { } action } ad && service.Stream(video) is { } adStream && service.IsApi(action))
            {
                if (status != null) status.Text = "Publicité BowdTV, puis le direct";
                StartBowdPreroll(name, service, adStream, action, ad.SkipAfter);
                return;
            }
            var servers = DecodeServers(service, "BowdTV", result).ToArray();
            var streams = servers.Where(item => item.Stream != null && !item.ManualOnly).Select(item => item.Stream!).ToArray();
            if (streams.Length > 0) StartLive(name, streams);
            else if (status != null) status.Text = result.Message ?? result.Warning ?? "BowdTV n’a fourni aucun direct. Utilisez le lecteur officiel.";
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
        {
            if (status != null && !cancellation.IsCancellationRequested) status.Text = error is NoctraApiException ? error.Message : "BowdTV ne répond pas. Réessayez ou utilisez le lecteur officiel.";
        }
    }

    private static IEnumerable<TvServer> DecodeServers(NoctraService service, string provider, TvResolved resolved, string? resolver = null)
    {
        // BowdTV : le flux HLS vient après une courte publicité, lue dans le lecteur Noctra (comme la PWA).
        if (resolved.BowdAd != null && resolver != null && service.IsApi(resolver)) yield return new(provider + " · direct HLS après publicité", Resolver: resolver, BowdAd: true);
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
