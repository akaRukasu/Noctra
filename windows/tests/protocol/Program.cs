using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Noctra.Windows;

using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
using var rsa = RSA.Create(2048);
var certificateRequest = new CertificateRequest("CN=Noctra protocol fixture", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
using var created = certificateRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
using var certificate = X509CertificateLoader.LoadPkcs12(created.Export(X509ContentType.Pfx), null, X509KeyStorageFlags.UserKeySet);
using var listener = new TcpListener(IPAddress.Loopback, 0);
listener.Start();
var port = ((IPEndPoint)listener.LocalEndpoint).Port;
var messages = new List<JsonElement>();
var server = Task.Run(async () =>
{
    using var client = await listener.AcceptTcpClientAsync(timeout.Token);
    using var tls = new SslStream(client.GetStream());
    await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate }, timeout.Token);
    while (!timeout.IsCancellationRequested)
    {
        var header = new byte[4];
        await tls.ReadExactlyAsync(header, timeout.Token);
        var frame = new byte[BinaryPrimitives.ReadInt32BigEndian(header)];
        await tls.ReadExactlyAsync(frame, timeout.Token);
        var payload = ReadPayload(frame);
        using var document = JsonDocument.Parse(payload);
        var message = document.RootElement.Clone();
        messages.Add(message);
        var kind = message.GetProperty("type").GetString();
        if (kind == "LAUNCH")
        {
            Check(message.GetProperty("appId").GetString() == "CC1AD845", "Wrong receiver app");
            await Write(tls, new { type = "RECEIVER_STATUS", status = new
            {
                applications = new[] { new { appId = "CC1AD845", transportId = "transport-fixture", sessionId = "fixture" } }
            } });
        }
        if (kind == "LOAD")
        {
            Check(message.GetProperty("media").GetProperty("contentId").GetString() == "https://media.example.invalid/test.m3u8", "Missing media URL");
            Check(message.GetProperty("media").GetProperty("contentType").GetString() == "application/x-mpegURL", "Incorrect HLS MIME type");
            await Write(tls, new { type = "MEDIA_STATUS", status = new[] { new { mediaSessionId = 31, playerState = "PLAYING", currentTime = 42.5 } } });
        }
        if (kind == "PAUSE")
        {
            Check(message.GetProperty("mediaSessionId").GetInt32() == 31, "Incorrect remote session");
            await Write(tls, new { type = "MEDIA_STATUS", status = new[] { new { mediaSessionId = 31, playerState = "PAUSED", currentTime = 44.0 } } });
        }
        if (kind == "STOP") return;
    }
}, timeout.Token);
using var cast = new Chromecast();
try { await cast.Start(new CastDevice("Fixture", IPAddress.Loopback, port), new Uri("https://media.example.invalid/test.m3u8"), "Test",
    "application/x-mpegURL", false, 42.5, timeout.Token); } catch { if (server.IsFaulted) Console.WriteLine(server.Exception!.GetBaseException().Message); throw; }
Check(cast.State == "PLAYING" && cast.Position == 42.5, "Receiver status not propagated");
await cast.Command("PAUSE");
for (var index = 0; index < 30 && cast.State != "PAUSED"; index++) await Task.Delay(50, timeout.Token);
Check(cast.State == "PAUSED", "Pause command not acknowledged");
await cast.Command("STOP");
await server;
Check(!CastDiscovery.Local(IPAddress.Parse("8.8.8.8")) && CastDiscovery.Local(IPAddress.Parse("192.168.1.42")), "Receiver network boundary failed");
Check(AdProtection.Blocked(new Uri("https://pagead2.googlesyndication.com/pagead.js")), "Advertising host was not blocked");
Check(AdProtection.Blocked(new Uri("https://player.example/ads/banner.js")), "Advertising path was not blocked");
Check(!AdProtection.Blocked(new Uri("https://player.example/video/adventure.m3u8")), "A legitimate video path was blocked");
Check(AdProtection.Blocked(new Uri("https://thatdisform.cyou/banner.png")), "DLStreams in-page advertisement was not blocked");
Check(!AdProtection.Blocked(new Uri("https://doubleclick.net.example/video.m3u8")), "Domain suffix match is too broad");
Check(AdProtection.Blocked(new Uri("https://noctra.example/api/tv/oha/http/test?url=https%3A%2F%2Fpopads.net%2Fscript.js")), "An advertising request bypassed filtering through a proxy");
Check(!AdProtection.Blocked(new Uri("https://noctra.example/api/tv/oha/http/test?url=https%3A%2F%2Fvideo.example%2Fplaylist.m3u8")), "A proxied video was blocked");
Check(!MainWindow.SportsEntry(new TvSource("livewatch", "LiveWatch", "livewatch", "channels"), new TvEntry("TF1", null,null,null,null,null,null,null,null,false,JsonSerializer.SerializeToElement("channel-id"))), "A LiveWatch channel was classified as sport by eventId");
var webRoot = new Uri("https://noctra.example/noctra/");
var webService = new NoctraService(new Jellyfin(new Uri("https://jellyfin.example/"), "qa", new Viewer("qa-user", "QA"), "private-qa-token"), webRoot);
Check(webService.WebToken(new Uri(webRoot,"api/tv/embed/test")) == "private-qa-token", "A protected TV page did not receive its session");
Check(webService.WebToken(new Uri(webRoot,"api/tv/livewatch/vip/test/embed")) == "private-qa-token", "LiveWatch's VIP bridge is blocked");
Check(!webService.AllowWebRequest(new Uri(webRoot,"api/tv/livewatch/session")), "A provider can access LiveWatch account administration");
Check(webService.WebToken(new Uri("https://other.example/noctra/api/tv/embed/test")) == null, "Session leaked to another origin");
Check(!webService.AllowWebRequest(new Uri(webRoot,"api/files/roots")), "A provider page can reach management APIs");
Check(webService.WebToken(new Uri(webRoot,"api/files/roots")) == null, "Session leaked to a management API from a provider page");
Console.WriteLine("OK · Cast TLS, HLS load, remote commands, address boundary, advertising rules and external-player credential isolation.");

