using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Noctra.Windows;

public partial class MainWindow
{
    private void OpenDiscover(object sender, RoutedEventArgs args) => _ = Navigate(DiscoverPage("smart", 1), reset: true);

    private Page DiscoverPage(string category, int index) => new("Découverte", ButtonTab.Discover,
        (account, cancellation) => RenderDiscovery(account, category, index, null, cancellation));
    private Page DiscoverySearchPage(string query) => new("Recherche de titres", ButtonTab.Discover,
        (account, cancellation) => RenderDiscovery(account, "search", 1, query, cancellation));

    private Page DiscoverDetail(DiscoverItem item) => new(item.Label, ButtonTab.Discover,
        (account, cancellation) => RenderDiscoverDetail(account, item, cancellation));

    private Page RoulettePage => new("Roulette", ButtonTab.Discover, (account, cancellation) =>
    {
        if (account.NoctraRoot == null) return Task.CompletedTask;
        var service = new NoctraService(account, account.NoctraRoot);
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Roulette", "Tirez des films et séries au hasard dans votre bibliothèque."));
        var unplayed = new CheckBox { Content = "Titres non vus uniquement", Foreground = BrushFor("Muted"),
            Margin = new Thickness(0, 0, 0, 12) };
        var roll = Action("Lancer la roulette", () => { }, "Primary");
        roll.HorizontalAlignment = HorizontalAlignment.Left;
        var results = new StackPanel { Margin = new Thickness(0, 18, 0, 0) };
        roll.Click += async (_, _) =>
        {
            roll.IsEnabled = false;
            results.Children.Clear();
            try
            {
                var data = await service.Read<RouletteResult>("api/roulette?count=3" + (unplayed.IsChecked == true ? "&unplayed=1" : ""), cancellation);
                if (cancellation.IsCancellationRequested) return;
                foreach (var title in data.Results ?? [])
                {
                    if (!PlayRequest.Identifier(title.Id)) continue;
                    var item = new MediaItem { Id = title.Id, Name = title.Title };
                    var row = Action(title.Title, () => OpenDetail(item, ButtonTab.Discover));
                    row.HorizontalAlignment = HorizontalAlignment.Left;
                    row.Margin = new Thickness(0, 0, 0, 7);
                    results.Children.Add(row);
                }
                if (results.Children.Count == 0) results.Children.Add(Message("Aucun titre pour ces critères."));
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException)
            {
                if (!cancellation.IsCancellationRequested) results.Children.Add(Message("La roulette est indisponible. Réessayez."));
            }
            finally { roll.IsEnabled = true; }
        };
        PageContent.Children.Add(unplayed);
        PageContent.Children.Add(roll);
        PageContent.Children.Add(results);
        return Task.CompletedTask;
    });

    private sealed record RouletteResult(RouletteTitle[]? Results);
    private sealed record RouletteTitle(string Id, string Title);
}
