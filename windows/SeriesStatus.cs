using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace Noctra.Windows;

internal sealed record SeriesAvailability(string? State, string? Label, string? Description);

public partial class MainWindow
{
    private readonly Dictionary<string, (DateTime Until, SeriesAvailability Value)> seriesStatuses = [];
    private readonly SemaphoreSlim seriesStatusGate = new(2);

    private Border SeriesBadge(string id, CancellationToken cancellation, bool detail = false)
    {
        var account = client;
        var label = Text("Vérification…", 11, true, "Muted");
        var badge = new Border { Child = label, CornerRadius = new CornerRadius(10), Padding = new Thickness(8, 4, 8, 4),
            Background = ColorOf("#1FFFFFFF"), Margin = new Thickness(0, detail ? 12 : 6, 0, 0), HorizontalAlignment = HorizontalAlignment.Left,
            MaxWidth = detail ? 900 : 220 };
        label.TextTrimming = TextTrimming.CharacterEllipsis;
        var started = false;
        async void Check(object? sender, EventArgs args)
        {
            if (started || cancellation.IsCancellationRequested || !badge.IsLoaded) return;
            if (!detail)
            {
                try
                {
                    var position = badge.TransformToAncestor(Scroller).Transform(new Point());
                    if (position.Y < -100 || position.Y > Scroller.ViewportHeight + 100) return;
                }
                catch (InvalidOperationException) { return; }
            }
            started = true;
            Scroller.ScrollChanged -= Check;
            Scroller.AnimatedScrollCompleted -= Check;
            var result = new SeriesAvailability("unknown", "Non vérifié", "Vérification momentanément indisponible.");
            try
            {
                if (account?.NoctraRoot is { } root)
                {
                    await seriesStatusGate.WaitAsync(cancellation);
                    try
                    {
                        if (seriesStatuses.TryGetValue(id, out var cached) && cached.Until > DateTime.UtcNow) result = cached.Value;
                        else
                        {
                            result = await new NoctraService(account, root).Read<SeriesAvailability>("api/library/series-status?id=" + Uri.EscapeDataString(id), cancellation);
                            if (client == account && !cancellation.IsCancellationRequested)
                            {
                                if (seriesStatuses.Count > 300) seriesStatuses.Clear();
                                seriesStatuses[id] = (DateTime.UtcNow.AddMinutes(5), result);
                            }
                        }
                    }
                    finally { seriesStatusGate.Release(); }
                }
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
            if (cancellation.IsCancellationRequested || client != account) return;
            if (result.State == "not-series") { badge.Visibility = Visibility.Collapsed; return; }
            label.Text = string.IsNullOrWhiteSpace(result.Label) ? "Non vérifié" : result.Label;
            var color = result.State switch { "complete" => "#A9E7C9", "ongoing" => "#A7D7F5", "incomplete" => "#F0CE92", _ => "#B8C6D9" };
            label.Foreground = ColorOf(color);
            badge.ToolTip = result.Description;
            System.Windows.Automation.AutomationProperties.SetName(badge, label.Text + ". " + result.Description);
        }
        badge.Loaded += (_, _) => Dispatcher.BeginInvoke(() => Check(null, EventArgs.Empty), DispatcherPriority.Background);
        Scroller.ScrollChanged += Check;
        Scroller.AnimatedScrollCompleted += Check;
        badge.Unloaded += (_, _) => { Scroller.ScrollChanged -= Check; Scroller.AnimatedScrollCompleted -= Check; };
        return badge;
    }
}