foreach (var (first, second) in new[] { ("FR: TF1 FHD .b", "tf1 [HD]"), ("beIN Sport 1 France", "BEIN SPORTS 1 · SAT · HD"),
    ("13ème Rue HD", "13 EME RUE .s"), ("C+ Sport HD", "Canal+ Sport"), ("BFM TV", "BFMTV"), ("Chasse & Pêche", "Chasse et Peche") })
    Check(TvIdentity.Key(first) == TvIdentity.Key(second), $"Channel variants are not grouped: {first} / {second}");
foreach (var (first, second) in new[] { ("TF1", "TF1 Séries Films"), ("Canal+", "Canal+ Sport"), ("Canal+ Sport", "Canal+ Foot"),
    ("beIN Sports 1", "beIN Sports 2"), ("France 2", "France 3"), ("DE: Eurosport 1", "FR: Eurosport 1") })
    Check(TvIdentity.Key(first) != TvIdentity.Key(second), $"Different channels merged: {first} / {second}");
TvEntry Entry(string name) => new(name,null,null,null,null,null,"/api/tv/resolve/" + name,null,null,false,null);
var variants = Enumerable.Range(0, 18).Select(index => (new TvSource("source-" + index,"Source " + index,null,"channels"), Entry("TF1 HD (" + index + ")"))).ToArray();
var grouped = TvIdentity.Group(variants, false);
Check(grouped.Length == 1 && grouped[0].Entries.Length == 18,"Some channel variants were discarded");
var typo = TvIdentity.Group(new[] { (variants[0].Item1, Entry("Ciné+ Premier")), (variants[1].Item1, Entry("Cineplus Premeir HD")) }, false);
Check(typo.Length == 1 && typo[0].Entries.Length == 2,"An approximate long channel name was not grouped");
Console.WriteLine("OK · TV name aliases, countries, channel numbers, approximate spelling and 18 preserved variants.");
foreach (var (entry, expected) in new[]
{
    (Entry("TF1"),"fr"), (Entry("beIN Sports 1 FHD") with { IptvOrgCountry="QA" },"fr"),
    (Entry("BBC One") with { Country="France", IptvOrgCountry="GB" },"uk"),
    (Entry("La Une") with { Country="France" },"be"), (Entry("RTS Deux"),"ch"),
    (Entry("Africa 24") with { Country="France" },"afrique"), (Entry("TVA"),"ca"),
    (Entry("DE: Eurosport 1"),"de"), (Entry("ZDF") with { Group="Germany" },"de"),
    (Entry("Mystère TV"),"zz"), (Entry("ARTE") with { Country="Germany" },"de")
}) Check(TvCountry.Of(entry)==expected,"Incorrect TV country: "+entry.Name+" / "+TvCountry.Of(entry));
Check(TvCountry.Group("United Kingdom · Généralistes")=="uk" && TvCountry.Group("France · cinéma")=="fr","Bouquet country not detected");
Check(TvCountry.Group("🇩🇪")=="de","Flag-only bouquet country not detected");
Console.WriteLine("OK · French brands, country metadata, foreign French-language channels, bouquet countries and unknown countries.");

static void Check(bool valid, string message) { if (!valid) throw new InvalidOperationException(message); }
static string ReadPayload(byte[] data)
{
    var position = 0;
    int Varint()
    {
        var number = 0;
        for (var shift = 0; shift < 32; shift += 7)
        {
            var part = data[position++];
            number |= (part & 127) << shift;
            if ((part & 128) == 0) return number;
        }
        throw new InvalidDataException();
    }
    while (position < data.Length)
    {
        var tag = Varint();
        if ((tag & 7) == 0) { Varint(); continue; }
        var count = Varint();
        var text = Encoding.UTF8.GetString(data, position, count);
        position += count;
        if ((tag >> 3) == 6) return text;
    }
    throw new InvalidDataException();
}
static async Task Write(SslStream stream, object value)
{
    using var message = new MemoryStream();
    message.Write(new byte[] { 8, 0 });
    void Field(int index, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        message.WriteByte((byte)((index << 3) | 2));
        var count = bytes.Length;
        while (count >= 128) { message.WriteByte((byte)((count & 127) | 128)); count >>= 7; }
        message.WriteByte((byte)count);
        message.Write(bytes);
    }
    Field(2, "receiver-0");
    Field(3, "sender-0");
    Field(4, "urn:x-cast:com.google.cast.media");
    message.Write(new byte[] { 40, 0 });
    Field(6, JsonSerializer.Serialize(value));
    var payload = message.ToArray();
    var frame = new byte[4 + payload.Length];
    BinaryPrimitives.WriteInt32BigEndian(frame, payload.Length);
    payload.CopyTo(frame, 4);
    await stream.WriteAsync(frame);
}

