using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Chromecast? cast;
    private JellyfinPlayback? castReport;
    private string castTitle = "";
    private bool castStarted;
    private DateTime nextCastReport;

    private void OpenCast(object sender, RoutedEventArgs args)
    {
        var item = pendingMedia;
        var live = pendingLive?.Streams.FirstOrDefault();
        if (item != null && active is { } state)
            item = item with { UserData = new WatchData(item.UserData?.Played == true,
                (long)(state.Position * TimeSpan.TicksPerSecond), item.UserData?.IsFavorite == true) };
        if (item != null || live != null) FinishPlayback();
        _ = Navigate(CastPage(item, live, MediaTitle.Text));
    }

    private Page CastPage(MediaItem? item = null, LiveStream? live = null, string? liveTitle = null) =>
        new("Diffuser", ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        var title = item?.DisplayTitle ?? liveTitle ?? "Votre contenu";
        PageContent.Children.Add(Heading("Diffuser sur un autre écran", title));
        if (cast != null)
        {
            PageContent.Children.Add(Message(castTitle + " · " + cast.State));
            var controls = new WrapPanel();
            foreach (var (command, label) in new[] { ("PLAY", "Lire"), ("PAUSE", "Pause"), ("STOP", "Arrêter la diffusion") })
            {
                var button = Action(label, async () =>
                {
                    try
                    {
                        if (cast != null) await cast.Command(command);
                        if (command == "STOP") await EndCast();
                    }
                    catch (Exception error) when (error is System.IO.IOException or OperationCanceledException)
                    { ShowStatus("La connexion avec le récepteur est interrompue."); }
                });
                button.Margin = new Thickness(0, 0, 8, 8);
                controls.Children.Add(button);
            }
            PageContent.Children.Add(controls);
        }
        if (item == null && live == null)
        {
            var resume = await account.Resume(cancellation);
            if (cancellation.IsCancellationRequested) return;
            foreach (var media in resume.Take(6))
                PageContent.Children.Add(Row(media.DisplayTitle, media.Caption, Action("Choisir", () => _ = Navigate(CastPage(media)))));
            if (resume.Length == 0) PageContent.Children.Add(Message("Ouvrez la fiche d’un titre puis choisissez « Diffuser »."));
            return;
        }
        var status = Message("Recherche de récepteurs Chromecast sur le réseau local…");
        PageContent.Children.Add(status);
        CastDevice[] devices = [];
        try { devices = await CastDiscovery.Find(cancellation); }
        catch (Exception error) when (error is System.Net.Sockets.SocketException or OperationCanceledException) { }
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Remove(status);
        foreach (var device in devices)
            PageContent.Children.Add(Row(device.Name, device.Address.ToString(),
                Action("Diffuser", () => _ = StartCasting(account, device, item, live, title, cancellation), "Primary")));
        var manual = Action("Ajouter un Chromecast par adresse IP", () =>
        {
            var input = AskText("Récepteur Chromecast", "Adresse IP locale");
            if (IPAddress.TryParse(input, out var address) && CastDiscovery.Local(address))
                _ = StartCasting(account, new CastDevice("Chromecast", address), item, live, title, cancellation);
            else if (input != null) ShowStatus("Indiquez l’adresse IP locale du récepteur.");
        });
        manual.HorizontalAlignment = HorizontalAlignment.Left;
        manual.Margin = new Thickness(0, 10, 0, 18);
        PageContent.Children.Add(manual);
        if (item == null) return;
        PageContent.Children.Add(Text("Appareils Jellyfin connectés à votre compte", 21, true));
        var sessions = await account.ReadJson("Sessions?UserId=" + account.User.Id, cancellation);
        if (cancellation.IsCancellationRequested) return;
        foreach (var session in sessions.List().Where(session => session.Str("UserId") == account.User.Id &&
            session.Str("DeviceId") != account.DeviceId && session.Flag("SupportsRemoteControl")))
        {
            var target = session.Str("Id");
            if (!PlayRequest.Identifier(target)) continue;
            PageContent.Children.Add(Row(session.Str("DeviceName"), session.Str("Client"), Action("Lire sur cet appareil", async () =>
            {
                try
                {
                    await account.Command("Sessions/" + target + "/Playing?PlayCommand=PlayNow&ItemIds=" + item.Id +
                        "&StartPositionTicks=" + item.Resume, null, cancellation);
                    if (!cancellation.IsCancellationRequested) ShowStatus("Lecture envoyée à l’appareil.");
                }
                catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
                { if (!cancellation.IsCancellationRequested) ShowStatus("L’appareil n’a pas accepté la lecture."); }
            })));
        }
    });

    private async Task StartCasting(Jellyfin account, CastDevice target, MediaItem? item, LiveStream? live, string title, CancellationToken cancellation)
    {
        ShowStatus("Préparation de la diffusion…");
        Chromecast? current = null;
        try
        {
            await EndCast();
            Uri url;
            string contentType;
            JellyfinPlayback? report = null;
            if (item != null)
            {
                var request = new PlayRequest(item.Id, account.User.Id, account.Token, account.DeviceId, item.Resume);
                report = new JellyfinPlayback(Jellyfin.Http, account.Root, request);
                url = await report.Prepare(cancellation, cast: true);
                var builder = new UriBuilder(url);
                if (!builder.Query.Contains("api_key=", StringComparison.OrdinalIgnoreCase) &&
                    !builder.Query.Contains("apikey=", StringComparison.OrdinalIgnoreCase))
                    builder.Query = builder.Query.TrimStart('?') + "&api_key=" + Uri.EscapeDataString(account.Token);
                url = builder.Uri;
                contentType = report.Method == "Transcode" ? "application/x-mpegURL" : url.AbsolutePath.EndsWith(".webm") ? "video/webm" : "video/mp4";
            }
            else
            {
                if (live == null || account.NoctraRoot == null) return;
                var service = new NoctraService(account, account.NoctraRoot);
                var grant = await service.Send("api/tv/cast", "POST", new { url = live.Url.AbsoluteUri }, cancellation);
                url = service.Link(grant.Str("url")) ?? throw new InvalidOperationException("Le serveur ne propose pas d’adresse de diffusion.");
                contentType = "application/x-mpegURL";
            }
            current = new Chromecast();
            cast = current;
            castReport = report;
            castTitle = title;
            castStarted = false;
            nextCastReport = DateTime.MinValue;
            current.Updated += () => _ = Dispatcher.InvokeAsync(() =>
            {
                if (cast != current) return;
                if (!castStarted && current.State is "PLAYING" or "PAUSED")
                {
                    castStarted = true;
                    if (castReport != null) _ = castReport.Report("", current.Position, current.State == "PAUSED");
                }
                else if (castStarted && nextCastReport <= DateTime.UtcNow && castReport != null)
                {
                    nextCastReport = DateTime.UtcNow.AddSeconds(8);
                    _ = castReport.Report("/Progress", current.Position, current.State == "PAUSED");
                }
            });
            await current.Start(target, url, title, contentType, item == null, item?.Resume / (double)TimeSpan.TicksPerSecond ?? 0, cancellation);
            if (cancellation.IsCancellationRequested) return;
            ShowStatus("Diffusion sur " + target.Name + ".");
            await Navigate(CastPage(item, live, title), back: true);
        }
        catch (Exception error) when (error is HttpRequestException or System.IO.IOException or OperationCanceledException or
            System.Net.Sockets.SocketException or System.Security.Authentication.AuthenticationException or InvalidOperationException)
        {
            if (cast == current) { current?.Dispose(); cast = null; castReport = null; }
            if (!cancellation.IsCancellationRequested) ShowStatus("La diffusion n’a pas démarré. Vérifiez le récepteur, le réseau et la compatibilité du flux.");
        }
    }

    private async Task EndCast()
    {
        var current = cast;
        var report = castReport;
        cast = null;
        castReport = null;
        if (current == null) return;
        try { await current.Command("STOP").WaitAsync(TimeSpan.FromSeconds(3)); }
        catch (Exception error) when (error is System.IO.IOException or OperationCanceledException or TimeoutException) { }
        if (castStarted && report != null) await report.Report("/Stopped", current.Position, current.State == "PAUSED");
        current.Dispose();
        castStarted = false;
    }
}
