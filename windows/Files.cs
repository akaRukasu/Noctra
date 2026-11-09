using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private string? AskText(string title, string label, string initial = "")
    {
        var dialog = new Window { Owner = this, Title = title, Width = 490, SizeToContent = SizeToContent.Height,
            ResizeMode = ResizeMode.NoResize, WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Background = BrushFor("Panel"), Foreground = BrushFor("Ink"), FontFamily = FontFamily, ShowInTaskbar = false };
        var body = new StackPanel { Margin = new Thickness(24) };
        var heading = Text(title, 23, true);
        body.Children.Add(heading);
        var input = Input(body, label, initial);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 20, 0, 0) };
        var accept = Action("Valider", () => dialog.DialogResult = true, "Primary");
        accept.IsDefault = true;
        var cancel = Action("Annuler", () => dialog.DialogResult = false);
        cancel.IsCancel = true;
        cancel.Margin = new Thickness(8, 0, 0, 0);
        actions.Children.Add(accept);
        actions.Children.Add(cancel);
        body.Children.Add(actions);
        dialog.Content = body;
        dialog.Loaded += (_, _) => { input.Focus(); input.SelectAll(); };
        return dialog.ShowDialog() == true ? input.Text.Trim() : null;
    }

    private Page FilesPage(string? root = null, string path = "") => new("Fichiers", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var roots = await service.Json("api/files/roots", cancellation);
        var choices = roots.List("roots").Where(item => item.Flag("available")).ToArray();
        var selected = choices.FirstOrDefault(item => item.Str("id") == root);
        if (selected.ValueKind == System.Text.Json.JsonValueKind.Undefined) selected = choices.FirstOrDefault();
        var rootId = selected.Str("id");
        if (rootId.Length == 0) throw new InvalidOperationException("Aucun dossier disponible.");
        var data = await service.Json("api/files?root=" + Uri.EscapeDataString(rootId) + "&path=" + Uri.EscapeDataString(path), cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Fichiers", selected.Str("label") + " / " + data.Str("path")));
        var tabs = new WrapPanel { Margin = new Thickness(0, 0, 0, 14) };
        foreach (var folder in choices)
        {
            var id = folder.Str("id");
            var button = Action(folder.Str("label"), () => _ = Navigate(FilesPage(id), back: true), id == rootId ? "Primary" : "Action");
            button.Margin = new Thickness(0, 0, 7, 7);
            tabs.Children.Add(button);
        }
        PageContent.Children.Add(tabs);
        var tools = new WrapPanel { Margin = new Thickness(0, 0, 0, 13) };
        var create = Action("Nouveau dossier", async () =>
        {
            var name = AskText("Nouveau dossier", "Nom");
            if (string.IsNullOrWhiteSpace(name)) return;
            try
            {
                await service.Submit("api/files/mkdir", new { root = rootId, path, name }, cancellation);
                if (!cancellation.IsCancellationRequested) await Navigate(FilesPage(rootId, path), back: true);
            }
            catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException)
            { if (!cancellation.IsCancellationRequested) ShowStatus("Impossible de créer ce dossier."); }
        });
        tools.Children.Add(create);
        foreach (var (label, page) in new[] { ("Doublons", AuditPage(false)), ("Sagas et séries", AuditPage(true)) })
        {
            var button = Action(label, () => _ = Navigate(page));
            button.Margin = new Thickness(8, 0, 0, 0);
            tools.Children.Add(button);
        }
        if (rootId == "trash")
        {
            var empty = ApiAction("Vider la corbeille", service, "api/files/empty-trash", "POST", () => new { root = rootId }, cancellation,
                () => _ = Navigate(FilesPage(rootId), back: true), "Supprimer définitivement le contenu de la corbeille ?");
            empty.Margin = new Thickness(8, 0, 0, 0);
            tools.Children.Add(empty);
        }
        PageContent.Children.Add(tools);
        if (data.Field("parent").ValueKind == System.Text.Json.JsonValueKind.String)
            PageContent.Children.Add(Action("↑ Dossier parent", () => _ = Navigate(FilesPage(rootId, data.Str("parent")))));
        foreach (var file in data.List("items"))
        {
            var name = file.Str("name");
            var target = file.Str("path");
            var actions = new System.Collections.Generic.List<Button>();
            if (file.Str("type") == "directory") actions.Add(Action("Ouvrir", () => _ = Navigate(FilesPage(rootId, target))));
            if (file.Flag("manageable"))
            {
                actions.Add(Action("Renommer", async () =>
                {
                    var updated = AskText("Renommer", "Nouveau nom", name);
                    if (string.IsNullOrWhiteSpace(updated) || updated == name) return;
                    try
                    {
                        await service.Submit("api/files/rename", new { root = rootId, path = target, name = updated }, cancellation);
                        if (!cancellation.IsCancellationRequested) await Navigate(FilesPage(rootId, path), back: true);
                    }
                    catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException)
                    { if (!cancellation.IsCancellationRequested) ShowStatus("Le renommage a échoué."); }
                }));
                actions.Add(Action("Déplacer", async () =>
                {
                    var destination = AskText("Déplacer", "Dossier de destination dans cette racine");
                    if (destination == null) return;
                    try
                    {
                        await service.Submit("api/files/move", new { root = rootId, path = target, targetRoot = rootId, targetPath = destination }, cancellation);
                        if (!cancellation.IsCancellationRequested) await Navigate(FilesPage(rootId, path), back: true);
                    }
                    catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException)
                    { if (!cancellation.IsCancellationRequested) ShowStatus("Le déplacement a échoué."); }
                }));
                actions.Add(ApiAction("Corbeille", service, "api/files/trash", "POST", () => new { root = rootId, path = target }, cancellation,
                    () => _ = Navigate(FilesPage(rootId, path), back: true), "Mettre « " + name + " » à la corbeille ?"));
            }
            PageContent.Children.Add(Row(name, file.Str("type") == "directory" ? "Dossier" : Size(file.Num("size")), actions.ToArray()));
        }
        if (data.List("items").Length == 0) PageContent.Children.Add(Message("Ce dossier est vide."));
    });

    private Page AuditPage(bool completeness) => new(completeness ? "Sagas et séries" : "Doublons", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var key = completeness ? "completeness" : "duplicates";
        var data = await service.Json("api/files/" + key + "/status", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(completeness ? "Sagas et séries" : "Doublons", "Analyse des fichiers et des médiathèques"));
        PageContent.Children.Add(Message(data.Str("message").Length > 0 ? data.Str("message") : data.Flag("running") ? "Analyse en cours…" : "Analyse disponible."));
        var buttons = new WrapPanel { Margin = new Thickness(0, 0, 0, 15) };
        buttons.Children.Add(ApiAction("Lancer l’analyse", service, "api/files/" + key + "/start", "POST", () => new { }, cancellation,
            () => _ = Navigate(AuditPage(completeness), back: true)));
        var refresh = Action("Actualiser", () => _ = Navigate(AuditPage(completeness), back: true));
        refresh.Margin = new Thickness(8, 0, 0, 0);
        buttons.Children.Add(refresh);
        PageContent.Children.Add(buttons);
        foreach (var group in data.List("groups"))
        {
            if (completeness)
            {
                PageContent.Children.Add(Row(group.Str("title").Length > 0 ? group.Str("title") : group.Str("name"), group.Str("status")));
                continue;
            }
            var keep = group.Field("keep");
            foreach (var duplicate in group.List("duplicates"))
            {
                var remove = ApiAction("Supprimer le doublon", service, "api/files/duplicates/delete", "POST",
                    () => new { items = new[] { new { root = duplicate.Str("root"), path = duplicate.Str("path"),
                        keepRoot = keep.Str("root"), keepPath = keep.Str("path"), hash = group.Str("hash"), size = group.Num("size") } } },
                    cancellation, () => _ = Navigate(AuditPage(false), back: true),
                    "Supprimer définitivement ce doublon et conserver « " + keep.Str("path") + " » ?");
                PageContent.Children.Add(Row(duplicate.Str("path"), "Copie conservée · " + keep.Str("path"), remove));
            }
        }
    });
}
