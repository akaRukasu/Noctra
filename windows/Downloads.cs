using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Page DownloadsPage => new("Téléchargements", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var data = await service.Json("api/downloads", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Téléchargements", "Transferts et partage qBittorrent"));
        var status = Message("");
        PageContent.Children.Add(status);
        var search = new TextBox { Width = 300, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 12) };
        AutomationProperties.SetName(search, "Filtrer les téléchargements");
        var list = new StackPanel();
        var toolbar = new WrapPanel { Margin = new Thickness(0, 0, 0, 14) };
        var upload = Action("Ajouter un .torrent", async () =>
        {
            var picker = new OpenFileDialog { Filter = "Fichier torrent|*.torrent", Multiselect = false };
            if (picker.ShowDialog(this) != true) return;
            var info = new System.IO.FileInfo(picker.FileName);
            if (info.Length > 10 * 1024 * 1024) { ShowStatus("Le fichier est trop volumineux."); return; }
            try
            {
                var bytes = await System.IO.File.ReadAllBytesAsync(picker.FileName, cancellation);
                await service.Submit("api/downloads/add", new { dataBase64 = Convert.ToBase64String(bytes), name = info.Name }, cancellation);
                if (!cancellation.IsCancellationRequested) ShowStatus("Torrent envoyé au serveur.");
            }
            catch (Exception error) when (error is System.IO.IOException or System.Net.Http.HttpRequestException or OperationCanceledException)
            {
                if (!cancellation.IsCancellationRequested) ShowStatus("Le torrent n’a pas pu être envoyé.");
            }
        });
        toolbar.Children.Add(upload);
        var refresh = Action("Actualiser", () => _ = Navigate(DownloadsPage, back: true));
        refresh.Margin = new Thickness(8, 0, 0, 0);
        toolbar.Children.Add(refresh);
        var relink = ApiAction("Relocaliser pour le seed", service, "api/downloads/relink/start", "POST", () => new { }, cancellation);
        relink.Margin = new Thickness(8, 0, 0, 0);
        toolbar.Children.Add(relink);
        PageContent.Children.Add(toolbar);
        PageContent.Children.Add(search);
        PageContent.Children.Add(list);

        void Draw()
        {
            MessageLabel(status).Text = $"↓ {Size(data.Num("downloadSpeed"))}/s    ↑ {Size(data.Num("uploadSpeed"))}/s    ·    {Size(data.Num("freeSpace"))} disponibles";
            list.Children.Clear();
            foreach (var torrent in data.List("torrents").Where(item => item.Str("name").Contains(search.Text.Trim(), StringComparison.CurrentCultureIgnoreCase)))
            {
                var hash = torrent.Str("hash");
                var name = torrent.Str("name");
                var paused = torrent.Str("state").Contains("pause", StringComparison.OrdinalIgnoreCase) ||
                    torrent.Str("state").Contains("stopped", StringComparison.OrdinalIgnoreCase);
                var toggle = ApiAction(paused ? "Reprendre" : "Pause", service, $"api/downloads/{Uri.EscapeDataString(hash)}/{(paused ? "resume" : "pause")}",
                    "POST", () => new { }, cancellation, () => _ = Navigate(DownloadsPage, back: true));
                var details = Action("Détails", () => _ = Navigate(TorrentPage(hash, name)));
                var remove = ApiAction("Retirer", service, $"api/downloads/{Uri.EscapeDataString(hash)}/delete", "POST",
                    () => new { deleteFiles = false }, cancellation, () => _ = Navigate(DownloadsPage, back: true),
                    "Retirer « " + name + " » de qBittorrent et conserver ses fichiers ?");
                var block = new StackPanel();
                block.Children.Add(Row(name, $"{torrent.Num("progress") * 100:0.0}% · {Size(torrent.Num("size"))} · {torrent.Str("state")}", toggle, details, remove));
                block.Children.Add(new ProgressBar { Minimum = 0, Maximum = 1, Value = torrent.Num("progress"), Height = 3,
                    Foreground = BrushFor("Accent"), Background = BrushFor("Outline"), BorderThickness = new Thickness(0), Margin = new Thickness(10, -9, 10, 11) });
                list.Children.Add(block);
            }
            if (list.Children.Count == 0) list.Children.Add(Message("Aucun téléchargement pour ce filtre."));
        }
        search.TextChanged += (_, _) => Draw();
        Draw();
        _ = Poll();
        async Task Poll()
        {
            try
            {
                while (!cancellation.IsCancellationRequested)
                {
                    await Task.Delay(4000, cancellation);
                    var current = await service.Json("api/downloads", cancellation);
                    if (cancellation.IsCancellationRequested) return;
                    data = current;
                    if (!list.IsKeyboardFocusWithin) Draw();
                }
            }
            catch (Exception error) when (error is System.Net.Http.HttpRequestException or OperationCanceledException or System.Text.Json.JsonException) { }
        }
    });

    private Page TorrentPage(string hash, string name) => new(name, ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var data = await service.Json($"api/downloads/{Uri.EscapeDataString(hash)}/details", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(name, "Détails du transfert"));
        var tools = new WrapPanel();
        foreach (var (action, label) in new[] { ("recheck", "Revérifier"), ("reannounce", "Réannoncer"), ("top", "Priorité haute"), ("bottom", "Priorité basse") })
        {
            var button = ApiAction(label, service, $"api/downloads/{hash}/{action}", "POST", () => new { }, cancellation);
            button.Margin = new Thickness(0, 0, 8, 12);
            tools.Children.Add(button);
        }
        PageContent.Children.Add(tools);
        foreach (var file in data.List("files"))
            PageContent.Children.Add(Row(file.Str("name"), $"{Size(file.Num("size"))} · {file.Num("progress") * 100:0}%"));
        foreach (var tracker in data.List("trackers"))
            PageContent.Children.Add(Row(tracker.Str("url"), tracker.Str("msg")));
        PageContent.Children.Add(ApiAction("Supprimer le torrent et ses fichiers", service, $"api/downloads/{hash}/delete", "POST",
            () => new { deleteFiles = true }, cancellation, () => _ = Navigate(DownloadsPage),
            "Supprimer définitivement le torrent « " + name + " » et ses fichiers du serveur ?"));
    });
}
