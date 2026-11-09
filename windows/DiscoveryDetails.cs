using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private async Task RenderDiscoverDetail(Jellyfin account, DiscoverItem item, CancellationToken cancellation)
    {
        PageContent.Children.Clear();
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot);
        PageContent.Children.Add(DiscoveryHero(service, item, cancellation, true));
        var actions = new WrapPanel { Margin = new Thickness(0, 20, 0, 24) }; PageContent.Children.Add(actions);
        actions.Children.Add(Action("Versions disponibles", () => _ = Navigate(DiscoveryReleasesPage(item))));
        foreach (var (action, label) in new[] { ("more", "Davantage de titres similaires"), ("less", "Moins de titres similaires"), ("dismiss", "Masquer cette suggestion") })
        {
            var feedback = ApiAction(label, service, "api/discovery/feedback", "POST", () => new { mediaType = item.MediaType, id = item.Id, title = item.Label, action }, cancellation);
            feedback.Margin = new Thickness(8, 0, 0, 0); actions.Children.Add(feedback);
        }
        PageContent.Children.Add(Message(item.Overview ?? "Synopsis indisponible."));
        try
        {
            var data = await service.Json($"api/media/detail?mediaType={item.MediaType}&id={item.Id}&title={Uri.EscapeDataString(item.Label)}", cancellation);
            if (cancellation.IsCancellationRequested) return;
            var genres = string.Join(" · ", data.List("genres").Select(value => value.ToString()));
            PageContent.Children.Add(Heading("À propos du titre", genres));
            if (data.Str("overview").Length > 0) PageContent.Children.Add(Message(data.Str("overview")));
            var facts = new[] { data.Str("year"), data.Num("runtime") > 0 ? $"{data.Num("runtime"):0} min" : "", data.Str("certification"), data.Str("status") };
            PageContent.Children.Add(Message(string.Join(" · ", facts.Where(value => value.Length > 0))));
            if (data.List("legalPlatforms").Length > 0) PageContent.Children.Add(Message("Plateformes · " + string.Join(", ", data.List("legalPlatforms").Select(value => value.Str("name")))));
            if (data.List("creators").Length > 0) PageContent.Children.Add(Message("Création · " + string.Join(", ", data.List("creators").Select(value => value.ToString()))));
            foreach (var person in data.List("cast")) PageContent.Children.Add(Row(person.Str("name"), person.Str("character")));
        }
        catch (Exception error) when (error is System.Net.Http.HttpRequestException or InvalidOperationException or OperationCanceledException or System.Text.Json.JsonException)
        { if (!cancellation.IsCancellationRequested) PageContent.Children.Add(Message("Les informations complémentaires sont momentanément indisponibles.")); }
    }

    private Page DiscoveryReleasesPage(DiscoverItem item, bool force = false) => new("Versions disponibles", ButtonTab.Discover, async (account, cancellation) =>
    {
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot);
        PageContent.Children.Clear(); PageContent.Children.Add(Heading(item.Label, "Versions proposées par les indexeurs du serveur."));
        var parameters = $"mediaType={item.MediaType}&tmdbId={item.Id}&title={Uri.EscapeDataString(item.Label)}&limit=40";
        var versions = await service.Json("api/discovery/availability?" + parameters + (force ? "&force=1&patient=1" : ""), cancellation);
        var destinations = await service.Json("api/discovery/download-options?" + parameters, cancellation);
        if (cancellation.IsCancellationRequested) return;
        var form = new StackPanel(); PageContent.Children.Add(form);
        var roots = destinations.List("destinations");
        var target = Choice(form, "Destination du téléchargement", roots.Select(root => root.Str("label").Length > 0 ? root.Str("label") : root.Str("path")).ToArray(),
            Math.Max(0, Array.FindIndex(roots, root => root.Str("path") == destinations.Field("suggested").Str("path"))));
        var paused = new CheckBox { Content = "Ajouter en pause", IsChecked = true, Foreground = BrushFor("Ink"), Margin = new Thickness(0, 15, 0, 18) }; form.Children.Add(paused);
        if (versions.Str("message").Length > 0) PageContent.Children.Add(Message(versions.Str("message")));
        foreach (var release in versions.List("releases"))
        {
            var grab = ApiAction("Ajouter au serveur", service, "api/discovery/grab", "POST", () => new { downloadId = release.Str("downloadId"),
                savePath = target.SelectedIndex >= 0 ? roots[target.SelectedIndex].Str("path") : "", category = destinations.Field("suggested").Str("category"), startPaused = paused.IsChecked == true },
                cancellation, confirmation: "Ajouter cette version au serveur de téléchargement ?");
            grab.IsEnabled = release.Str("downloadId").Length > 0 && roots.Length > 0;
            PageContent.Children.Add(Row(release.Str("title"), Size(release.Num("size")) + $" · {release.Num("seeders"):0} sources · " + release.Str("indexer"), grab));
        }
        if (versions.List("releases").Length == 0) PageContent.Children.Add(Message("Aucune version disponible pour cette recherche."));
        PageContent.Children.Add(Action("Relancer la recherche", () => _ = Navigate(DiscoveryReleasesPage(item, true), back: true)));
    });
}
