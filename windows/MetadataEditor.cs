using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Noctra.Windows;

// 0.8 : comme l'éditeur de Jellyfin (PWA) : images (affiche, fonds, logo…) choisies en ligne ou depuis le PC, métadonnées
// modifiables, actualisation depuis Internet. Réservé aux administrateurs. Avant chaque remplacement ou suppression,
// l'ancienne image et les anciennes métadonnées sont gardées sur ce PC (dossier « sauvegardes-metadonnees »).
public partial class MainWindow
{
    private static readonly (string Type, string Label)[] EditableImages =
        [("Primary", "Affiche"), ("Backdrop", "Fonds"), ("Logo", "Logo"), ("Thumb", "Vignette"), ("Banner", "Bannière")];

    private static bool CanEditMetadata(Jellyfin? account) => account?.User.Policy?.IsAdministrator == true;

    private string EditBackupDirectory(string id)
    {
        var directory = Path.Combine(dataDirectory, "sauvegardes-metadonnees", id);
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static string BackupStamp => DateTime.Now.ToString("yyyyMMdd-HHmmss-fff", CultureInfo.InvariantCulture);

    // Image actuelle gardée sur ce PC avant d'être remplacée ou supprimée.
    private async Task BackupImage(Jellyfin account, string id, string type, int index, CancellationToken cancellation)
    {
        try
        {
            using var response = await account.Image("Items/" + id + "/Images/" + type + "/" + index.ToString(CultureInfo.InvariantCulture), cancellation);
            if (!response.IsSuccessStatusCode) return;
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellation);
            var extension = response.Content.Headers.ContentType?.MediaType switch
            {
                "image/png" => ".png", "image/webp" => ".webp", "image/gif" => ".gif", _ => ".jpg"
            };
            await File.WriteAllBytesAsync(Path.Combine(EditBackupDirectory(id), $"{type}-{index}-{BackupStamp}{extension}"), bytes, cancellation);
            Trace($"image sauvegardée {id} {type} {index}");
        }
        catch (Exception error) when (error is HttpRequestException or IOException or UnauthorizedAccessException or OperationCanceledException) { }
    }

