using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls;

namespace Noctra.Windows;

internal sealed record StreamHealth(bool? Working, string Label, DateTime Until, int Height = 0);

public partial class MainWindow
{
    private readonly Dictionary<string, StreamHealth> serverHealth = [];
    private readonly SemaphoreSlim streamProbeGate = new(2);
    private bool IsHealthy(LiveStream stream) => serverHealth.TryGetValue(stream.Url.AbsoluteUri, out var result) && result.Working == true && result.Until > DateTime.UtcNow;
    private int VerifiedHeight(LiveStream stream) => serverHealth.TryGetValue(stream.Url.AbsoluteUri, out var result) && result.Working == true && result.Until > DateTime.UtcNow ? result.Height : 0;

    private async Task PaintServerHealth(LiveStream stream, TextBlock label, CancellationToken cancellation)
    {
        try
        {
            await streamProbeGate.WaitAsync(cancellation);
            StreamHealth result;
            try
            {
                if (!serverHealth.TryGetValue(stream.Url.AbsoluteUri, out result!) || result.Until < DateTime.UtcNow)
                {
                    label.Text = "Vérification du flux vidéo…";
                    result = await Task.Run(() => ProbeStream(stream, cancellation), cancellation);
                    if (!cancellation.IsCancellationRequested)
                    {
                        if (serverHealth.Count > 160) serverHealth.Clear();
                        serverHealth[stream.Url.AbsoluteUri] = result;
                    }
                }
            }
            finally { streamProbeGate.Release(); }
            if (cancellation.IsCancellationRequested) return;
            label.Text = result.Label;
            label.Foreground = ColorOf(result.Working switch { true => "#A6E8C7", false => "#F1B6AD", _ => "#C4CDDA" });
        }
        catch (OperationCanceledException) { }
    }

    private static StreamHealth ProbeStream(LiveStream stream, CancellationToken cancellation)
    {
        if (!File.Exists(Mpv.LibraryPath)) return new(null, "Installez le lecteur pour tester ce flux", DateTime.UtcNow.AddSeconds(10));
        try
        {
            using var engine = new Mpv(IntPtr.Zero, null, 0, stream.NoctraToken, probe: true);
            engine.Load(stream.Url);
            var clock = Stopwatch.StartNew(); var started = false;
            while (clock.Elapsed < TimeSpan.FromSeconds(10))
            {
                cancellation.ThrowIfCancellationRequested();
                foreach (var (kind, _) in engine.Poll())
                {
                    if (kind == Mpv.Event.PlaybackRestart) started = true;
                    if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown)
                        return new(false, "Aucune image reçue · réessayer ou choisir un autre serveur", DateTime.UtcNow.AddSeconds(40));
                }
                if (started && engine.Seconds("video-out-params/h") is > 0 and var height && engine.Seconds("time-pos") > .05)
                {
                    var available = string.Join(", ", TvQuality.Read(engine).Where(item => item.Height > 0).Select(item => item.Height + "p").Distinct());
                    return new(true, $"Image reçue · {height:0}p" + (available.Length > 0 ? " · Qualités annoncées : " + available : "") + $" · vérifié à {DateTime.Now:HH:mm}", DateTime.UtcNow.AddMinutes(2), (int)height);
                }
                if (cancellation.WaitHandle.WaitOne(45)) cancellation.ThrowIfCancellationRequested();
            }
            return new(false, "Délai dépassé · le serveur ne fournit pas d’image", DateTime.UtcNow.AddSeconds(40));
        }
        catch (Exception error) when (error is InvalidOperationException or DllNotFoundException or BadImageFormatException)
        { return new(false, "Flux indisponible ou format illisible", DateTime.UtcNow.AddSeconds(40)); }
    }
}
