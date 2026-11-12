using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Page JellyfinAdminPage => new("Jellyfin et médiathèques", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        PageContent.Children.Clear(); PageContent.Children.Add(Heading("Jellyfin et médiathèques", "Supervision du serveur et actualisation du catalogue."));
        var service = new NoctraService(account, account.NoctraRoot!);
        PageContent.Children.Add(ApiAction("Actualiser les médiathèques", service, "api/libraries/refresh", "POST", () => new { }, cancellation,
            confirmation: "Lancer une analyse des médiathèques du serveur ?"));
        var scan = await service.Json("api/libraries/refresh", cancellation);
        if (cancellation.IsCancellationRequested) return;
        if (scan.Str("message").Length > 0) PageContent.Children.Add(Message(scan.Str("message")));
        PageContent.Children.Add(Action("Actualiser l’état", () => _ = Navigate(JellyfinAdminPage, back: true)));
        if (account.User.Policy?.IsAdministrator != true) { PageContent.Children.Add(Message("Les fonctions Jellyfin nécessitent aussi les droits administrateur Jellyfin.")); return; }
        PageContent.Children.Add(AdminShortcuts(account));
        var info = await account.ReadJson("System/Info", cancellation);
        var users = await account.ReadJson("Users", cancellation);
        var tasks = await account.ReadJson("ScheduledTasks", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Add(Heading(info.Str("ServerName"), "Jellyfin " + info.Str("Version")));
        PageContent.Children.Add(Text("Utilisateurs", 23, true));
        foreach (var user in users.List())
        {
            var id = user.Str("Id"); if (!PlayRequest.Identifier(id)) continue;
            PageContent.Children.Add(Row(user.Str("Name"), user.Field("Policy").Flag("IsDisabled") ? "Désactivé" : "Actif",
                Action("Voir le compte", () => _ = Navigate(UserAdminPage(id)))));
        }
        PageContent.Children.Add(Text("Tâches du serveur", 23, true));
        foreach (var task in tasks.List())
        {
            var id = task.Str("Id"); if (!PlayRequest.Identifier(id)) continue;
            var running = task.Str("State") == "Running";
            var button = Action(running ? "Arrêter" : "Lancer", async () =>
            {
                if (MessageBox.Show(this, (running ? "Arrêter" : "Lancer") + " cette tâche Jellyfin ?", task.Str("Name"), MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
                try { await account.Command("ScheduledTasks/Running/" + id, null, cancellation, running ? System.Net.Http.HttpMethod.Delete : System.Net.Http.HttpMethod.Post); if (!cancellation.IsCancellationRequested) await Navigate(JellyfinAdminPage, back: true); }
                catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé cette commande."); }
            });
            PageContent.Children.Add(Row(task.Str("Name"), task.Str("State"), button));
        }
    });

    private Page UserAdminPage(string id) => new("Compte Jellyfin", ButtonTab.None, async (account, cancellation) =>
    {
        if (account.User.Policy?.IsAdministrator != true || !PlayRequest.Identifier(id)) return;
        var user = await account.ReadJson("Users/" + id, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear(); PageContent.Children.Add(Heading(user.Str("Name"), "Compte et état de connexion Jellyfin."));
        PageContent.Children.Add(Message("Dernière activité · " + user.Str("LastActivityDate")));
        var policy = user.Field("Policy");
        PageContent.Children.Add(Message(policy.Flag("IsAdministrator") ? "Administrateur Jellyfin" : "Utilisateur Jellyfin"));
        if (id == account.User.Id) { PageContent.Children.Add(Message("Votre propre compte ne peut pas être désactivé depuis cet écran.")); return; }
        var button = Action(policy.Flag("IsDisabled") ? "Réactiver le compte" : "Désactiver le compte", async () =>
        {
            if (MessageBox.Show(this, "Modifier l’accès de « " + user.Str("Name") + " » ?", "Compte Jellyfin", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
            try
            {
                var updated = policy.EnumerateObject().ToDictionary(field => field.Name, field => (object?)field.Value.Clone()); updated["IsDisabled"] = !policy.Flag("IsDisabled");
                await account.Command("Users/" + id + "/Policy", updated, cancellation);
                if (!cancellation.IsCancellationRequested) await Navigate(UserAdminPage(id), back: true);
            }
            catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException) { ShowStatus("Le compte n’a pas pu être modifié."); }
        });
        PageContent.Children.Add(button);
    });
}
