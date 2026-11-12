using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Noctra.Windows;

// 0.7 : lecture hors connexion. Le fichier original est copié sur ce PC (droit Jellyfin
// « téléchargement »), par profil ; la position de lecture est conservée et reportée au
// serveur dès que le profil se reconnecte.
internal sealed record OfflineEntry(MediaItem Item, string File, long Size, DateTime Downloaded, long Position = 0,
    bool Played = false, bool PendingSync = false, string? Poster = null);

public partial class MainWindow
{
    private sealed class OfflineJob
    {
        internal required MediaItem Item;
        internal long Received, Total;
        internal readonly CancellationTokenSource Cancel = new();
    }

    private readonly Dictionary<string, OfflineJob> offlineJobs = [];
    private bool offlineMode;
    private Viewer? offlineViewer;
    private const string OfflinePageTitle = "Téléchargements sur ce PC";

    private string OfflineDirectory(string userId) => Path.Combine(dataDirectory, "Offline", userId);
    private string? OfflineOwner => client?.User.Id ?? offlineViewer?.Id;

    private List<OfflineEntry> ReadOffline(string userId)
    {
        try
        {
            var path = Path.Combine(OfflineDirectory(userId), "index.json");
            if (!File.Exists(path)) return [];
            return (JsonSerializer.Deserialize<List<OfflineEntry>>(File.ReadAllText(path), Jellyfin.Json) ?? [])
                .Where(entry => PlayRequest.Identifier(entry.Item.Id) && File.Exists(Path.Combine(OfflineDirectory(userId), entry.File))).ToList();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { return []; }
    }

    private void WriteOffline(string userId, List<OfflineEntry> entries)
    {
        var directory = OfflineDirectory(userId);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "index.json");
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(entries, Jellyfin.Json));
        File.Move(temporary, path, true);
    }

    private bool IsOffline(string id) => OfflineOwner is { } owner && ReadOffline(owner).Any(entry => entry.Item.Id == id);

    private Button OfflineButtonFor(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        var button = Action(IsOffline(item.Id) ? "Disponible hors connexion" : offlineJobs.ContainsKey(item.Id) ? "Téléchargement en cours…" : "Télécharger sur ce PC", () => { });
        AutomationProperties.SetAutomationId(button, "OfflineDownload");
        button.IsEnabled = !IsOffline(item.Id) && !offlineJobs.ContainsKey(item.Id);
        button.Click += (_, _) =>
        {
            button.IsEnabled = false;
            SetLabel(button, "Téléchargement en cours…");
            _ = DownloadOffline(account, item, () => Dispatcher.Invoke(() => { if (!cancellation.IsCancellationRequested) SetLabel(button, "Disponible hors connexion"); }));
        };
        return button;
    }

    private async Task DownloadOffline(Jellyfin account, MediaItem item, Action? done = null)
    {
        if (offlineJobs.ContainsKey(item.Id) || !PlayRequest.Identifier(item.Id)) return;
        var job = new OfflineJob { Item = item };
        offlineJobs[item.Id] = job;
        var directory = OfflineDirectory(account.User.Id);
        string? partial = null;
        try
        {
            Directory.CreateDirectory(directory);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, job.Cancel.Token);
            using var response = await account.Download(item.Id, linked.Token);
            if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
                throw new InvalidOperationException("Le téléchargement n’est pas autorisé pour ce compte (droit Jellyfin « Autoriser le téléchargement de médias »).");
            response.EnsureSuccessStatusCode();
            job.Total = response.Content.Headers.ContentLength ?? 0;
            var drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(directory))!);
            if (job.Total > 0 && drive.AvailableFreeSpace < job.Total + 1_000_000_000L)
                throw new InvalidOperationException("Espace disque insuffisant sur ce PC pour ce fichier (" + Size(job.Total) + ").");
            var name = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName?.Trim('"');
            var extension = Path.GetExtension(name ?? "") is { Length: > 1 and <= 6 } found && found[1..].All(char.IsAsciiLetterOrDigit) ? found : ".mkv";
            var file = item.Id + extension.ToLowerInvariant();
            partial = Path.Combine(directory, file + ".part");
            ShowStatus("Téléchargement de « " + item.DisplayTitle + " » sur ce PC…");
            await using (var source = await response.Content.ReadAsStreamAsync(linked.Token))
            await using (var target = new FileStream(partial, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, true))
            {
                var buffer = new byte[1 << 20];
                int read;
                while ((read = await source.ReadAsync(buffer, linked.Token)) > 0)
                {
                    await target.WriteAsync(buffer.AsMemory(0, read), linked.Token);
                    job.Received += read;
                }
            }
            File.Move(partial, Path.Combine(directory, file), true);
            partial = null;
            string? poster = null;
            try
            {
                using var image = await account.Image("Items/" + item.Id + "/Images/Primary?maxWidth=400&quality=85", lifetime.Token);
                if (image.IsSuccessStatusCode)
                {
                    poster = item.Id + ".jpg";
                    await File.WriteAllBytesAsync(Path.Combine(directory, poster), await image.Content.ReadAsByteArrayAsync(lifetime.Token), lifetime.Token);
                }
            }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException) { poster = null; }
            var entries = ReadOffline(account.User.Id).Where(entry => entry.Item.Id != item.Id).ToList();
            entries.Insert(0, new OfflineEntry(item with { People = null, Chapters = null, MediaSources = null }, file, job.Received, DateTime.UtcNow,
                item.Resume, item.UserData?.Played == true, false, poster));
            WriteOffline(account.User.Id, entries);
            ShowStatus("« " + item.DisplayTitle + " » est disponible hors connexion.");
            done?.Invoke();
        }
        catch (Exception error) when (error is HttpRequestException or IOException or UnauthorizedAccessException or OperationCanceledException or InvalidOperationException)
        {
            if (!closing) ShowStatus(job.Cancel.IsCancellationRequested ? "Téléchargement annulé." :
                error is InvalidOperationException ? error.Message : "Le téléchargement a échoué. Vérifiez la connexion et l’espace disque, puis réessayez.");
        }
        finally
        {
            offlineJobs.Remove(item.Id);
            if (partial != null) try { File.Delete(partial); } catch (IOException) { }
            if (page?.Title == OfflinePageTitle && client == account) _ = Navigate(OfflinePage, back: true);
        }
    }

    private Page OfflinePage => new(OfflinePageTitle, ButtonTab.None, (account, cancellation) =>
    {
        RenderOffline(account.User.Id, cancellation);
        if (offlineJobs.Count > 0)
        {
            // Avancement des téléchargements, actualisé chaque seconde tant que la page est ouverte.
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            timer.Tick += (_, _) => { if (cancellation.IsCancellationRequested) timer.Stop(); else UpdateOfflineProgress(); };
            cancellation.Register(() => Dispatcher.BeginInvoke(timer.Stop));
            timer.Start();
        }
        return Task.CompletedTask;
    });

    private readonly Dictionary<string, (ProgressBar Bar, TextBlock Label)> offlineProgress = [];
    private void UpdateOfflineProgress()
    {
        foreach (var (id, (bar, label)) in offlineProgress)
            if (offlineJobs.TryGetValue(id, out var job))
            {
                bar.Value = job.Total > 0 ? 100.0 * job.Received / job.Total : 0;
                label.Text = Size(job.Received) + (job.Total > 0 ? " sur " + Size(job.Total) : "");
            }
    }

    private void RenderOffline(string userId, CancellationToken cancellation)
    {
        PageContent.Children.Clear();
        offlineProgress.Clear();
        PageContent.Children.Add(FeatureHero("", "HORS CONNEXION", "Vos films, même sans réseau.",
            "Téléchargez un film ou un épisode depuis sa fiche : il se lit ensuite sur ce PC sans connexion. La reprise est reportée au serveur à votre retour."));
        foreach (var job in offlineJobs.Values)
        {
            var bar = new ProgressBar { Height = 4, Maximum = 100, Margin = new Thickness(0, 8, 0, 0), Foreground = BrushFor("AccentGradient"), Background = ColorOf("#1FFFFFFF"), BorderThickness = new Thickness(0) };
            var label = Text("Préparation…", 12, color: "Muted");
            var stack = new StackPanel();
            stack.Children.Add(Row(job.Item.DisplayTitle, job.Item.Caption, Action("Annuler", () => job.Cancel.Cancel())));
            stack.Children.Add(label);
            stack.Children.Add(bar);
            stack.Margin = new Thickness(0, 0, 0, 14);
            offlineProgress[job.Item.Id] = (bar, label);
            PageContent.Children.Add(stack);
        }
        UpdateOfflineProgress();
        var entries = ReadOffline(userId);
        if (entries.Count == 0 && offlineJobs.Count == 0)
        {
            PageContent.Children.Add(Message("Aucun titre téléchargé sur ce PC pour ce profil. Ouvrez la fiche d’un film ou d’un épisode puis « Télécharger sur ce PC »."));
            return;
        }
        var total = entries.Sum(entry => entry.Size);
        var summary = Text(entries.Count + " titre" + (entries.Count > 1 ? "s" : "") + " · " + Size(total) + " utilisés sur ce PC", 13, color: "Muted");
        summary.Margin = new Thickness(0, 4, 0, 14);
        PageContent.Children.Add(summary);
        foreach (var entry in entries)
        {
            var play = Action("▶   Lire", () => PlayOffline(userId, entry), "Primary");
            var remove = Action("Supprimer", () =>
            {
                if (MessageBox.Show(this, "Supprimer « " + entry.Item.DisplayTitle + " » de ce PC ? Le titre reste disponible sur le serveur.", "Hors connexion",
                    MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                try
                {
                    var directory = OfflineDirectory(userId);
                    File.Delete(Path.Combine(directory, entry.File));
                    if (entry.Poster != null) File.Delete(Path.Combine(directory, entry.Poster));
                    WriteOffline(userId, ReadOffline(userId).Where(other => other.Item.Id != entry.Item.Id).ToList());
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { ShowStatus("Le fichier n’a pas pu être supprimé (lecture en cours ?)."); }
                if (client != null) _ = Navigate(OfflinePage, back: true); else OfflineShell();
            });
            var caption = entry.Item.Caption + " · " + Size(entry.Size) + (entry.Position > 0 && !entry.Played ? " · reprise à " + FormatTime(entry.Position / (double)TimeSpan.TicksPerSecond) : entry.Played ? " · vu" : "");
            var row = (Border)Row(entry.Item.DisplayTitle, caption, play, remove);
            if (entry.Poster != null && row.Child is DockPanel dock)
            {
                var image = new Image { Width = 46, Height = 68, Stretch = Stretch.UniformToFill, Margin = new Thickness(0, 0, 14, 0) };
                try
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.UriSource = new Uri(Path.Combine(OfflineDirectory(userId), entry.Poster));
                    bitmap.DecodePixelWidth = 92;
                    bitmap.EndInit();
                    image.Source = bitmap;
                }
                catch (Exception error) when (error is IOException or NotSupportedException or UriFormatException) { }
                image.Clip = new RectangleGeometry(new Rect(0, 0, 46, 68), 6, 6);
                DockPanel.SetDock(image, Dock.Left);
                dock.Children.Insert(0, image);
            }
            PageContent.Children.Add(row);
        }
    }

    private void PlayOffline(string userId, OfflineEntry entry)
    {
        var path = Path.Combine(OfflineDirectory(userId), entry.File);
        if (!File.Exists(path)) { ShowStatus("Le fichier téléchargé est introuvable."); return; }
        StartPlayback(entry.Item with { UserData = new WatchData(entry.Played, entry.Position, entry.Item.UserData?.IsFavorite == true) },
            entry.Played ? 0 : entry.Position, localFile: new Uri(path));
    }

    // Position de lecture hors connexion : enregistrée sur ce PC, envoyée au serveur si possible.
    private void SaveOfflinePosition(ActivePlayback state, bool finished)
    {
        if (OfflineOwner is not { } owner) return;
        var entries = ReadOffline(owner);
        var index = entries.FindIndex(entry => entry.Item.Id == state.Session.ItemId);
        if (index < 0) return;
        var ticks = finished ? 0 : (long)(state.Position * TimeSpan.TicksPerSecond);
        entries[index] = entries[index] with { Position = ticks, Played = finished || entries[index].Played, PendingSync = true };
        try { WriteOffline(owner, entries); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { return; }
        if (client is { } account && account.User.Id == owner) _ = SyncOfflinePositions(account);
    }

    private async Task SyncOfflinePositions(Jellyfin account)
    {
        var entries = ReadOffline(account.User.Id);
        var changed = false;
        for (var index = 0; index < entries.Count; index++)
        {
            var entry = entries[index];
            if (!entry.PendingSync) continue;
            try
            {
                if (entry.Played && entry.Position == 0) await account.Mark(entry.Item.Id, true, lifetime.Token);
                else await account.SetResume(entry.Item.Id, entry.Position, lifetime.Token);
                entries[index] = entry with { PendingSync = false };
                changed = true;
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { break; }
        }
        if (changed && client == account)
            try { WriteOffline(account.User.Id, entries); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    // Écran de connexion sans réseau : accès direct aux téléchargements du profil enregistré.
    private void OpenOffline(object sender, RoutedEventArgs args)
    {
        if (offlineViewer == null || client != null) return;
        offlineMode = true;
        OfflineShell();
    }

    private void OfflineShell()
    {
        if (offlineViewer is not { } viewer) return;
        LoginShell.Visibility = Visibility.Collapsed;
        LibraryShell.Visibility = Visibility.Visible;
        ProfileName.Text = viewer.Name;
        Initial.Text = viewer.Name.Length > 0 ? viewer.Name[..1].ToUpperInvariant() : "N";
        BackButton.Visibility = Visibility.Collapsed;
        RenderOffline(viewer.Id, lifetime.Token);
        var reconnect = Action("Revenir à la connexion", () =>
        {
            offlineMode = false;
            PageContent.Children.Clear();
            LibraryShell.Visibility = Visibility.Collapsed;
            LoginShell.Visibility = Visibility.Visible;
        });
        reconnect.HorizontalAlignment = HorizontalAlignment.Left;
        reconnect.Margin = new Thickness(0, 18, 0, 0);
        PageContent.Children.Add(reconnect);
        ApplyContentMargins();
    }

    private void OfferOffline(Viewer viewer)
    {
        offlineViewer = viewer;
        OfflineButton.Visibility = ReadOffline(viewer.Id).Count > 0 ? Visibility.Visible : Visibility.Collapsed;
    }
}
