using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private ComboBox Choice(StackPanel parent, string label, string[] choices, int selected = 0)
    {
        var caption = Text(label, 13, true, "Muted"); caption.Margin = new Thickness(0, 14, 0, 6); parent.Children.Add(caption);
        var control = new ComboBox { ItemsSource = choices, SelectedIndex = choices.Length == 0 ? -1 : Math.Clamp(selected, 0, choices.Length - 1),
            MinWidth = 260, MaxWidth = 560, MinHeight = 42, HorizontalAlignment = HorizontalAlignment.Left };
        AutomationProperties.SetName(control, label); parent.Children.Add(control); return control;
    }

    private Page RequestPage(DiscoverItem item) => new("Demander un titre", ButtonTab.Discover, async (account, cancellation) =>
    {
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot);
        var data = await service.Json($"api/jellyseerr/destinations?mediaType={item.MediaType}&mediaId={item.Id}", cancellation);
        var session = await service.Json("api/session", cancellation);
        if (cancellation.IsCancellationRequested) return;
        var admin = session.Flag("isAdmin");
        PageContent.Children.Clear(); PageContent.Children.Add(Heading("Demander un titre", "Choisissez la qualité souhaitée, puis confirmez votre demande."));
        var layout = new Grid { MaxWidth = 1000, HorizontalAlignment = HorizontalAlignment.Left };
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(180) }); layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var poster = new Image { Width = 155, Height = 232, Stretch = System.Windows.Media.Stretch.Uniform, VerticalAlignment = VerticalAlignment.Top };
        TmdbImage(service, poster, item.PosterPath, false, cancellation); layout.Children.Add(poster);
        var form = new StackPanel { MinWidth = 320, MaxWidth = 740 }; Grid.SetColumn(form, 1); layout.Children.Add(form); PageContent.Children.Add(layout);
        var title = Text(item.Label, 30, true); title.TextWrapping = TextWrapping.Wrap; form.Children.Add(title);
        var date = item.ReleaseDate ?? item.FirstAirDate;
        form.Children.Add(Text((item.MediaType == "tv" ? "Série" : "Film") + (date?.Length >= 4 ? " · " + date[..4] : ""), 13, color: "Muted"));
        if (!string.IsNullOrWhiteSpace(item.Overview)) { var synopsis = Text(item.Overview, 14, color: "Muted"); synopsis.TextWrapping = TextWrapping.Wrap; synopsis.MaxHeight = 100; synopsis.TextTrimming = TextTrimming.CharacterEllipsis; synopsis.Margin = new Thickness(0, 14, 0, 6); form.Children.Add(synopsis); }
        var all = data.List("servers");
        if (all.Length == 0) { form.Children.Add(Message("Aucune destination utilisable n’est configurée sur le serveur.")); return; }
        var policy = data.Field("requestPolicy");
        var forceAuto = policy.Flag("forceAutomatic");
        form.Children.Add(Message(admin ? forceAuto ? policy.Str("reason") : "La qualité et le rangement sont vérifiés par votre serveur." : "Cette demande reste associée à votre compte et suit ses règles d’approbation. Le rangement est automatique."));
        var advanced = new StackPanel();
        var mode = Choice(advanced, "Après validation", ["Recherche automatique", "Choisir une version manuellement"]); mode.IsEnabled = admin && !forceAuto;
        var servers = Choice(form, "Destination", []); var profiles = Choice(form, "Qualité souhaitée", []);
        AutomationProperties.SetAutomationId(servers, "RequestDestination"); AutomationProperties.SetAutomationId(profiles, "RequestQuality");
        var folders = Choice(advanced, "Dossier de destination", []);
        var advancedBox = new Expander { Header = "Options avancées", Content = advanced, Foreground = BrushFor("Ink"), Margin = new Thickness(0, 18, 0, 0), Visibility = admin ? Visibility.Visible : Visibility.Collapsed };
        form.Children.Add(advancedBox);
        var note = Text(item.MediaType == "tv" ? "La demande porte sur la série. Les épisodes manquants et à venir suivent les règles du serveur." : "Le serveur choisira une version compatible avec la qualité sélectionnée.", 13, color: "Muted");
        note.TextWrapping = TextWrapping.Wrap; note.Margin = new Thickness(0, 18, 0, 0); form.Children.Add(note);
        var result = Text("", 13, color: "Muted"); result.TextWrapping = TextWrapping.Wrap; result.Margin = new Thickness(0, 15, 0, 0); form.Children.Add(result);
        var buttons = new WrapPanel { Margin = new Thickness(0, 20, 0, 0) }; form.Children.Add(buttons);
        var send = Action(admin ? "Confirmer l’ajout" : "Envoyer la demande", () => { }, "Primary"); AutomationProperties.SetAutomationId(send, "RequestSubmit"); buttons.Children.Add(send);
        var cancel = Action("Annuler", () => _ = Navigate(DiscoverDetail(item), back: true)); cancel.Margin = new Thickness(9, 0, 0, 0); buttons.Children.Add(cancel);
        JsonElement[] available = [], qualities = [], roots = [];
        JsonElement SelectedServer() => servers.SelectedIndex >= 0 && servers.SelectedIndex < available.Length ? available[servers.SelectedIndex] : default;
        void UpdateServer()
        {
            var server = SelectedServer(); qualities = server.List("profiles"); roots = server.List("rootFolders");
            profiles.ItemsSource = qualities.Select(value => value.Str("name")).ToArray();
            profiles.SelectedIndex = qualities.Length == 0 ? -1 : Math.Max(0, Array.FindIndex(qualities, value => value.Num("id") == server.Num("defaultProfileId")));
            folders.ItemsSource = roots.Length == 0 ? new[] { "Rangement automatique" } : roots.Select(value => value.Str("path")).ToArray();
            var root = data.Field("suggested").Str("rootFolder"); if (root.Length == 0) root = server.Str("defaultRootFolder");
            folders.SelectedIndex = Math.Max(0, Array.FindIndex(roots, value => value.Str("path") == root)); folders.IsEnabled = roots.Length > 0;
            send.IsEnabled = available.Length > 0 && profiles.SelectedIndex >= 0;
            result.Text = send.IsEnabled ? "" : "Aucune qualité utilisable pour cette destination.";
        }
        void UpdateMode()
        {
            available = all.Where(server => server.Flag("preventSearch") == (admin && mode.SelectedIndex == 1)).ToArray();
            servers.ItemsSource = available.Select(server => server.Str("name") + (server.Flag("is4k") ? " · 4K" : "")).ToArray();
            servers.SelectedIndex = available.Length == 0 ? -1 : Math.Max(0, Array.FindIndex(available, server => server.Flag("isDefault")));
            UpdateServer();
        }
        mode.SelectionChanged += (_, _) => UpdateMode(); servers.SelectionChanged += (_, _) => UpdateServer(); UpdateMode();
        send.Click += async (_, _) =>
        {
            if (servers.SelectedIndex < 0 || profiles.SelectedIndex < 0 || profiles.SelectedIndex >= qualities.Length) return;
            send.IsEnabled = false; cancel.IsEnabled = false; result.Text = "Envoi de votre demande…";
            try
            {
                var body = new Dictionary<string, object?> { ["mediaId"] = item.Id, ["mediaType"] = item.MediaType, ["title"] = item.Label,
                    ["year"] = date?.Length >= 4 ? date[..4] : null, ["selectionMode"] = admin && mode.SelectedIndex == 1 ? "manual" : "auto",
                    ["serverId"] = SelectedServer().Num("id"), ["profileId"] = qualities[profiles.SelectedIndex].Num("id") };
                // The default folder also travels with a standard user's request, without exposing filesystem paths in the form.
                if (folders.SelectedIndex >= 0 && folders.SelectedIndex < roots.Length) body["rootFolder"] = roots[folders.SelectedIndex].Str("path");
                await service.Submit("api/jellyseerr/request", body, cancellation);
                if (cancellation.IsCancellationRequested) return;
                result.Text = "Demande envoyée. Vous pouvez suivre son avancement dans Mes demandes.";
                send.Visibility = Visibility.Collapsed; cancel.Visibility = Visibility.Collapsed;
                buttons.Children.Add(Action(admin && mode.SelectedIndex == 1 ? "Choisir la version" : "Suivre ma demande", () => _ = Navigate(admin && mode.SelectedIndex == 1 ? DiscoveryReleasesPage(item) : RequestsPage, back: true), "Primary"));
            }
            catch (Exception error) when (error is System.Net.Http.HttpRequestException or InvalidOperationException or OperationCanceledException)
            { if (!cancellation.IsCancellationRequested) { result.Text = error is NoctraApiException ? error.Message : "La demande n’a pas pu être envoyée. Vous pouvez réessayer."; send.IsEnabled = true; cancel.IsEnabled = true; } }
        };
    });

    private Page RequestsPage => new("Mes demandes", ButtonTab.Discover, async (account, cancellation) =>
    {
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot);
        var data = await service.Json("api/jellyseerr/requests", cancellation);
        var session = await service.Json("api/session", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear(); PageContent.Children.Add(Heading("Mes demandes", "Le suivi de vos prochaines séances."));
        var quota = data.Field("quota");
        if (quota.Flag("enforced")) PageContent.Children.Add(Message($"{quota.Num("pending"):0} demandes en attente · limite {quota.Num("limit"):0}"));
        var filters = new StackPanel(); var state = Choice(filters, "Afficher", ["Toutes les demandes", "En attente", "Approuvées", "Refusées"]); filters.Margin = new Thickness(0, 0, 0, 20); PageContent.Children.Add(filters);
        var listing = new StackPanel(); PageContent.Children.Add(listing);
        void Draw()
        {
            listing.Children.Clear();
            foreach (var request in data.List("results").Where(item => state.SelectedIndex == 0 || item.Num("status") == state.SelectedIndex))
            {
                var id = (int)request.Num("id"); var status = request.Num("status") switch { 1 => "En attente", 2 => "Approuvée", 3 => "Refusée", _ => "En cours" };
                var title = request.Str("displayTitle"); if (title.Length == 0) title = request.Str("title");
                var actions = new List<Button>();
                if (session.Flag("isAdmin") && request.Num("status") == 1)
                {
                    actions.Add(ApiAction("Approuver", service, $"api/jellyseerr/request/{id}/approve", "POST", () => new { }, cancellation, () => _ = Navigate(RequestsPage, back: true), "Approuver « " + title + " » ?"));
                    actions.Add(ApiAction("Refuser", service, $"api/jellyseerr/request/{id}/decline", "POST", () => new { }, cancellation, () => _ = Navigate(RequestsPage, back: true), "Refuser cette demande ?"));
                }
                if (session.Flag("isAdmin") || request.Num("status") == 1)
                    actions.Add(ApiAction("Annuler", service, $"api/jellyseerr/request/{id}", "DELETE", null, cancellation, () => _ = Navigate(RequestsPage, back: true), "Supprimer cette demande ?"));
                var tmdb = (int)request.Field("media").Num("tmdbId");
                if (tmdb > 0) actions.Add(Action("Voir le titre", () => _ = Navigate(DiscoverDetail(new DiscoverItem(tmdb, request.Str("mediaType") == "tv" ? "tv" : "movie", title, null, request.Str("overview"), request.Str("posterPath"), request.Str("releaseDate"), null, null)))));
                var row = new Grid { Margin = new Thickness(0, 0, 0, 12) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(82) }); row.ColumnDefinitions.Add(new ColumnDefinition());
                var poster = new Image { Width = 62, Height = 92, Stretch = System.Windows.Media.Stretch.Uniform, VerticalAlignment = VerticalAlignment.Top };
                TmdbImage(service, poster, request.Str("posterPath"), false, cancellation); row.Children.Add(poster);
                var content = Row(title + " · " + status, (request.Str("mediaType") == "tv" ? "Série" : "Film") + " · " +
                    (DateTime.TryParse(request.Str("createdAt"), out var date) ? date.ToString("dd/MM/yyyy") : "Demande enregistrée"), actions.ToArray());
                Grid.SetColumn(content, 1); row.Children.Add(content); listing.Children.Add(row);
            }
            if (listing.Children.Count == 0) listing.Children.Add(Message("Aucune demande dans cette sélection."));
        }
        state.SelectionChanged += (_, _) => Draw(); Draw();
        PageContent.Children.Add(Action("Actualiser les demandes", () => _ = Navigate(RequestsPage, back: true)));
    });
}
