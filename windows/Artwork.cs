using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls;
using System.Windows.Media.Imaging;

namespace Noctra.Windows;

internal sealed class Artwork(Jellyfin client)
{
    private readonly SemaphoreSlim network = new(5);
    private readonly Dictionary<string, BitmapSource> cache = new();
    private readonly Queue<string> cacheOrder = new();

    internal Task LoadLogo(Image target, MediaItem item, CancellationToken cancellation)
    {
        var tag = item.ImageTags?.GetValueOrDefault("Logo");
        if (tag != null) return LoadImage(target, item.Id, "Logo", tag, 550, cancellation);
        if (item.ParentLogoItemId is { } id && item.ParentLogoImageTag is { } parentTag)
            return LoadImage(target, id, "Logo", parentTag, 550, cancellation);
        if (item.SeriesId is { } series) return LoadImage(target, series, "Logo", null, 550, cancellation);
        return Task.CompletedTask;
    }

    internal async Task Load(Image target, MediaItem item, bool backdrop, int width, CancellationToken cancellation)
    {
        var id = item.Id;
        var kind = "Primary";
        var tag = item.ImageTags?.GetValueOrDefault("Primary");
        if (backdrop && item.BackdropImageTags is { Length: > 0 })
        {
            kind = "Backdrop";
            tag = item.BackdropImageTags[0];
        }
        else if (backdrop && item.ParentBackdropItemId is { } parent && item.ParentBackdropImageTags is { Length: > 0 })
        {
            id = parent;
            kind = "Backdrop";
            tag = item.ParentBackdropImageTags[0];
        }
        else if (backdrop && item.SeriesId is { } show)
        {
            id = show; kind = "Backdrop"; tag = null;
        }
        else if (!backdrop && tag == null && item.SeriesId is { } series)
        {
            id = series;
        }
        await LoadImage(target, id, kind, tag, width, cancellation);
        if (target.Source == null && !cancellation.IsCancellationRequested && kind == "Backdrop")
            await LoadImage(target, item.Id, "Primary", item.ImageTags?.GetValueOrDefault("Primary"), width, cancellation);
    }

    private Task LoadImage(Image target, string id, string kind, string? tag, int width, CancellationToken cancellation)
    {
        if (!PlayRequest.Identifier(id)) return Task.CompletedTask;
        var path = $"Items/{id}/Images/{kind}?maxWidth={width}&quality=85" +
            (tag == null ? "" : "&tag=" + Uri.EscapeDataString(tag));
        return Fetch(target, path, width, token => client.Image(path, token), cancellation);
    }

    internal Task Fetch(Image target, string path, int width,
        Func<CancellationToken, Task<System.Net.Http.HttpResponseMessage>> download, CancellationToken cancellation) =>
        FetchImage(target, width + ":" + path, width, download, cancellation);

    private async Task FetchImage(Image target, string path, int width,
        Func<CancellationToken, Task<System.Net.Http.HttpResponseMessage>> download, CancellationToken cancellation)
    {
        try
        {
            if (!cache.TryGetValue(path, out var bitmap))
            {
                await network.WaitAsync(cancellation);
                try
                {
                    if (!cache.TryGetValue(path, out bitmap))
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                        timeout.CancelAfter(TimeSpan.FromSeconds(8));
                        using var response = await download(timeout.Token);
                        if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > 5_000_000) return;
                        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                        using var data = new MemoryStream();
                        var buffer = new byte[32 * 1024];
                        int length;
                        while ((length = await stream.ReadAsync(buffer, timeout.Token)) > 0)
                        {
                            if (data.Length + length > 5_000_000) return;
                            data.Write(buffer, 0, length);
                        }
                        bitmap = await Task.Run(() => Decode(data, width), cancellation);
                        cache[path] = bitmap;
                        cacheOrder.Enqueue(path);
                        if (cacheOrder.Count > 100) cache.Remove(cacheOrder.Dequeue());
                    }
                }
                finally { network.Release(); }
            }
            if (!cancellation.IsCancellationRequested) target.Source = bitmap;
        }
        catch (Exception error) when (error is not OutOfMemoryException) { }
    }

    private static BitmapSource Decode(Stream stream, int width)
    {
        stream.Position = 0;
        var bitmap = new BitmapImage();
        bitmap.BeginInit();
        bitmap.CacheOption = BitmapCacheOption.OnLoad;
        bitmap.DecodePixelWidth = width;
        bitmap.StreamSource = stream;
        bitmap.EndInit();
        bitmap.Freeze();
        return bitmap;
    }
}
