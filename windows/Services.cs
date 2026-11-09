using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Page SessionsPage => new("Sessions", ButtonTab.None, async (account, cancellation) =>
    {
        var sessions = await account.ReadJson("Sessions?UserId=" + Uri.EscapeDataString(account.User.Id), cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Vos appareils", "Lecture et télécommande Jellyfin"));
        var owned = sessions.List().Where(session => session.Str("UserId") == account.User.Id).ToArray();
        foreach (var session in owned)
        {
            var id = session.Str("Id");
            if (!PlayRequest.Identifier(id)) continue;
            var title = session.Str("DeviceName") + " · " + session.Str("Client");
            var playing = session.Field("NowPlayingItem");
            var name = playing.Str("Name");
            var actions = new System.Collections.Generic.List<Button>();
            foreach (var (command, label) in new[] { ("PlayPause", "Pause / Reprendre"), ("Stop", "Arrêter") })
            {
                if (playing.ValueKind == System.Text.Json.JsonValueKind.Undefined) break;
                var button = Action(label, async () =>
                {
                    try
                    {
                        await account.Command("Sessions/" + id + "/Playing/" + command, null, cancellation);
                        if (!cancellation.IsCancellationRequested) ShowStatus("Commande envoyée à l’appareil.");
                    }
                    catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException)
                    { if (!cancellation.IsCancellationRequested) ShowStatus("L’appareil n’a pas accepté la commande."); }
                });
                actions.Add(button);
            }
            PageContent.Children.Add(Row(title, name.Length > 0 ? name : "Aucune lecture en cours", actions.ToArray()));
        }
        if (owned.Length == 0) PageContent.Children.Add(Message("Aucun appareil connecté."));
        var refresh = Action("Actualiser", () => _ = Navigate(SessionsPage, back: true));
        refresh.HorizontalAlignment = HorizontalAlignment.Left;
        PageContent.Children.Add(refresh);
    });

    private Page TvSettingsPage => new("Sources et accès TV", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var data = await service.Read<TvSources>("api/tv/sources", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Sources et accès TV", "Catalogues, playlists et accès aux fournisseurs"));
        foreach (var source in data.Sources ?? [])
        {
            var remove = ApiAction("Retirer", service, "api/tv/sources/" + Uri.EscapeDataString(source.Id), "DELETE", null,
                cancellation, () => _ = Navigate(TvSettingsPage, back: true), "Retirer la source « " + source.Name + " » ?");
            PageContent.Children.Add(Row(source.Name, source.Type ?? "Source TV", remove));
        }
        var form = new StackPanel { Margin = new Thickness(0, 15, 0, 0) };
        form.Children.Add(Text("Ajouter une source", 22, true));
        var name = Input(form, "Nom de la source");
        var url = Input(form, "Adresse du catalogue ou de la playlist");
        var epg = Input(form, "Adresse du guide TV · facultatif");
        var add = ApiAction("Ajouter la source", service, "api/tv/sources", "POST",
            () => new { name = name.Text.Trim(), url = url.Text.Trim(), type = "auto", epgUrl = epg.Text.Trim() }, cancellation,
            () => _ = Navigate(TvSettingsPage, back: true));
        add.HorizontalAlignment = HorizontalAlignment.Left;
        add.Margin = new Thickness(0, 14, 0, 28);
        form.Children.Add(add);
        form.Children.Add(Text("LiveWatch", 22, true));
        var email = Input(form, "Adresse e-mail LiveWatch");
        form.Children.Add(Text("Mot de passe LiveWatch", 13, true, "Muted"));
        var password = new PasswordBox { MinWidth = 220, MaxWidth = 560, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 5, 0, 10) };
        form.Children.Add(password);
        var login = ApiAction("Connecter LiveWatch", service, "api/tv/livewatch/session", "POST",
            () => new { email = email.Text.Trim(), password = password.Password }, cancellation, password.Clear);
        login.HorizontalAlignment = HorizontalAlignment.Left;
        form.Children.Add(login);
        var disconnect = ApiAction("Déconnecter LiveWatch", service, "api/tv/livewatch/session", "DELETE", null, cancellation,
            confirmation: "Déconnecter l’accès LiveWatch du serveur ?");
        disconnect.HorizontalAlignment = HorizontalAlignment.Left;
        disconnect.Margin = new Thickness(0, 8, 0, 22);
        form.Children.Add(disconnect);
        form.Children.Add(Text("Clés des fournisseurs", 22, true));
        var provider = Input(form, "Identifiant du fournisseur");
        form.Children.Add(Text("Clé d’accès", 13, true, "Muted"));
        var key = new PasswordBox { MinWidth = 220, MaxWidth = 560, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 5, 0, 10) };
        form.Children.Add(key);
        var save = ApiAction("Enregistrer l’accès", service, "api/tv/provider-keys", "POST",
            () => new { provider = provider.Text.Trim(), key = key.Password }, cancellation, key.Clear);
        save.HorizontalAlignment = HorizontalAlignment.Left;
        form.Children.Add(save);
        PageContent.Children.Add(form);
    });

    private Page AutomationPage(string type, string view = "library", int number = 1, string query = "") =>
        new(type == "sonarr" ? "Séries · Sonarr" : "Films · Radarr", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var path = $"api/servarr/center?type={type}&view={view}&page={number}&pageSize=30&q={Uri.EscapeDataString(query)}";
        var data = await service.Json(path, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(type == "sonarr" ? "Séries et épisodes" : "Films", "Centre d’automatisation"));
        var tabs = new WrapPanel { Margin = new Thickness(0, 0, 0, 12) };
        foreach (var (key, label) in new[] { ("radarr", "Radarr"), ("sonarr", "Sonarr") })
        {
            var button = Action(label, () => _ = Navigate(AutomationPage(key), back: true), key == type ? "Primary" : "Action");
            button.Margin = new Thickness(0, 0, 8, 8);
            tabs.Children.Add(button);
        }
        foreach (var (key, label) in new[] { ("library", "Catalogue"), ("wanted", "Manquants"), ("calendar", "Calendrier"), ("queue", "File d’attente"), ("history", "Historique") })
        {
            var button = Action(label, () => _ = Navigate(AutomationPage(type, key), back: true), key == view ? "Primary" : "Action");
            button.Margin = new Thickness(0, 0, 8, 8);
            tabs.Children.Add(button);
        }
        PageContent.Children.Add(tabs);
        var search = new TextBox { Text = query, MinWidth = 240, HorizontalAlignment = HorizontalAlignment.Left };
        var bar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 15) };
        bar.Children.Add(search);
        var find = Action("Filtrer", () => _ = Navigate(AutomationPage(type, view, 1, search.Text.Trim()), back: true));
        find.Margin = new Thickness(8, 0, 0, 0);
        bar.Children.Add(find);
        PageContent.Children.Add(bar);
        foreach (var item in data.List("items"))
        {
            var id = (int)item.Num("id");
            var title = item.Str("title");
            if (title.Length == 0) title = item.Str("sourceTitle");
            var actions = new System.Collections.Generic.List<Button>();
            if (view is "library" or "wanted")
            {
                actions.Add(Action("Rechercher une version", () => _ = Navigate(ReleasesPage(type, id, title))));
                actions.Add(ApiAction(item.Flag("monitored") ? "Ne plus suivre" : "Suivre", service, "api/servarr/monitor", "POST",
                    () => new { type, id, monitored = !item.Flag("monitored") }, cancellation,
                    () => _ = Navigate(AutomationPage(type, view, number, query), back: true)));
            }
            PageContent.Children.Add(Row(title, item.Str("year") + " · " + item.Str("status"), actions.ToArray()));
        }
        if (data.List("items").Length == 0) PageContent.Children.Add(Message("Aucun résultat dans cette section."));
        if (data.Num("totalRecords") > number * 30)
            PageContent.Children.Add(Action("Page suivante", () => _ = Navigate(AutomationPage(type, view, number + 1, query), back: true)));
    });

    private Page ReleasesPage(string type, int id, string title) => new(title, ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(title, "Recherche de versions"));
        var path = type == "sonarr" ? $"api/servarr/releases?type=sonarr&seriesId={id}&allSeasons=1" :
            $"api/servarr/releases?type=radarr&id={id}";
        var data = await service.Json(path, cancellation);
        if (cancellation.IsCancellationRequested) return;
        foreach (var release in data.List("releases"))
        {
            var grab = ApiAction("Télécharger", service, "api/servarr/grab", "POST",
                () => new { type, guid = release.Str("guid"), indexerId = (int)release.Num("indexerId") }, cancellation,
                confirmation: "Télécharger cette version avec " + (type == "sonarr" ? "Sonarr" : "Radarr") + " ?");
            grab.IsEnabled = !release.Flag("rejected");
            PageContent.Children.Add(Row(release.Str("title"), Size(release.Num("size")) + " · " + release.Str("quality"), grab));
        }
        if (data.List("releases").Length == 0) PageContent.Children.Add(Message(data.Str("message").Length > 0 ? data.Str("message") : "Recherche en cours ou aucune version trouvée."));
        PageContent.Children.Add(Action("Actualiser la recherche", () => _ = Navigate(ReleasesPage(type, id, title), back: true)));
    });
}
