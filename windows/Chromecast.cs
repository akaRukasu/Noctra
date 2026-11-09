using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Noctra.Windows;

internal sealed record CastDevice(string Name, IPAddress Address, int Port = 8009);

internal static class CastDiscovery
{
    internal static async Task<CastDevice[]> Find(CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        using var udp = new UdpClient(AddressFamily.InterNetwork);
        udp.Client.Bind(new IPEndPoint(IPAddress.Any, 0));
        using var packet = new MemoryStream();
        packet.Write(new byte[] { 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0 });
        foreach (var label in "_googlecast._tcp.local".Split('.'))
        {
            var bytes = Encoding.ASCII.GetBytes(label);
            packet.WriteByte((byte)bytes.Length);
            packet.Write(bytes);
        }
        packet.Write(new byte[] { 0, 0, 12, 128, 1 });
        await udp.SendAsync(packet.ToArray(), new IPEndPoint(IPAddress.Parse("224.0.0.251"), 5353), timeout.Token);
        var addresses = new Dictionary<string, IPAddress>(StringComparer.OrdinalIgnoreCase);
        var services = new Dictionary<string, (string Host, int Port)>(StringComparer.OrdinalIgnoreCase);
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            while (!timeout.IsCancellationRequested)
            {
                var received = await udp.ReceiveAsync(timeout.Token);
                var data = received.Buffer;
                if (data.Length < 12) continue;
                var questions = BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(4));
                var records = BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(6)) +
                    BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(8)) + BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(10));
                var offset = 12;
                for (var index = 0; index < questions; index++) { ReadName(data, ref offset); offset += 4; }
                for (var index = 0; index < records && offset < data.Length; index++)
                {
                    var name = ReadName(data, ref offset);
                    if (offset + 10 > data.Length) break;
                    var type = BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(offset));
                    var length = BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(offset + 8));
                    offset += 10;
                    if (offset + length > data.Length) break;
                    if (type == 1 && length == 4) addresses[name] = new IPAddress(data.AsSpan(offset, 4));
                    if (type == 33 && length >= 7)
                    {
                        var cursor = offset + 6;
                        var host = ReadName(data, ref cursor);
                        services[name] = (host, BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(offset + 4)));
                    }
                    if (type == 16)
                    {
                        var cursor = offset;
                        while (cursor < offset + length)
                        {
                            var size = data[cursor++];
                            if (cursor + size > offset + length) break;
                            var text = Encoding.UTF8.GetString(data, cursor, size);
                            if (text.StartsWith("fn=", StringComparison.Ordinal)) names[name] = text[3..];
                            cursor += size;
                        }
                    }
                    offset += length;
                }
            }
        }
        catch (Exception error) when (error is OperationCanceledException or SocketException or InvalidDataException or ArgumentOutOfRangeException) { }
        return services.Where(entry => addresses.ContainsKey(entry.Value.Host))
            .Select(entry => new CastDevice(names.GetValueOrDefault(entry.Key) ?? entry.Key.Split('.')[0],
                addresses[entry.Value.Host], entry.Value.Port)).Where(device => Local(device.Address)).ToArray();
    }

    internal static bool Local(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;
        var bytes = address.GetAddressBytes();
        return IPAddress.IsLoopback(address) || bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 ||
            bytes[0] == 172 && bytes[1] is >= 16 and <= 31 || bytes[0] == 169 && bytes[1] == 254;
    }

    private static string ReadName(byte[] bytes, ref int offset, int depth = 0)
    {
        if (depth > 16) throw new InvalidDataException();
        var labels = new List<string>();
        while (offset < bytes.Length && labels.Count < 128)
        {
            var count = bytes[offset++];
            if (count == 0) return string.Join(".", labels);
            if ((count & 192) == 192)
            {
                if (offset >= bytes.Length) throw new InvalidDataException();
                var pointer = ((count & 63) << 8) | bytes[offset++];
                labels.Add(ReadName(bytes, ref pointer, depth + 1));
                return string.Join(".", labels);
            }
            if (count > 63 || offset + count > bytes.Length) throw new InvalidDataException();
            labels.Add(Encoding.UTF8.GetString(bytes, offset, count));
            offset += count;
        }
        throw new InvalidDataException();
    }
}

internal sealed class Chromecast : IDisposable
{
    private const string Prefix = "urn:x-cast:com.google.cast.";
    private const string Receiver = Prefix + "receiver";
    private const string Media = Prefix + "media";
    private const string Connection = Prefix + "tp.connection";
    private const string Heartbeat = Prefix + "tp.heartbeat";
    private readonly TcpClient tcp = new() { NoDelay = true };
    private readonly CancellationTokenSource lifetime = new();
    private readonly SemaphoreSlim writeGate = new(1);
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private SslStream? channel;
    private string? transport;
    private object? load;
    private int request;
    private int mediaSession;
    internal string State { get; private set; } = "Connexion…";
    internal double Position { get; private set; }
    internal event Action? Updated;

