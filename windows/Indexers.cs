using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

public partial class MainWindow
{
    private Page IndexersPage => new("Prowlarr", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var data = await service.Json("api/prowlarr", cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear(); PageContent.Children.Add(Heading("Indexeurs Prowlarr", "Gérez les sources de recherche de votre serveur."));
        PageContent.Children.Add(Action("Ajouter un indexeur", () => _ = Navigate(IndexerPage()), "Primary"));
        foreach (var health in data.List("health")) PageContent.Children.Add(Message(health.Str("message")));
        foreach (var item in data.List("indexers"))
            PageContent.Children.Add(Row(item.Str("name"), item.Str("protocol") + " · " + (item.Flag("enabled") ? "Actif" : "Désactivé"),
                Action("Configurer", () => _ = Navigate(IndexerPage((int)item.Num("id"))))));
        if (data.List("indexers").Length == 0) PageContent.Children.Add(Message("Aucun indexeur configuré."));
    });

    private Page IndexerPage(int id = 0, string? schema = null) => new("Configuration de l’indexeur", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var data = await service.Json("api/prowlarr/indexer-context?" + (id > 0 ? "id=" + id : "schema=" + Uri.EscapeDataString(schema ?? "")), cancellation);
        if (cancellation.IsCancellationRequested) return;
        var item = data.Field(id > 0 ? "indexer" : "template");
        PageContent.Children.Clear(); PageContent.Children.Add(Heading(id > 0 ? item.Str("name") : "Nouvel indexeur", "Les identifiants existants sont conservés si vous laissez leurs champs vides."));
        var form = new StackPanel(); PageContent.Children.Add(form);
        if (id == 0)
        {
            var schemas = data.List("schemas"); var picker = Choice(form, "Type d’indexeur", schemas.Select(value => value.Str("name")).ToArray(), Math.Max(0, Array.FindIndex(schemas, value => value.Str("schemaId") == item.Str("schemaId"))));
            picker.SelectionChanged += (_, _) => { if (picker.SelectedIndex >= 0) _ = Navigate(IndexerPage(schema: schemas[picker.SelectedIndex].Str("schemaId")), back: true); };
        }
        var name = Input(form, "Nom", item.Str("name")); var priority = Input(form, "Priorité · 1 à 50", item.Num("priority").ToString(CultureInfo.InvariantCulture));
        var enabled = new CheckBox { Content = "Indexeur actif", IsChecked = item.Flag("enable"), Foreground = BrushFor("Ink"), Margin = new Thickness(0, 16, 0, 4) }; form.Children.Add(enabled);
        var profiles = data.List("profiles"); var clients = data.List("clients");
        var profile = Choice(form, "Profil de synchronisation", profiles.Select(value => value.Str("name")).ToArray(), Math.Max(0, Array.FindIndex(profiles, value => value.Num("id") == item.Num("appProfileId"))));
        var client = Choice(form, "Client de téléchargement", new[] { "Par défaut" }.Concat(clients.Select(value => value.Str("name"))).ToArray(), Array.FindIndex(clients, value => value.Num("id") == item.Num("downloadClientId")) + 1);
        var readers = new Dictionary<string, Func<object?>>();
        foreach (var field in item.List("fields"))
        {
            var key = field.Str("name"); var label = field.Str("label"); var value = field.Field("value");
            if (field.Flag("secret"))
            {
                form.Children.Add(Text(label, 13, true, "Muted"));
                var password = new PasswordBox { Width = 400, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 7, 0, 14) }; form.Children.Add(password); readers[key] = () => password.Password;
            }
            else if (field.Str("type") == "checkbox")
            {
                var check = new CheckBox { Content = label, IsChecked = value.ValueKind == JsonValueKind.True, Foreground = BrushFor("Ink"), Margin = new Thickness(0, 13, 0, 4) }; form.Children.Add(check); readers[key] = () => check.IsChecked == true;
            }
            else if (field.List("options") is { Length: > 0 } options)
            {
                var picker = Choice(form, label, options.Select(option => option.Str("name")).ToArray(), Math.Max(0, Array.FindIndex(options, option => option.Field("value").ToString() == value.ToString())));
                readers[key] = () => picker.SelectedIndex >= 0 ? options[picker.SelectedIndex].Field("value") : value;
            }
            else
            {
                var input = Input(form, label, value.ValueKind == JsonValueKind.Array ? string.Join(",", value.EnumerateArray().Select(entry => entry.ToString())) : value.ToString());
                readers[key] = () => field.Str("type") == "number" ? double.TryParse(input.Text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? number : null :
                    value.ValueKind == JsonValueKind.Array ? input.Text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) : input.Text;
            }
        }
        object Body()
        {
            if (!int.TryParse(priority.Text, out var rank) || rank is < 1 or > 50 || string.IsNullOrWhiteSpace(name.Text) || profile.SelectedIndex < 0) throw new InvalidOperationException("Configuration incomplète.");
            return new { id, schemaId = item.Str("schemaId"), name = name.Text.Trim(), priority = rank, enable = enabled.IsChecked == true,
                appProfileId = profiles[profile.SelectedIndex].Num("id"), downloadClientId = client.SelectedIndex > 0 ? clients[client.SelectedIndex - 1].Num("id") : 0,
                fields = readers.ToDictionary(pair => pair.Key, pair => pair.Value()) };
        }
        var actions = new WrapPanel { Margin = new Thickness(0, 24, 0, 0) }; form.Children.Add(actions);
        actions.Children.Add(ApiAction("Tester la connexion", service, "api/prowlarr/indexer/test", "POST", Body, cancellation));
        var save = ApiAction("Enregistrer l’indexeur", service, "api/prowlarr/indexer", "POST", Body, cancellation, () => _ = Navigate(IndexersPage, back: true), "Enregistrer cette configuration Prowlarr ?");
        save.Margin = new Thickness(9, 0, 0, 0); actions.Children.Add(save);
    });
}
