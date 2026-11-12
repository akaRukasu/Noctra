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
// 0.8 : regroupement « Toutes les chaînes » du serveur (noctra-tv-unified.js 200.0.181), cas du test v200181-tv-unified-identity-logos.mjs.
TvEntry Unified(string name, string id, string? country = "France", string? iptvName = null, string? iptvId = null) =>
    new(name, null, country, null, null, null, "/resolve/" + id, null, null, false, null, IptvOrgId: iptvId, Id: JsonSerializer.SerializeToElement(id), IptvOrgName: iptvName);
TvSource UnifiedSource(string id) => new(id, id, null, "channels");
var cards = TvUnified.Merge(new[]
{
    (UnifiedSource("bowdtv-guide"), new[] { Unified("Ciné+ Club","cine"), Unified("CANAL+ FAMILY","family"), Unified("BFM Paris Île-de-France","bfm"), Unified("TÉLÉTOON+","teletoon"),
        Unified("Disney+","disneyplus"), Unified("Cartoon Network","cartoon"), Unified("Disney Channel","disney"), Unified("beIN SPORTS 1","bein1"), Unified("beIN SPORTS 2","bein2"),
        Unified("English Club TV AF","english-af"), Unified("English Club TV Réunion","english-reu"), Unified("Antenne Réunion","antenne"),
        Unified("France 3 Bretagne","f3b"), Unified("France 3","f3"), Unified("Euronews","bowd-euronews"), Unified("Eurosport 1","eurosport") }),
    (UnifiedSource("oha-live"), new[] { Unified("CINE CLUB","other-cine",iptvName:"Cine+ Club",iptvId:"CinePlusClub.fr"), Unified("CANAL FAMILY","other-family"),
        Unified("BFM PARIS","other-bfm",iptvName:"BFM Paris Ile-de-France",iptvId:"BFMParisIledeFrance.fr"), Unified("TELETOON+","other-teletoon",iptvName:"Cartoon Network",iptvId:"CartoonNetwork.ca"),
        Unified("DISNEY+","other-disney",iptvName:"Disney Channel",iptvId:"DisneyChannel.be"), Unified("AR: beIN Sports 1","other-bein","QA"), Unified("Euronews HD","oha-euronews"),
        Unified("EUROSPORT 1 EN FRANÇAIS","eurosport-fr"), Unified("Sport en France","sport-en-france") }),
    (UnifiedSource("livewatch-daddy"), new[] { Unified("Euronews French","daddy-euronews"), Unified("Euronews English","daddy-euronews-en","GB"), Unified("Eurosport 1 in French HD","eurosport-in") })
});
TvUnifiedChannel Card(string id) => cards.First(card => card.Entries.Any(pair => pair.Entry.Id?.GetString() == id));
foreach (var (first, second) in new[] { ("cine","other-cine"), ("family","other-family"), ("bfm","other-bfm"), ("teletoon","other-teletoon"), ("disneyplus","other-disney"), ("english-af","english-reu"),
    ("bowd-euronews","daddy-euronews"), ("bowd-euronews","oha-euronews"), ("eurosport","eurosport-fr"), ("eurosport","eurosport-in") })
    Check(Card(first) == Card(second), $"Same channel on two cards: {first} / {second}");
foreach (var (first, second) in new[] { ("teletoon","cartoon"), ("disneyplus","disney"), ("bein1","bein2"), ("bein1","other-bein"), ("f3","f3b"), ("daddy-euronews","daddy-euronews-en") })
    Check(Card(first) != Card(second), $"Different channels merged: {first} / {second}");
Check(Card("teletoon").Name.Contains("télétoon", StringComparison.OrdinalIgnoreCase) && Card("disneyplus").Name.Contains("Disney+", StringComparison.OrdinalIgnoreCase), "Display names differ from the web");
Check(Card("antenne").Name == "Antenne Réunion" && Card("english-af").Name == "English Club TV", "Regional names differ from the web");
Check(Card("english-af").Variants.Count == 2 && Card("sport-en-france").Name == "Sport en France", "BowdTV variants or « Sport en France » differ from the web");
Check(TvUnified.UnifiedName("13 EME RUE HD") == TvUnified.UnifiedName("13ème Rue") && TvUnified.UnifiedName("SPORTenFRANCE") == TvUnified.UnifiedName("Sport en France"), "Name rules differ from the web");
Check(cards.Where(TvUnified.IsFrench).GroupBy(card => TvUnified.UnifiedName(card.Name)).All(group => group.Count() == 1), "Duplicate French cards");
foreach (var group in new[] { new[] { "beIN Sports Francais 1", "beIN SPORTS 1", "BEIN SPORTS FRENCH 1 HD", "beIN Sports 1 France", "beIN Sports en français 1" }, new[] { "beIN Sports Francais 2", "beIN Sports 2" } })
    Check(group.Select(TvUnified.UnifiedName).Distinct().Count() == 1, "French beIN variants not merged: " + string.Join(" / ", group));
foreach (var (first, second) in new[] { ("France 2", "France 3"), ("France 2", "France 5"), ("RMC Sport 1", "RMC Sport 2"), ("Sport en France", "Sport") })
    Check(TvUnified.UnifiedName(first) != TvUnified.UnifiedName(second), $"Different channels merged: {first} / {second}");
Console.WriteLine("OK · « Toutes les chaînes » regroupées comme le Web et la PWA 200.0.181, « en français » compris.");

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