    internal async Task Start(CastDevice target, Uri url, string title, string contentType, bool live, double position, CancellationToken cancellation)
    {
        if (!CastDiscovery.Local(target.Address) || target.Port is < 1 or > 65535) throw new InvalidOperationException("Adresse locale du récepteur requise.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(18));
        load = new
        {
            type = "LOAD", autoplay = true, currentTime = position,
            media = new
            {
                contentId = url.AbsoluteUri, contentType, streamType = live ? "LIVE" : "BUFFERED",
                metadata = new { metadataType = 0, title }
            }
        };
        await tcp.ConnectAsync(target.Address, target.Port, timeout.Token);
        channel = new SslStream(tcp.GetStream(), false, (_, _, _, _) => true);
        await channel.AuthenticateAsClientAsync(new SslClientAuthenticationOptions { TargetHost = target.Address.ToString() }, timeout.Token);
        _ = ReadLoop();
        _ = PingLoop();
        await Send(Connection, "receiver-0", new { type = "CONNECT" });
        await Send(Receiver, "receiver-0", new { type = "LAUNCH", appId = "CC1AD845" });
        await ready.Task.WaitAsync(timeout.Token);
    }

    internal Task Command(string command) => transport == null || mediaSession == 0 ? Task.CompletedTask :
        Send(Media, transport, new { type = command, mediaSessionId = mediaSession });

    private async Task PingLoop()
    {
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                await Task.Delay(5000, lifetime.Token);
                await Send(Heartbeat, "receiver-0", new { type = "PING" });
                if (transport != null) await Send(Media, transport, new { type = "GET_STATUS", mediaSessionId = mediaSession });
            }
        }
        catch (Exception error) when (error is OperationCanceledException or IOException or ObjectDisposedException) { }
    }

    private async Task ReadLoop()
    {
        try
        {
            var header = new byte[4];
            while (!lifetime.IsCancellationRequested && channel != null)
            {
                await channel.ReadExactlyAsync(header, lifetime.Token);
                var size = BinaryPrimitives.ReadInt32BigEndian(header);
                if (size is < 1 or > 1_000_000) throw new InvalidDataException();
                var frame = new byte[size];
                await channel.ReadExactlyAsync(frame, lifetime.Token);
                var fields = Decode(frame);
                if (!fields.TryGetValue(6, out var text)) continue;
                using var data = JsonDocument.Parse(text);
                var payload = data.RootElement;
                switch (payload.Str("type"))
                {
                    case "PING":
                        await Send(Heartbeat, fields.GetValueOrDefault(2) ?? "receiver-0", new { type = "PONG" });
                        break;
                    case "RECEIVER_STATUS":
                        var app = payload.Field("status").List("applications").FirstOrDefault(item => item.Str("appId") == "CC1AD845");
                        var destination = app.Str("transportId");
                        if (destination.Length == 0 || destination == transport) break;
                        transport = destination;
                        await Send(Connection, transport, new { type = "CONNECT" });
                        if (load != null) { await Send(Media, transport, load); load = null; }
                        break;
                    case "MEDIA_STATUS":
                        var status = payload.List("status").FirstOrDefault();
                        mediaSession = (int)status.Num("mediaSessionId");
                        Position = status.Num("currentTime");
                        State = status.Str("playerState");
                        if (State is "PLAYING" or "PAUSED") ready.TrySetResult();
                        if (status.Str("idleReason") == "ERROR") ready.TrySetException(new InvalidOperationException("Le récepteur n’a pas pu lire ce flux."));
                        Updated?.Invoke();
                        break;
                    case "LAUNCH_ERROR":
                    case "LOAD_FAILED":
                        ready.TrySetException(new InvalidOperationException("Le récepteur a refusé la lecture."));
                        break;
                }
            }
        }
        catch (Exception error) when (error is IOException or OperationCanceledException or JsonException or ObjectDisposedException)
        {
            ready.TrySetException(new InvalidOperationException("Connexion au récepteur interrompue."));
            State = "Déconnecté";
            Updated?.Invoke();
        }
    }

    private async Task Send(string ns, string target, object body)
    {
        if (channel == null) return;
        var json = JsonSerializer.SerializeToElement(body);
        var values = json.EnumerateObject().ToDictionary(property => property.Name, property => (object)property.Value);
        values["requestId"] = Interlocked.Increment(ref request);
        using var message = new MemoryStream();
        message.Write(new byte[] { 8, 0 });
        WriteString(message, 2, "sender-0");
        WriteString(message, 3, target);
        WriteString(message, 4, ns);
        message.Write(new byte[] { 40, 0 });
        WriteString(message, 6, JsonSerializer.Serialize(values));
        var content = message.ToArray();
        var frame = new byte[content.Length + 4];
        BinaryPrimitives.WriteInt32BigEndian(frame, content.Length);
        content.CopyTo(frame, 4);
        await writeGate.WaitAsync(lifetime.Token);
        try { await channel.WriteAsync(frame, lifetime.Token); }
        finally { writeGate.Release(); }
    }

    private static void WriteString(Stream stream, int field, string value)
    {
        var data = Encoding.UTF8.GetBytes(value);
        stream.WriteByte((byte)((field << 3) | 2));
        var size = data.Length;
        while (size >= 128) { stream.WriteByte((byte)((size & 127) | 128)); size >>= 7; }
        stream.WriteByte((byte)size);
        stream.Write(data);
    }

    private static Dictionary<int, string> Decode(byte[] bytes)
    {
        var fields = new Dictionary<int, string>();
        var cursor = 0;
        int Read()
        {
            var result = 0;
            for (var shift = 0; shift < 32 && cursor < bytes.Length; shift += 7)
            {
                var value = bytes[cursor++];
                result |= (value & 127) << shift;
                if ((value & 128) == 0) return result;
            }
            throw new InvalidDataException();
        }
        while (cursor < bytes.Length)
        {
            var key = Read();
            if ((key & 7) == 0) { Read(); continue; }
            if ((key & 7) != 2) throw new InvalidDataException();
            var length = Read();
            if (length < 0 || cursor + length > bytes.Length) throw new InvalidDataException();
            fields[key >> 3] = Encoding.UTF8.GetString(bytes, cursor, length);
            cursor += length;
        }
        return fields;
    }

    public void Dispose()
    {
        lifetime.Cancel();
        channel?.Dispose();
        tcp.Dispose();
    }
}
