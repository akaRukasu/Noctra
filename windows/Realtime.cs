using System;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Noctra.Windows;

// 0.7 : connexion temps réel à Jellyfin (WebSocket « socket »), nécessaire à SyncPlay et à la
// télécommande depuis un autre appareil. Authentification par l'en-tête Authorization (le jeton
// n'apparaît jamais dans l'adresse) ; reconnexion automatique avec attente croissante.
internal sealed class JellyfinSocket(Jellyfin account, Action<string, JsonElement> received, Action<bool> connectionChanged)
{
    private readonly CancellationTokenSource stop = new();
    private readonly SemaphoreSlim sending = new(1);
    private ClientWebSocket? socket;
    internal bool Connected => socket?.State == WebSocketState.Open;

    internal static Uri Address(Uri root, string deviceId) =>
        new UriBuilder(new Uri(root, "socket"))
        {
            Scheme = root.Scheme == "https" ? "wss" : "ws",
            Query = "deviceId=" + Uri.EscapeDataString(deviceId)
        }.Uri;

    internal void Start() => _ = Run();

    private async Task Run()
    {
        var delay = 2;
        while (!stop.IsCancellationRequested)
        {
            var current = new ClientWebSocket();
            current.Options.SetRequestHeader("Authorization", Jellyfin.Authorization(account.DeviceId, account.Token));
            current.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
            try
            {
                using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token))
                {
                    timeout.CancelAfter(TimeSpan.FromSeconds(12));
                    await current.ConnectAsync(Address(account.Root, account.DeviceId), timeout.Token);
                }
                socket = current;
                delay = 2;
                connectionChanged(true);
                await Receive(current);
            }
            catch (Exception error) when (error is WebSocketException or OperationCanceledException or HttpRequestException or
                                          InvalidOperationException or JsonException or IOException) { }
            finally
            {
                if (socket == current)
                {
                    socket = null;
                    connectionChanged(false);
                }
                current.Dispose();
            }
            if (stop.IsCancellationRequested) return;
            try { await Task.Delay(TimeSpan.FromSeconds(delay), stop.Token); }
            catch (OperationCanceledException) { return; }
            delay = Math.Min(delay * 2, 60);
        }
    }

    private async Task Receive(ClientWebSocket current)
    {
        var buffer = new byte[16 * 1024];
        using var message = new MemoryStream();
        Timer? keepAlive = null;
        try
        {
            while (current.State == WebSocketState.Open && !stop.IsCancellationRequested)
            {
                var result = await current.ReceiveAsync(buffer, stop.Token);
                if (result.MessageType == WebSocketMessageType.Close) return;
                message.Write(buffer, 0, result.Count);
                if (message.Length > 2_000_000) return;
                if (!result.EndOfMessage) continue;
                JsonElement root;
                try
                {
                    using var document = JsonDocument.Parse(message.ToArray());
                    root = document.RootElement.Clone();
                }
                catch (JsonException) { message.SetLength(0); continue; }
                message.SetLength(0);
                var type = root.Str("MessageType");
                var data = root.Field("Data");
                if (type == "ForceKeepAlive")
                {
                    // Le serveur indique son délai d'inactivité : message de maintien à mi-délai.
                    var seconds = Math.Clamp(data.TryNumber() is > 0 and var value ? value / 2 : 30, 5, 60);
                    keepAlive?.Dispose();
                    keepAlive = new Timer(_ => _ = Send(new { MessageType = "KeepAlive" }), null,
                        TimeSpan.FromSeconds(seconds), TimeSpan.FromSeconds(seconds));
                    await Send(new { MessageType = "KeepAlive" });
                }
                else if (type.Length > 0 && type != "KeepAlive") received(type, data);
            }
        }
        finally { keepAlive?.Dispose(); }
    }

    internal async Task Send(object body)
    {
        var current = socket;
        if (current?.State != WebSocketState.Open) return;
        try
        {
            await sending.WaitAsync(stop.Token);
            try { await current.SendAsync(JsonSerializer.SerializeToUtf8Bytes(body), WebSocketMessageType.Text, true, stop.Token); }
            finally { sending.Release(); }
        }
        catch (Exception error) when (error is WebSocketException or OperationCanceledException or ObjectDisposedException or IOException) { }
    }

    internal void Close()
    {
        stop.Cancel();
        try { socket?.Abort(); }
        catch (Exception error) when (error is ObjectDisposedException or InvalidOperationException) { }
    }
}
