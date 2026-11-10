using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Noctra.Windows;

// 0.8 : visuels plus rapides.
// - Cache disque des images (fichiers compressés, quelques centaines de Mo au plus) : l'accueil
//   et les médiathèques se réaffichent sans tout retélécharger.
// - Cache mémoire plus large, images décodées à la taille réellement affichée (DPI compris).
// - Fonds flous calculés une fois sur une petite image, au lieu d'un effet de flou recalculé
//   à chaque image affichée (cause principale des ralentissements au défilement de l'accueil).
internal sealed class Artwork
{
    private readonly Jellyfin client;
    private readonly SemaphoreSlim network = new(6);
    private readonly Dictionary<string, LinkedListNode<(string Key, BitmapSource Bitmap)>> cache = new();
    private readonly LinkedList<(string Key, BitmapSource Bitmap)> recent = new();
    private readonly string? folder;
    private const int MemoryEntries = 360;
    private const long DiskLimit = 300L * 1024 * 1024, DiskTarget = 220L * 1024 * 1024;

    // Échelle d'affichage (DPI) de la fenêtre : 1 à 100 %, 1,5 à 150 %…
    internal static double Scale { get; set; } = 1;
    internal static int Pixels(double width) => (int)(Math.Ceiling(width * Math.Clamp(Scale, 1, 4) / 40) * 40);

    internal Artwork(Jellyfin client, string? cacheFolder = null)
    {
        this.client = client;
        if (cacheFolder == null) return;
        try
        {
            Directory.CreateDirectory(cacheFolder);
            folder = cacheFolder;
            _ = Task.Run(() => Prune(cacheFolder));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    internal Task LoadLogo(Image target, MediaItem item, CancellationToken cancellation)
    {
        var tag = item.ImageTags?.GetValueOrDefault("Logo");
        if (tag != null) return LoadImage(target, item.Id, "Logo", tag, 560, cancellation);
        if (item.ParentLogoItemId is { } id && item.ParentLogoImageTag is { } parentTag)
            return LoadImage(target, id, "Logo", parentTag, 560, cancellation);
        if (item.SeriesId is { } series) return LoadImage(target, series, "Logo", null, 560, cancellation);
        return Task.CompletedTask;
    }

    internal async Task Load(Image target, MediaItem item, bool backdrop, int width, CancellationToken cancellation, bool blurred = false)
    {
        var (id, kind, tag) = Source(item, backdrop);
        await LoadImage(target, id, kind, tag, width, cancellation, blurred);
        if (target.Source == null && !cancellation.IsCancellationRequested && kind == "Backdrop")
            await LoadImage(target, item.Id, "Primary", item.ImageTags?.GetValueOrDefault("Primary"), width, cancellation, blurred);
    }

    // Fond d'ambiance : même visuel, petit et flou (aucun effet graphique en temps réel).
    internal Task LoadBlurred(Image target, MediaItem item, bool backdrop, CancellationToken cancellation) =>
        Load(target, item, backdrop, 320, cancellation, blurred: true);

    private static (string Id, string Kind, string? Tag) Source(MediaItem item, bool backdrop)
    {
        var tag = item.ImageTags?.GetValueOrDefault("Primary");
        if (backdrop && item.BackdropImageTags is { Length: > 0 }) return (item.Id, "Backdrop", item.BackdropImageTags[0]);
        if (backdrop && item.ParentBackdropItemId is { } parent && item.ParentBackdropImageTags is { Length: > 0 })
            return (parent, "Backdrop", item.ParentBackdropImageTags[0]);
        if (backdrop && item.SeriesId is { } show) return (show, "Backdrop", null);
        if (!backdrop && tag == null && item.SeriesId is { } series) return (series, "Primary", null);
        return (item.Id, "Primary", tag);
    }

    private Task LoadImage(Image target, string id, string kind, string? tag, int width, CancellationToken cancellation, bool blurred = false)
    {
        if (!PlayRequest.Identifier(id)) return Task.CompletedTask;
        var path = $"Items/{id}/Images/{kind}?maxWidth={width}&quality=85" +
            (tag == null ? "" : "&tag=" + Uri.EscapeDataString(tag));
        return FetchImage(target, path, width, token => client.Image(path, token), cancellation, immutable: tag != null, blurred);
    }

    internal Task Fetch(Image target, string path, int width,
        Func<CancellationToken, Task<System.Net.Http.HttpResponseMessage>> download, CancellationToken cancellation) =>
        FetchImage(target, path, width, download, cancellation, immutable: true);

    private async Task FetchImage(Image target, string path, int width,
        Func<CancellationToken, Task<System.Net.Http.HttpResponseMessage>> download, CancellationToken cancellation, bool immutable, bool blurred = false)
    {
        var key = (blurred ? "blur:" : width + ":") + path;
        try
        {
            var bitmap = Remember(key);
            if (bitmap == null)
            {
                var data = await Bytes(path, download, immutable, cancellation);
                if (data == null) return;
                bitmap = await Task.Run(() => blurred ? Blur(data) : Decode(data, width), cancellation);
                Store(key, bitmap);
            }
            if (!cancellation.IsCancellationRequested) target.Source = bitmap;
        }
        catch (Exception error) when (error is not OutOfMemoryException) { }
    }

    private BitmapSource? Remember(string key)
    {
        if (!cache.TryGetValue(key, out var node)) return null;
        recent.Remove(node);
        recent.AddFirst(node);
        return node.Value.Bitmap;
    }

    private void Store(string key, BitmapSource bitmap)
    {
        if (cache.ContainsKey(key)) return;
        cache[key] = recent.AddFirst((key, bitmap));
        while (recent.Count > MemoryEntries && recent.Last is { } last)
        {
            cache.Remove(last.Value.Key);
            recent.RemoveLast();
        }
    }

    private async Task<byte[]?> Bytes(string path, Func<CancellationToken, Task<System.Net.Http.HttpResponseMessage>> download, bool immutable, CancellationToken cancellation)
    {
        var file = folder == null ? null : Path.Combine(folder, Hash(client.Root.AbsoluteUri + "|" + path));
        if (file != null)
        {
            try
            {
                var info = new FileInfo(file);
                if (info.Exists && info.Length > 0 && (immutable || info.LastWriteTimeUtc > DateTime.UtcNow.AddHours(-24)))
                    return await File.ReadAllBytesAsync(file, cancellation);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
        }
        await network.WaitAsync(cancellation);
        byte[] bytes;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            using var response = await download(timeout.Token);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > 5_000_000) return null;
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var data = new MemoryStream();
            var buffer = new byte[32 * 1024];
            int length;
            while ((length = await stream.ReadAsync(buffer, timeout.Token)) > 0)
            {
                if (data.Length + length > 5_000_000) return null;
                data.Write(buffer, 0, length);
            }
            bytes = data.ToArray();
        }
        finally { network.Release(); }
        if (file != null && bytes.Length > 0)
            _ = Task.Run(async () =>
            {
                try
                {
                    var temporary = file + "." + Environment.CurrentManagedThreadId + ".tmp";
                    await File.WriteAllBytesAsync(temporary, bytes);
                    File.Move(temporary, file, true);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
            });
        return bytes;
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)))[..40].ToLowerInvariant() + ".img";

