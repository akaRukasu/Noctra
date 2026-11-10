using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Noctra.Windows;

internal static class WireValue
{
    internal static JsonElement Field(this JsonElement value, string name) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var field) ? field : default;
    internal static string Str(this JsonElement value, string name = "") =>
        (name.Length == 0 ? value : value.Field(name)) is var field && field.ValueKind is JsonValueKind.String or JsonValueKind.Number
            ? field.ToString() : "";
    internal static double Num(this JsonElement value, string name) =>
        value.Field(name).TryNumber();
    internal static double TryNumber(this JsonElement value) => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) ? number : 0;
    internal static bool Flag(this JsonElement value, string name) => value.Field(name).ValueKind == JsonValueKind.True;
    internal static JsonElement[] List(this JsonElement value, string name = "") =>
        (name.Length == 0 ? value : value.Field(name)) is var field && field.ValueKind == JsonValueKind.Array ? field.EnumerateArray().ToArray() : [];
}

public partial class MainWindow
{
    private void OpenMore(object sender, RoutedEventArgs args) => _ = Navigate(MorePage);

    private Page MorePage => new("Toutes les fonctions", ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Votre espace Noctra", "Bibliothèque, lecture et services du serveur."));
        var choices = new WrapPanel();
        // 0.6 : tuiles avec icône, titre et description ; survol éclairci.
        Button Tile(string title, string description, string glyph, Action open)
        {
            var icon = new Border { Width = 42, Height = 42, CornerRadius = new CornerRadius(12), Background = ColorOf("#26BCAAFF"),
                Child = new TextBlock { Text = glyph, FontFamily = (System.Windows.Media.FontFamily)Resources["IconFont"], FontSize = 18,
                    Foreground = BrushFor("Accent"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            var text = new StackPanel { Margin = new Thickness(0, 14, 0, 0) };
            text.Children.Add(Text(title, 17, true));
            var caption = Text(description, 13, color: "Muted");
            caption.TextWrapping = TextWrapping.Wrap;
            caption.Margin = new Thickness(0, 4, 0, 0);
            text.Children.Add(caption);
            var body = new StackPanel();
            body.Children.Add(icon);
            body.Children.Add(text);
            var button = Action(title, open);
            button.Content = body;
            button.Background = ColorOf("#0DFFFFFF");
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Padding = new Thickness(20, 18, 20, 18);
            button.Width = 270;
            button.MinHeight = 150;
            button.Margin = new Thickness(0, 0, 14, 14);
            return button;
        }
        void Entry(string title, string description, Action open)
        {
            var glyph = title switch
            {
                "Profil et lecture" => "\uE77B", "Favoris" => "\uE734", "Sessions" => "\uE7F4", "Diffuser" => "\uEC15",
                "Découverte et demandes" => "\uE721", "TV et multivue" => "\uE7F4", "Ma multivue" => "\uF0E2",
                "Regarder ensemble" => "\uE716", "Téléchargements sur ce PC" => "\uE896", "Listes de lecture" => "\uE90B", _ => "\uE8A9"
            };
            choices.Children.Add(Tile(title, description, glyph, open));
        }
        Entry("Regarder ensemble", "SyncPlay : une séance synchronisée entre plusieurs écrans.", () => _ = Navigate(SyncPlayPage));
        Entry("Téléchargements sur ce PC", "Films et épisodes lisibles sans connexion.", () => _ = Navigate(OfflinePage));
        Entry("Listes de lecture", "Vos programmations à enchaîner.", () => _ = Navigate(PlaylistsPage));
        Entry("Profil et lecture", "Compte, Quick Connect, sous-titres et lecteur.", () => OpenProfile(this, new RoutedEventArgs()));
        Entry("Favoris", "Retrouvez vos films et séries enregistrés.", () => OpenFavorites(this, new RoutedEventArgs()));
        Entry("Sessions", "Vos appareils et leur lecture en cours.", () => _ = Navigate(SessionsPage));
        Entry("Diffuser", "Chromecast et appareils Jellyfin.", () => _ = Navigate(CastPage()));
        Entry("Découverte et demandes", "Sélections, demandes et roulette.", () => OpenDiscover(this, new RoutedEventArgs()));
        Entry("TV et multivue", "Chaînes, événements et plusieurs directs.", () => OpenTv(this, new RoutedEventArgs()));
        Entry("Ma multivue", "Jusqu’à 16 chaînes, directs et lecteurs web, avec mise en avant.", () => _ = Navigate(MultiviewPage));
        PageContent.Children.Add(choices);
        if (account.NoctraRoot == null) return;
        var service = new NoctraService(account, account.NoctraRoot);
        var session = await service.Json("api/session", cancellation);
        if (cancellation.IsCancellationRequested || !session.Flag("isAdmin")) return;
        PageContent.Children.Add(Heading("Gestion du serveur", "Outils accessibles à votre compte administrateur."));
        var admin = new WrapPanel();
        foreach (var (title, description, destination, glyph) in new[]
        {
            ("Téléchargements", "Transferts et fichiers en partage", DownloadsPage, "\uE896"),
            ("Fichiers", "Dossiers, renommage et corbeille", FilesPage(), "\uE8B7"),
            ("Automatisation", "Catalogue et recherche de versions", AutomationPage("radarr"), "\uE9F5"),
            ("Indexeurs Prowlarr", "Configuration et test des sources", IndexersPage, "\uE774"),
            ("Jellyfin et médiathèques", "Serveur, comptes et actualisation", JellyfinAdminPage, "\uE912"),
            ("Sources et accès TV", "Sources, clés et accès LiveWatch", TvSettingsPage, "\uE7F4")
        })
            admin.Children.Add(Tile(title, description, glyph, () => _ = Navigate(destination)));
        PageContent.Children.Add(admin);
    });

    private async Task<bool> AdminAccess(Jellyfin account, CancellationToken cancellation)
    {
        if (account.NoctraRoot == null) throw new InvalidOperationException("Adresse Noctra requise pour ce service.");
        var session = await new NoctraService(account, account.NoctraRoot).Json("api/session", cancellation);
        if (cancellation.IsCancellationRequested) return false;
        if (session.Flag("isAdmin")) return true;
        PageContent.Children.Clear();
        PageContent.Children.Add(Message("Cette fonction requiert un compte administrateur."));
        return false;
    }

    private Button ApiAction(string title, NoctraService service, string path, string method, Func<object?>? body,
        CancellationToken cancellation, Action? success = null, string? confirmation = null)
    {
        var button = Action(title, () => { });
        button.Click += async (_, _) =>
        {
            if (confirmation != null && MessageBox.Show(this, confirmation, title, MessageBoxButton.YesNo,
                MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            button.IsEnabled = false;
            try
            {
                await service.Send(path, method, body?.Invoke(), cancellation);
                if (cancellation.IsCancellationRequested) return;
                ShowStatus("Modification enregistrée.");
                success?.Invoke();
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
            {
                if (!cancellation.IsCancellationRequested) ShowStatus(error is NoctraApiException ? error.Message : "Le serveur a refusé l’opération ou n’a pas répondu. Réessayez.");
            }
            finally { button.IsEnabled = true; }
        };
        return button;
    }

    private TextBox Input(StackPanel parent, string label, string value = "")
    {
        var caption = Text(label, 13, true, "Muted");
        caption.Margin = new Thickness(0, 12, 0, 5);
        var input = new TextBox { Text = value, MinWidth = 220, MaxWidth = 560, HorizontalAlignment = HorizontalAlignment.Left };
        AutomationProperties.SetName(input, label);
        parent.Children.Add(caption);
        parent.Children.Add(input);
        return input;
    }

    private static string Size(double bytes)
    {
        string[] units = ["o", "Ko", "Mo", "Go", "To"];
        var index = 0;
        while (bytes >= 1024 && index < units.Length - 1) { bytes /= 1024; index++; }
        return bytes.ToString(index == 0 ? "0" : "0.0", CultureInfo.CurrentCulture) + " " + units[index];
    }

    private FrameworkElement Row(string title, string caption, params Button[] actions)
    {
        var area = new DockPanel();
        var buttons = new WrapPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right };
        foreach (var button in actions)
        {
            button.Margin = new Thickness(7, 2, 0, 2);
            buttons.Children.Add(button);
        }
        DockPanel.SetDock(buttons, Dock.Right);
        area.Children.Add(buttons);
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
        var name = Text(title, 15, true);
        name.TextTrimming = TextTrimming.CharacterEllipsis;
        var sub = Text(caption, 12, color: "Muted");
        sub.TextTrimming = TextTrimming.CharacterEllipsis;
        copy.Children.Add(name);
        copy.Children.Add(sub);
        area.Children.Add(copy);
        return new Border
        {
            Child = area, Padding = new Thickness(15, 10, 10, 10), CornerRadius = new CornerRadius(12),
            Background = BrushFor("Panel"), BorderBrush = BrushFor("Outline"), BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 0, 0, 8)
        };
    }
}
