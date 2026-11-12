using System;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

namespace Noctra.Windows;

// 0.7 : administration Jellyfin complétée (extensions, journal d'activité, appareils,
// dossiers des médiathèques, redémarrage) et stockage du serveur Noctra.
public partial class MainWindow
{
    private FrameworkElement AdminShortcuts(Jellyfin account)
    {
        var row = new WrapPanel { Margin = new Thickness(0, 14, 0, 22) };
        void Add(string title, Page destination)
        {
            var button = Action(title, () => _ = Navigate(destination));
            button.Margin = new Thickness(0, 0, 8, 8);
            row.Children.Add(button);
        }
        Add("Extensions", PluginsPage);
        Add("Journal d’activité", ActivityPage);
        Add("Appareils", DevicesPage);
        Add("Dossiers des médiathèques", LibraryFoldersPage);
        if (account.NoctraRoot != null) Add("Stockage du serveur", StoragePage);
        var restart = Action("Redémarrer Jellyfin", async () =>
        {
            if (MessageBox.Show(this, "Redémarrer le serveur Jellyfin ? Les lectures en cours sur tous les appareils seront interrompues quelques instants.",
                "Jellyfin", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            try { await account.Command("System/Restart", null, lifetime.Token); ShowStatus("Redémarrage de Jellyfin demandé."); }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé le redémarrage."); }
        });
        restart.Margin = new Thickness(0, 0, 8, 8);
        row.Children.Add(restart);
        return row;
    }

    private bool JellyfinAdmin(Jellyfin account)
    {
        if (account.User.Policy?.IsAdministrator == true) return true;
        PageContent.Children.Clear();
        PageContent.Children.Add(Message("Cette fonction nécessite les droits administrateur Jellyfin."));
        return false;
    }

    private Page PluginsPage => new("Extensions", ButtonTab.None, async (account, cancellation) =>
    {
        if (!JellyfinAdmin(account)) return;
        var plugins = (await account.ReadJson("Plugins", cancellation)).List();
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Extensions Jellyfin", plugins.Length + " extension" + (plugins.Length > 1 ? "s" : "") + " installée" + (plugins.Length > 1 ? "s" : "")));
        foreach (var plugin in plugins.OrderBy(plugin => plugin.Str("Name")))
        {
            var id = plugin.Str("Id");
            var version = plugin.Str("Version");
            var status = plugin.Str("Status");
            var label = status switch { "Active" => "Active", "Disabled" => "Désactivée", "Restart" => "Redémarrage requis", "Malfunctioned" => "En erreur", "NotSupported" => "Incompatible", _ => status };
            var buttons = new System.Collections.Generic.List<Button>();
            if (PlayRequest.Identifier(id) && version.Length is > 0 and < 40 && status is "Active" or "Disabled")
            {
                var enable = status == "Disabled";
                buttons.Add(Action(enable ? "Activer" : "Désactiver", async () =>
                {
                    if (MessageBox.Show(this, (enable ? "Activer" : "Désactiver") + " l’extension « " + plugin.Str("Name") + " » ? Jellyfin devra redémarrer.",
                        "Extensions", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                    try
                    {
                        await account.Command("Plugins/" + id + "/" + Uri.EscapeDataString(version) + (enable ? "/Enable" : "/Disable"), null, cancellation);
                        ShowStatus("Modification enregistrée : redémarrez Jellyfin pour l’appliquer.");
                        _ = Navigate(PluginsPage, back: true);
                    }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé la modification."); }
                }));
            }
            PageContent.Children.Add(Row(plugin.Str("Name") + " · " + version, label + (plugin.Str("Description") is { Length: > 0 } text ? " · " + text : ""), buttons.ToArray()));
        }
    });

    private Page ActivityPage => new("Journal d’activité", ButtonTab.None, async (account, cancellation) =>
    {
        if (!JellyfinAdmin(account)) return;
        var entries = (await account.ReadJson("System/ActivityLog/Entries?limit=80&hasUserId=false", cancellation)).List("Items");
        var users = (await account.ReadJson("System/ActivityLog/Entries?limit=80&hasUserId=true", cancellation)).List("Items");
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Journal d’activité", "Connexions, lectures et événements du serveur."));
        var all = entries.Concat(users).OrderByDescending(entry => entry.Str("Date")).Take(120).ToArray();
        if (all.Length == 0) PageContent.Children.Add(Message("Aucun événement récent."));
        foreach (var entry in all)
        {
            var when = DateTime.TryParse(entry.Str("Date"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var date)
                ? date.ToLocalTime().ToString("dd/MM HH:mm", CultureInfo.CurrentCulture) : "";
            var severity = entry.Str("Severity") is "Error" or "Critical" ? "Erreur · " : entry.Str("Severity") == "Warning" ? "Alerte · " : "";
            PageContent.Children.Add(Row(entry.Str("Name"), severity + when + (entry.Str("ShortOverview") is { Length: > 0 } detail ? " · " + detail : "")));
        }
    });

    private Page DevicesPage => new("Appareils", ButtonTab.None, async (account, cancellation) =>
    {
        if (!JellyfinAdmin(account)) return;
        var devices = (await account.ReadJson("Devices", cancellation)).List("Items");
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Appareils", devices.Length + " appareil" + (devices.Length > 1 ? "s" : "") + " connus du serveur."));
        foreach (var device in devices.OrderByDescending(device => device.Str("DateLastActivity")))
        {
            var id = device.Str("Id");
            var current = id == account.DeviceId;
            var when = DateTime.TryParse(device.Str("DateLastActivity"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var date)
                ? date.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.CurrentCulture) : "";
            var buttons = current || id.Length is 0 or > 200 ? [] : new[]
            {
                Action("Déconnecter", async () =>
                {
                    if (MessageBox.Show(this, "Déconnecter « " + device.Str("Name") + " » ? Il devra se reconnecter.", "Appareils",
                        MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                    try { await account.Command("Devices?id=" + Uri.EscapeDataString(id), null, cancellation, HttpMethod.Delete); _ = Navigate(DevicesPage, back: true); }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("L’appareil n’a pas pu être déconnecté."); }
                })
            };
            PageContent.Children.Add(Row(device.Str("Name") + (current ? " · ce PC" : ""),
                string.Join(" · ", new[] { device.Str("AppName") + " " + device.Str("AppVersion"), device.Str("LastUserName"), when }.Where(part => part.Trim().Length > 0)), buttons));
        }
    });

    private Page LibraryFoldersPage => new("Dossiers des médiathèques", ButtonTab.None, async (account, cancellation) =>
    {
        if (!JellyfinAdmin(account)) return;
        var folders = (await account.ReadJson("Library/VirtualFolders", cancellation)).List();
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Dossiers des médiathèques", "Emplacements analysés par Jellyfin, médiathèque par médiathèque."));
        foreach (var folder in folders)
        {
            var id = folder.Str("ItemId");
            var locations = string.Join(" · ", folder.List("Locations").Select(location => location.Str()));
            var type = folder.Str("CollectionType") switch { "movies" => "Films", "tvshows" => "Séries", "music" => "Musique", "photos" => "Photos", "homevideos" => "Vidéos", "books" => "Livres", "boxsets" => "Collections", "" => "Mixte", var other => other };
            var progress = folder.Num("RefreshProgress");
            var scan = Action(progress > 0 && progress < 100 ? $"Analyse {progress:0} %" : "Analyser", async () =>
            {
                if (!PlayRequest.Identifier(id)) return;
                try
                {
                    await account.Command("Items/" + id + "/Refresh?Recursive=true&ImageRefreshMode=Default&MetadataRefreshMode=Default&ReplaceAllImages=false&ReplaceAllMetadata=false", null, cancellation);
                    ShowStatus("Analyse de « " + folder.Str("Name") + " » lancée.");
                }
                catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé l’analyse."); }
            });
            scan.IsEnabled = PlayRequest.Identifier(id);
            PageContent.Children.Add(Row(folder.Str("Name") + " · " + type, locations, scan));
        }
    });

    private Page StoragePage => new("Stockage du serveur", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var data = await new NoctraService(account, account.NoctraRoot!).Json("api/files/storage", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Stockage du serveur", data.Field("capacity").Str("source") == "quota" ? "Quota de la seedbox" : "Disque de la seedbox"));
        var capacity = data.Field("capacity");
        var total = capacity.Num("total");
        var used = capacity.Num("used");
        if (total > 0)
        {
            var ratio = Math.Clamp(used / total, 0, 1);
            var card = new StackPanel();
            card.Children.Add(Text(Size(used) + " utilisés sur " + Size(total), 26, true));
            card.Children.Add(Text(Size(capacity.Num("free")) + " libres · " + (ratio * 100).ToString("0", CultureInfo.CurrentCulture) + " % occupés", 14, color: "Muted"));
            var bar = new Grid { Height = 14, Margin = new Thickness(0, 18, 0, 6) };
            bar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Max(ratio, .005), GridUnitType.Star) });
            bar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Max(1 - ratio, .005), GridUnitType.Star) });
            var rail = new Border { CornerRadius = new CornerRadius(7), Background = ColorOf("#1FFFFFFF") };
            Grid.SetColumnSpan(rail, 2);
            bar.Children.Add(rail);
            bar.Children.Add(new Border { CornerRadius = new CornerRadius(7), Background = ratio > .9 ? ColorOf("#FF7A93") : BrushFor("AccentGradient") });
            card.Children.Add(bar);
            PageContent.Children.Add(Sheet(card));
        }
        var libraries = data.List("libraries");
        if (libraries.Length > 0)
        {
            var heading = Text("Par médiathèque", 22, true);
            heading.Margin = new Thickness(0, 18, 0, 12);
            PageContent.Children.Add(heading);
            var largest = libraries.Max(library => library.Num("bytes"));
            foreach (var library in libraries.OrderByDescending(library => library.Num("bytes")))
            {
                var share = largest > 0 ? library.Num("bytes") / largest : 0;
                var line = new StackPanel { Margin = new Thickness(0, 0, 0, 14) };
                var label = new DockPanel();
                var size = Text(Size(library.Num("bytes")), 14, true);
                DockPanel.SetDock(size, Dock.Right);
                label.Children.Add(size);
                label.Children.Add(Text(library.Str("label"), 14));
                line.Children.Add(label);
                var bar = new Border { Height = 8, CornerRadius = new CornerRadius(4), Background = BrushFor("AccentGradient"), HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 6, 0, 0) };
                line.SizeChanged += (_, _) => bar.Width = Math.Max(6, line.ActualWidth * share);
                line.Children.Add(bar);
                PageContent.Children.Add(line);
            }
        }
        if (data.Flag("librariesComputing")) PageContent.Children.Add(Message("Calcul des tailles en cours sur le serveur…"));
        var refresh = Action("Recalculer", () => _ = Navigate(new("Stockage du serveur", ButtonTab.None, async (current, token) =>
        {
            await new NoctraService(current, current.NoctraRoot!).Json("api/files/storage?refresh=1", token);
            await Navigate(StoragePage, back: true);
        }), back: true));
        refresh.HorizontalAlignment = HorizontalAlignment.Left;
        PageContent.Children.Add(refresh);
    });
}