    private static async Task<BitmapSource?> Picture(Func<Task<HttpResponseMessage>> fetch, int width, CancellationToken cancellation)
    {
        try
        {
            using var response = await fetch();
            if (!response.IsSuccessStatusCode) return null;
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellation);
            return await Task.Run(() =>
            {
                var image = new BitmapImage();
                image.BeginInit();
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.DecodePixelWidth = width;
                image.StreamSource = new MemoryStream(bytes);
                image.EndInit();
                image.Freeze();
                return (BitmapSource)image;
            }, cancellation);
        }
        catch (Exception error) when (error is HttpRequestException or IOException or NotSupportedException or OperationCanceledException or
            ArgumentException or InvalidOperationException or FormatException) { return null; }
    }

    private static async Task ShowPicture(Image target, Func<Task<HttpResponseMessage>> fetch, int width, CancellationToken cancellation)
    {
        var picture = await Picture(fetch, width, cancellation);
        if (picture != null && !cancellation.IsCancellationRequested) target.Source = picture;
    }

    private static Border Framed(Image image, double height) => new()
    {
        Height = height, MinWidth = 60, CornerRadius = new CornerRadius(10), Background = new SolidColorBrush(Color.FromRgb(26, 29, 41)),
        Child = image, ClipToBounds = true, HorizontalAlignment = HorizontalAlignment.Left
    };

    private Page ImagesPage(MediaItem item) => new("Images", ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        if (!CanEditMetadata(account)) { PageContent.Children.Add(Message("Seul un administrateur Jellyfin peut modifier les images.")); return; }
        var images = (await account.ItemImages(item.Id, cancellation)).List();
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Images · " + item.DisplayTitle,
            "Choisissez une image proposée en ligne ou ajoutez la vôtre. L’image remplacée ou supprimée est d’abord gardée sur ce PC."));
        var types = item.Type == "Episode" ? EditableImages.Where(entry => entry.Type == "Primary").ToArray() : EditableImages;
        foreach (var (type, label) in types)
        {
            var current = images.Where(image => image.Str("ImageType") == type).OrderBy(image => image.Num("ImageIndex")).ToArray();
            var section = new StackPanel();
            var search = Action("Rechercher en ligne", () => _ = Navigate(RemoteImagesPage(item, type, label, false)));
            AutomationProperties.SetAutomationId(search, "ImageSearch-" + type);
            var upload = Action("Depuis le PC…", () => _ = UploadFromComputer(account, item, type, label));
            AutomationProperties.SetAutomationId(upload, "ImageUpload-" + type);
            section.Children.Add(Row(label, current.Length == 0 ? "Aucune image" : current.Length == 1 ? "1 image" : current.Length + " images", search, upload));
            var strip = new WrapPanel { Margin = new Thickness(0, 10, 0, 0) };
            foreach (var image in current)
            {
                var index = (int)image.Num("ImageIndex");
                var tag = image.Str("ImageTag");
                var picture = new Image { Stretch = Stretch.Uniform };
                RenderOptions.SetBitmapScalingMode(picture, BitmapScalingMode.HighQuality);
                var card = new StackPanel { Margin = new Thickness(0, 0, 16, 10) };
                card.Children.Add(Framed(picture, type == "Primary" ? 190 : type == "Banner" ? 60 : 112));
                var size = image.Num("Width") > 0 ? $"{image.Num("Width"):0} × {image.Num("Height"):0}" : "";
                if (size.Length > 0) card.Children.Add(Text(size, 11.5, color: "Muted"));
                var delete = Action("Supprimer", async () =>
                {
                    if (MessageBox.Show(this, "Supprimer cette image (" + label.ToLowerInvariant() + ") de Jellyfin ? Une copie est gardée sur ce PC.",
                        "Supprimer l’image", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                    await BackupImage(account, item.Id, type, index, lifetime.Token);
                    try
                    {
                        await account.DeleteImage(item.Id, type, index, lifetime.Token);
                        ShowStatus("Image supprimée (copie gardée sur ce PC).");
                        _ = Navigate(ImagesPage(item), back: true);
                    }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé la suppression de l’image."); }
                });
                delete.Margin = new Thickness(0, 6, 0, 0);
                delete.HorizontalAlignment = HorizontalAlignment.Left;
                AutomationProperties.SetAutomationId(delete, "ImageDelete-" + type + "-" + index.ToString(CultureInfo.InvariantCulture));
                card.Children.Add(delete);
                strip.Children.Add(card);
                _ = ShowPicture(picture, () => account.Image("Items/" + item.Id + "/Images/" + type + "/" + index.ToString(CultureInfo.InvariantCulture) +
                    "?maxWidth=480&quality=90" + (tag.Length > 0 ? "&tag=" + Uri.EscapeDataString(tag) : ""), cancellation), 480, cancellation);
            }
            if (current.Length > 0) section.Children.Add(strip);
            var sheet = Sheet(section);
            sheet.Margin = new Thickness(0, 0, 0, 16);
            PageContent.Children.Add(sheet);
        }
        var metadata = Action("Modifier les métadonnées", () => _ = Navigate(MetadataPage(item)));
        metadata.HorizontalAlignment = HorizontalAlignment.Left;
        PageContent.Children.Add(metadata);
    });

    private Page RemoteImagesPage(MediaItem item, string type, string label, bool allLanguages) => new("Images en ligne", ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        if (!CanEditMetadata(account)) { PageContent.Children.Add(Message("Seul un administrateur Jellyfin peut modifier les images.")); return; }
        var data = await account.RemoteImages(item.Id, type, allLanguages, cancellation);
        if (cancellation.IsCancellationRequested) return;
        var results = data.List("Images").Where(result => Uri.TryCreate(result.Str("Url"), UriKind.Absolute, out var url) && url.Scheme is "http" or "https").ToArray();
        PageContent.Children.Clear();
        var providers = string.Join(", ", results.Select(result => result.Str("ProviderName")).Where(name => name.Length > 0).Distinct());
        PageContent.Children.Add(Heading(label + " · " + item.DisplayTitle,
            results.Length == 0 ? "Aucune image proposée." : results.Length + " image" + (results.Length > 1 ? "s" : "") + (providers.Length > 0 ? " · " + providers : "")));
        var languages = Action(allLanguages ? "Seulement la langue de l’œuvre" : "Toutes les langues",
            () => _ = Navigate(RemoteImagesPage(item, type, label, !allLanguages), back: true));
        languages.HorizontalAlignment = HorizontalAlignment.Left;
        languages.Margin = new Thickness(0, 0, 0, 16);
        PageContent.Children.Add(languages);
        var grid = new WrapPanel();
        var number = 0;
        foreach (var result in results.Take(60))
        {
            var url = result.Str("Url");
            var thumbnail = Uri.TryCreate(result.Str("ThumbnailUrl"), UriKind.Absolute, out var small) && small.Scheme is "http" or "https" ? small.AbsoluteUri : url;
            var picture = new Image { Stretch = Stretch.Uniform };
            RenderOptions.SetBitmapScalingMode(picture, BitmapScalingMode.HighQuality);
            var card = new StackPanel { Width = type == "Primary" ? 170 : 300, Margin = new Thickness(0, 0, 16, 18) };
            card.Children.Add(Framed(picture, type == "Primary" ? 250 : type == "Banner" ? 60 : 168));
            var facts = new[]
            {
                result.Str("ProviderName"), result.Num("Width") > 0 ? $"{result.Num("Width"):0} × {result.Num("Height"):0}" : "",
                result.Str("Language") is { Length: > 0 } language ? language.ToUpperInvariant() : "",
                result.Num("CommunityRating") > 0 ? "★ " + result.Num("CommunityRating").ToString("0.0", CultureInfo.CurrentCulture) : ""
            };
            var caption = Text(string.Join(" · ", facts.Where(fact => fact.Length > 0)), 11.5, color: "Muted");
            caption.TextTrimming = TextTrimming.CharacterEllipsis;
            caption.Margin = new Thickness(0, 6, 0, 6);
            card.Children.Add(caption);
            var choose = Action("Choisir", async () =>
            {
                // Une seule affiche / un seul logo… : l'image actuelle est gardée sur ce PC avant d'être remplacée.
                if (type != "Backdrop") await BackupImage(account, item.Id, type, 0, lifetime.Token);
                try
                {
                    await account.DownloadRemoteImage(item.Id, type, url, lifetime.Token);
                    Trace($"image en ligne choisie {item.Id} {type} {url}");
                    ShowStatus(label + " enregistré" + (label.EndsWith('e') ? "e" : "") + " dans Jellyfin.");
                    _ = Navigate(ImagesPage(item), back: true);
                }
                catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin n’a pas pu télécharger cette image."); }
            }, "Primary");
            choose.HorizontalAlignment = HorizontalAlignment.Left;
            AutomationProperties.SetAutomationId(choose, "RemoteImage-" + number++);
            card.Children.Add(choose);
            grid.Children.Add(card);
            _ = ShowPicture(picture, () => Jellyfin.Http.GetAsync(thumbnail, HttpCompletionOption.ResponseContentRead, cancellation), 360, cancellation);
        }
        PageContent.Children.Add(grid);
    });

    private async Task UploadFromComputer(Jellyfin account, MediaItem item, string type, string label)
    {
        // Test d'interface : image fournie directement (pas de fenêtre de choix de fichier).
        var path = TracePath != null ? Environment.GetEnvironmentVariable("NOCTRA_TEST_IMAGE") : null;
        if (path == null)
        {
            var dialog = new Microsoft.Win32.OpenFileDialog
            {
                Title = label + " · " + item.DisplayTitle, Filter = "Images|*.jpg;*.jpeg;*.png;*.webp;*.gif|Tous les fichiers|*.*"
            };
            if (dialog.ShowDialog(this) != true) return;
            path = dialog.FileName;
        }
        byte[] data;
        try
        {
            if (new FileInfo(path).Length > 25 * 1024 * 1024) { ShowStatus("Image trop lourde (25 Mo au plus)."); return; }
            data = await File.ReadAllBytesAsync(path, lifetime.Token);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or OperationCanceledException) { ShowStatus("Impossible de lire ce fichier."); return; }
        var mime = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png", ".webp" => "image/webp", ".gif" => "image/gif", _ => "image/jpeg"
        };
        if (type != "Backdrop") await BackupImage(account, item.Id, type, 0, lifetime.Token);
        try
        {
            await account.UploadImage(item.Id, type, data, mime, lifetime.Token);
            Trace($"image envoyée {item.Id} {type} {data.Length} octets");
            ShowStatus(label + " envoyé" + (label.EndsWith('e') ? "e" : "") + " à Jellyfin.");
            _ = Navigate(ImagesPage(item), back: true);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé cette image."); }
    }

    private Page MetadataPage(MediaItem item) => new("Métadonnées", ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        if (!CanEditMetadata(account)) { PageContent.Children.Add(Message("Seul un administrateur Jellyfin peut modifier les métadonnées.")); return; }
        var document = await account.ItemDocument(item.Id, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Métadonnées · " + item.DisplayTitle,
            "Les valeurs actuelles sont gardées sur ce PC avant chaque enregistrement ou actualisation."));
        string Value(string key) => document[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : "";
        string Names(string key) => document[key] is JsonArray array
            ? string.Join(", ", array.Select(entry => entry is JsonObject named ? named["Name"]?.ToString() : entry?.ToString()).Where(name => !string.IsNullOrWhiteSpace(name)))
            : "";
        var form = new StackPanel();
        TextBox Field(string label, string value, string id)
        {
            var input = Input(form, label, value);
            input.MinWidth = 420;
            AutomationProperties.SetAutomationId(input, id);
            return input;
        }
        var name = Field("Titre", Value("Name"), "MetaName");
        var original = Field("Titre original", Value("OriginalTitle"), "MetaOriginal");
        var sortName = Field("Titre de tri (vide : automatique)", Value("ForcedSortName"), "MetaSort");
        var year = Field("Année", document["ProductionYear"]?.ToString() ?? "", "MetaYear");
        var premiere = Field("Date de sortie (AAAA-MM-JJ)",
            DateTime.TryParse(Value("PremiereDate"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var date) ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "", "MetaPremiere");
        var overviewLabel = Text("Synopsis", 13, true, "Muted");
        overviewLabel.Margin = new Thickness(0, 12, 0, 5);
        form.Children.Add(overviewLabel);
        var overview = new TextBox
        {
            Text = Value("Overview"), AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 120, MaxWidth = 760,
            HorizontalAlignment = HorizontalAlignment.Stretch, VerticalScrollBarVisibility = ScrollBarVisibility.Auto
        };
        AutomationProperties.SetName(overview, "Synopsis");
        AutomationProperties.SetAutomationId(overview, "MetaOverview");
        form.Children.Add(overview);
        var tagline = Field("Slogan", document["Taglines"] is JsonArray lines && lines.Count > 0 ? lines[0]?.ToString() ?? "" : "", "MetaTagline");
        var official = Field("Classification (ex. TP, 12, 16)", Value("OfficialRating"), "MetaOfficial");
        var rating = Field("Note (0 à 10)", document["CommunityRating"] is JsonValue score && score.TryGetValue<double>(out var number)
            ? number.ToString("0.#", CultureInfo.InvariantCulture) : "", "MetaRating");
        var genres = Field("Genres (séparés par des virgules)", Names("Genres"), "MetaGenres");
        var tags = Field("Tags (séparés par des virgules)", Names("Tags"), "MetaTags");
        var studios = Field("Studios (séparés par des virgules)", Names("Studios"), "MetaStudios");
        async Task<bool> Backup()
        {
            try
            {
                await File.WriteAllTextAsync(Path.Combine(EditBackupDirectory(item.Id), "metadonnees-" + BackupStamp + ".json"),
                    document.ToJsonString(new JsonSerializerOptions { WriteIndented = true }), lifetime.Token);
                return true;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or OperationCanceledException)
            {
                ShowStatus("Sauvegarde impossible sur ce PC : rien n’a été modifié.");
                return false;
            }
        }
        static JsonArray Split(string text, bool named) => new(text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase).Select(value => named ? (JsonNode)new JsonObject { ["Name"] = value } : JsonValue.Create(value)!).ToArray());
        var save = Action("Enregistrer", async () =>
        {
            int? chosenYear = null; DateTime? chosenDate = null; double? chosenRating = null;
            if (year.Text.Trim() is { Length: > 0 } yearText)
            {
                if (!int.TryParse(yearText, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) || parsed is < 1850 or > 2200) { ShowStatus("Année invalide."); return; }
                chosenYear = parsed;
            }
            if (premiere.Text.Trim() is { Length: > 0 } dateText)
            {
                if (!DateTime.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
                { ShowStatus("Date de sortie invalide (AAAA-MM-JJ)."); return; }
                chosenDate = parsed;
            }
            if (rating.Text.Trim().Replace(',', '.') is { Length: > 0 } ratingText)
            {
                if (!double.TryParse(ratingText, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) || parsed is < 0 or > 10) { ShowStatus("Note invalide (0 à 10)."); return; }
                chosenRating = parsed;
            }
            if (string.IsNullOrWhiteSpace(name.Text)) { ShowStatus("Le titre ne peut pas être vide."); return; }
            if (!await Backup()) return;
            var updated = document.DeepClone().AsObject();
            static JsonNode? Optional(string text) => string.IsNullOrWhiteSpace(text) ? null : JsonValue.Create(text.Trim());
            updated["Name"] = name.Text.Trim();
            updated["OriginalTitle"] = Optional(original.Text);
            updated["ForcedSortName"] = Optional(sortName.Text);
            updated["ProductionYear"] = chosenYear is int value ? JsonValue.Create(value) : null;
            updated["PremiereDate"] = chosenDate is DateTime day ? JsonValue.Create(day.ToString("yyyy-MM-dd'T'00:00:00.0000000'Z'", CultureInfo.InvariantCulture)) : null;
            updated["Overview"] = Optional(overview.Text);
            updated["Taglines"] = string.IsNullOrWhiteSpace(tagline.Text) ? new JsonArray() : new JsonArray(JsonValue.Create(tagline.Text.Trim()));
            updated["OfficialRating"] = Optional(official.Text);
            updated["CommunityRating"] = chosenRating is double stars ? JsonValue.Create(Math.Round(stars, 1)) : null;
            updated["Genres"] = Split(genres.Text, false);
            updated["Tags"] = Split(tags.Text, false);
            updated["Studios"] = Split(studios.Text, true);
            try
            {
                await account.UpdateItem(item.Id, updated, lifetime.Token);
                Trace($"métadonnées enregistrées {item.Id} « {name.Text.Trim()} »");
                ShowStatus("Métadonnées enregistrées (ancienne version gardée sur ce PC).");
                _ = Navigate(MetadataPage(item), back: true);
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé ces métadonnées."); }
        }, "Primary");
        AutomationProperties.SetAutomationId(save, "MetaSave");
        var missing = Action("Compléter depuis Internet", async () =>
        {
            try
            {
                await account.RefreshItem(item.Id, false, false, lifetime.Token);
                Trace($"actualisation demandée {item.Id} (compléter)");
                ShowStatus("Actualisation lancée : Jellyfin complète les informations et images manquantes.");
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé l’actualisation."); }
        });
        AutomationProperties.SetAutomationId(missing, "MetaRefresh");
        var replace = Action("Tout remplacer depuis Internet…", async () =>
        {
            if (MessageBox.Show(this, "Remplacer toutes les métadonnées de « " + item.DisplayTitle + " » par celles trouvées en ligne ? Les valeurs actuelles sont gardées sur ce PC. Les images ne sont pas remplacées.",
                "Tout remplacer", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            if (!await Backup()) return;
            try
            {
                await account.RefreshItem(item.Id, true, false, lifetime.Token);
                ShowStatus("Remplacement lancé (ancienne version gardée sur ce PC).");
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Jellyfin a refusé l’actualisation."); }
        });
        var images = Action("Modifier les images", () => _ = Navigate(ImagesPage(item)));
        var actions = new WrapPanel { Margin = new Thickness(0, 22, 0, 0) };
        foreach (var button in new[] { save, missing, replace, images }) { button.Margin = new Thickness(0, 0, 10, 10); actions.Children.Add(button); }
        form.Children.Add(actions);
        PageContent.Children.Add(Sheet(form));
    });

    // Fiche et menu des cartes : accès aux éditeurs (administrateurs).
    private IEnumerable<Button> EditorButtons(Jellyfin account, MediaItem item)
    {
        if (!CanEditMetadata(account) || item.Type is "Person" or "Playlist" or "Photo") yield break;
        var images = Action("Modifier les images", () => _ = Navigate(ImagesPage(item)));
        AutomationProperties.SetAutomationId(images, "EditImages");
        yield return images;
        var metadata = Action("Modifier les métadonnées", () => _ = Navigate(MetadataPage(item)));
        AutomationProperties.SetAutomationId(metadata, "EditMetadata");
        yield return metadata;
    }
}