    private static void Prune(string directory)
    {
        try
        {
            var files = new DirectoryInfo(directory).GetFiles("*").OrderByDescending(file => file.LastWriteTimeUtc).ToArray();
            foreach (var stale in files.Where(file => file.Name.EndsWith(".tmp", StringComparison.Ordinal) && file.LastWriteTimeUtc < DateTime.UtcNow.AddHours(-1)))
                stale.Delete();
            if (files.Sum(file => file.Length) <= DiskLimit) return;
            long kept = 0;
            foreach (var file in files)
            {
                kept += file.Length;
                if (kept > DiskTarget) file.Delete();
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    private static BitmapSource Decode(byte[] data, int width)
    {
        var bitmap = new BitmapImage();
        bitmap.BeginInit();
        bitmap.CacheOption = BitmapCacheOption.OnLoad;
        bitmap.DecodePixelWidth = width;
        bitmap.StreamSource = new MemoryStream(data);
        bitmap.EndInit();
        bitmap.Freeze();
        return bitmap;
    }

    // Petite image (96 px) floutée trois fois (flou de boîte ≈ flou gaussien), étirée ensuite à l'affichage.
    private static BitmapSource Blur(byte[] data)
    {
        var small = new FormatConvertedBitmap(Decode(data, 96), PixelFormats.Bgra32, null, 0);
        int width = small.PixelWidth, height = small.PixelHeight, stride = width * 4;
        var pixels = new byte[stride * height];
        small.CopyPixels(pixels, stride, 0);
        var buffer = new byte[pixels.Length];
        for (var pass = 0; pass < 3; pass++)
        {
            BoxBlur(pixels, buffer, width, height, 4, horizontal: true);
            BoxBlur(buffer, pixels, width, height, 4, horizontal: false);
        }
        var result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
        result.Freeze();
        return result;
    }

    private static void BoxBlur(byte[] source, byte[] target, int width, int height, int radius, bool horizontal)
    {
        int lines = horizontal ? height : width, length = horizontal ? width : height;
        for (var line = 0; line < lines; line++)
        {
            for (var channel = 0; channel < 4; channel++)
            {
                int Index(int position) => horizontal ? (line * width + Math.Clamp(position, 0, length - 1)) * 4 + channel
                    : (Math.Clamp(position, 0, length - 1) * width + line) * 4 + channel;
                var sum = 0;
                for (var offset = -radius; offset <= radius; offset++) sum += source[Index(offset)];
                for (var position = 0; position < length; position++)
                {
                    target[Index(position)] = (byte)(sum / (radius * 2 + 1));
                    sum += source[Index(position + radius + 1)] - source[Index(position - radius)];
                }
            }
        }
    }
}
