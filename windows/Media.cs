using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;

namespace Noctra.Windows;

// 0.7 : musique (albums, artistes, titres), listes de lecture, photos, personnes,
// fiche technique, bandes-annonces et liens externes.
public partial class MainWindow
{
    // Types de contenu par médiathèque (aperçus de l'accueil et parcours).
    private static string LibraryTypes(MediaItem library) => library.CollectionType switch
    {
        "music" => "MusicAlbum",
        "photos" => "Photo,Video",
        "homevideos" => "Video,Photo",
        "musicvideos" => "MusicVideo",
        "books" => "Book",
        "playlists" => "Playlist",
        _ => "Movie,Series"
    };

    private void OpenLibrary(MediaItem library)
    {
        switch (library.CollectionType)
        {
            case "music": _ = Navigate(MusicPage(library, "MusicAlbum")); break;
            case "playlists": _ = Navigate(PlaylistsPage); break;
            case "photos":
            case "homevideos":
                _ = Navigate(BrowsePage(library.Name, ButtonTab.Library, LibraryTypes(library), library.Id, sort: "DateCreated"));
                break;
            case "books":
                _ = Navigate(new(library.Name, ButtonTab.Library, (account, cancellation) =>
                {
                    PageContent.Children.Clear();
                    PageContent.Children.Add(FeatureHero("", "LIVRES", library.Name, "La lecture des livres et bandes dessinées se fait dans la PWA Noctra (lecteur EPUB / PDF du navigateur)."));
                    return Task.CompletedTask;
                }));
                break;
            default:
                _ = Navigate(BrowsePage(library.Name, ButtonTab.Library, library.CollectionType == "musicvideos" ? "MusicVideo" : null, library.Id));
                break;
        }
    }

    // ---------- En-tête carré (album, artiste, liste, personne) ----------

    private FrameworkElement SquareHero(MediaItem item, string eyebrow, string title, string subtitle, string? text, bool portrait, CancellationToken cancellation, params Button[] actions)
    {
        var grid = new Grid { Margin = new Thickness(0, 10, 0, 26) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        var width = portrait ? 210 : 260;
        var height = portrait ? 300 : 260;
        var image = new Image { Stretch = Stretch.UniformToFill };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        FadeInWhenLoaded(image);
        var frame = new Grid { Width = width, Height = height, Background = new LinearGradientBrush(Color.FromRgb(36, 32, 62), Color.FromRgb(16, 20, 34), 45) };
        frame.Children.Add(new TextBlock { Text = item.Type switch { "MusicArtist" or "Person" => "", "Playlist" => "", _ => "" },
            FontFamily = (FontFamily)Resources["IconFont"], FontSize = 64, Foreground = ColorOf("#3A3F55"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
        frame.Children.Add(image);
        frame.Clip = new RectangleGeometry(new Rect(0, 0, width, height), 18, 18);
        var cover = new Border { Child = frame, Effect = new DropShadowEffect { BlurRadius = 50, ShadowDepth = 14, Opacity = .65, Color = Colors.Black }, Margin = new Thickness(0, 0, 34, 0) };
        grid.Children.Add(cover);
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom };
        Grid.SetColumn(copy, 1);
        copy.Children.Add(Text(eyebrow, 12, true, "Accent"));
        var heading = Text(title, 46, true);
        heading.TextWrapping = TextWrapping.Wrap;
        heading.Margin = new Thickness(0, 8, 0, 6);
        copy.Children.Add(heading);
        var sub = Text(subtitle, 15, color: "Muted");
        sub.TextWrapping = TextWrapping.Wrap;
        copy.Children.Add(sub);
        if (!string.IsNullOrWhiteSpace(text))
        {
            var overview = Text(text, 14, color: "Ink");
            overview.Opacity = .85;
            overview.TextWrapping = TextWrapping.Wrap;
            overview.TextTrimming = TextTrimming.WordEllipsis;
            overview.MaxHeight = 88;
            overview.MaxWidth = 720;
            overview.HorizontalAlignment = HorizontalAlignment.Left;
            overview.Margin = new Thickness(0, 14, 0, 0);
            copy.Children.Add(overview);
        }
        var row = new WrapPanel { Margin = new Thickness(0, 20, 0, 0) };
        foreach (var button in actions)
        {
            button.Margin = new Thickness(0, 0, 10, 10);
            button.MinHeight = 46;
            row.Children.Add(button);
        }
        copy.Children.Add(row);
        grid.Children.Add(copy);
        _ = artwork?.Load(image, item, false, 600, cancellation);
        _ = artwork?.LoadBlurred(AmbientArt, item, false, cancellation);
        Reveal(copy, 90, 14);
        return grid;
    }

    // ---------- Musique ----------

    private Page MusicPage(MediaItem library, string type) => new(library.Name, ButtonTab.Library, async (account, cancellation) =>
    {
        var query = new Dictionary<string, string>
        {
            ["ParentId"] = library.Id, ["Recursive"] = "true", ["Limit"] = "120",
            ["IncludeItemTypes"] = type, ["SortBy"] = type == "Audio" ? "DatePlayed,SortName" : "SortName", ["SortOrder"] = type == "Audio" ? "Descending" : "Ascending"
        };
        var result = type == "MusicArtist"
            ? await ArtistPage(account, library.Id, cancellation)
            : await account.Items(query, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading(library.Name, result.TotalRecordCount is int count ? count.ToString("N0", CultureInfo.CurrentCulture) + (type == "MusicAlbum" ? " albums" : type == "MusicArtist" ? " artistes" : " titres") : "Musique"));
        var tabs = new WrapPanel { Margin = new Thickness(0, 0, 0, 20) };
        foreach (var (key, label) in new[] { ("MusicAlbum", "Albums"), ("MusicArtist", "Artistes"), ("Audio", "Titres") })
        {
            var tab = Action(label, () => _ = Navigate(MusicPage(library, key), back: true), key == type ? "Primary" : "Action");
            tab.Margin = new Thickness(0, 0, 8, 8);
            tabs.Children.Add(tab);
        }
        var items = (result.Items ?? []).Where(item => PlayRequest.Identifier(item.Id)).ToArray();
        if (type == "Audio" && items.Length > 0)
        {
            var shuffle = Action("Lecture aléatoire", () => PlayQueue(items.OrderBy(_ => Random.Shared.Next()).ToArray(), 0), "Action");
            shuffle.Margin = new Thickness(18, 0, 8, 8);
            tabs.Children.Add(shuffle);
        }
        PageContent.Children.Add(tabs);
        if (items.Length == 0) { PageContent.Children.Add(Message("Rien à écouter dans cette section pour le moment.")); return; }
        if (type == "Audio") { PageContent.Children.Add(TrackList(items, cancellation, showAlbum: true)); return; }
        var cards = PosterGrid(items.All(item => item.Square) ? 210 : 178);
        foreach (var item in items) cards.Children.Add(Card(item, false, ButtonTab.Library, cancellation, fluid: true));
        PageContent.Children.Add(cards);
    });

    private async Task<ItemPage> ArtistPage(Jellyfin account, string library, CancellationToken cancellation)
    {
        var data = await account.ReadJson("Artists/AlbumArtists?ParentId=" + library + "&UserId=" + account.User.Id + "&Limit=150&Fields=PrimaryImageAspectRatio,Overview", cancellation);
        var items = data.List("Items").Select(item => item.Deserialize<MediaItem>(Jellyfin.Json)!).Where(item => item != null).ToArray();
        return new ItemPage(items, (int?)data.Num("TotalRecordCount"));
    }

    private async Task RenderAlbum(Jellyfin account, MediaItem album, CancellationToken cancellation)
    {
        var tracks = (await account.Items(new()
        {
            ["ParentId"] = album.Id, ["IncludeItemTypes"] = "Audio", ["Recursive"] = "true",
            ["SortBy"] = "ParentIndexNumber,IndexNumber,SortName", ["SortOrder"] = "Ascending", ["Limit"] = "400"
        }, cancellation)).Items?.Where(item => PlayRequest.Identifier(item.Id)).ToArray() ?? [];
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        var length = TimeSpan.FromTicks(tracks.Sum(track => track.RunTimeTicks ?? 0));
        var play = Action("▶   Tout lire", () => PlayQueue(tracks, 0), "Primary");
        play.IsEnabled = tracks.Length > 0;
        AutomationProperties.SetAutomationId(play, "PrimaryPlayback");
        var shuffle = Action("Lecture aléatoire", () => PlayQueue(tracks.OrderBy(_ => Random.Shared.Next()).ToArray(), 0));
        shuffle.IsEnabled = tracks.Length > 1;
        PageContent.Children.Add(SquareHero(album, "ALBUM", album.Name,
            string.Join(" · ", new[] { album.AlbumArtist, album.ProductionYear?.ToString(CultureInfo.InvariantCulture),
                tracks.Length + " titre" + (tracks.Length > 1 ? "s" : ""), Duration(length) }.Where(part => !string.IsNullOrWhiteSpace(part))),
            album.Overview, false, cancellation, play, shuffle, FavoriteButton(account, album, cancellation), PlaylistButton(album)));
        PageContent.Children.Add(tracks.Length == 0 ? Message("Aucun titre dans cet album.") : TrackList(tracks, cancellation));
    }

    private async Task RenderArtist(Jellyfin account, MediaItem artist, CancellationToken cancellation)
    {
        var albums = (await account.Items(new()
        {
            ["AlbumArtistIds"] = artist.Id, ["IncludeItemTypes"] = "MusicAlbum", ["Recursive"] = "true",
            ["SortBy"] = "ProductionYear,SortName", ["SortOrder"] = "Descending", ["Limit"] = "200"
        }, cancellation)).Items?.Where(item => PlayRequest.Identifier(item.Id)).ToArray() ?? [];
        var tracks = (await account.Items(new()
        {
            ["ArtistIds"] = artist.Id, ["IncludeItemTypes"] = "Audio", ["Recursive"] = "true",
            ["SortBy"] = "PlayCount,SortName", ["SortOrder"] = "Descending", ["Limit"] = "20"
        }, cancellation)).Items?.Where(item => PlayRequest.Identifier(item.Id)).ToArray() ?? [];
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        var play = Action("▶   Écouter", () => PlayQueue(tracks, 0), "Primary");
        play.IsEnabled = tracks.Length > 0;
        PageContent.Children.Add(SquareHero(artist, "ARTISTE", artist.Name, albums.Length + " album" + (albums.Length > 1 ? "s" : ""),
            artist.Overview, false, cancellation, play, FavoriteButton(account, artist, cancellation)));
        if (tracks.Length > 0)
        {
            var heading = Text("Titres populaires", 22, true);
            heading.Margin = new Thickness(0, 6, 0, 12);
            PageContent.Children.Add(heading);
            PageContent.Children.Add(TrackList(tracks.Take(10).ToArray(), cancellation, showAlbum: true));
        }
        AddShelf("Albums", albums, "Aucun album.", false, cancellation);
    }

    private FrameworkElement TrackList(MediaItem[] tracks, CancellationToken cancellation, bool showAlbum = false, string? playlist = null)
    {
        var list = new StackPanel();
        for (var index = 0; index < tracks.Length; index++)
        {
            var track = tracks[index];
            var position = index;
            var row = new DockPanel { Background = Brushes.Transparent };
            var duration = Text(track.RunTimeTicks is > 0 ? FormatTime(TimeSpan.FromTicks(track.RunTimeTicks.Value).TotalSeconds).TrimStart('0', ':') : "", 13, color: "Muted");
            duration.VerticalAlignment = VerticalAlignment.Center;
            duration.MinWidth = 52;
            duration.TextAlignment = TextAlignment.Right;
            DockPanel.SetDock(duration, Dock.Right);
            row.Children.Add(duration);
            if (playlist != null && track.PlaylistItemId is { Length: > 0 } entry)
            {
                var remove = Action("Retirer", async () =>
                {
                    if (client is not { } account) return;
                    try { await account.RemoveFromPlaylist(playlist, entry, cancellation); _ = Navigate(page!, back: true); }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("Le titre n’a pas pu être retiré."); }
                }, "DockIcon");
                remove.Content = "";
                AutomationProperties.SetName(remove, "Retirer de la liste");
                remove.Margin = new Thickness(8, 0, 0, 0);
                DockPanel.SetDock(remove, Dock.Right);
                row.Children.Add(remove);
            }
            var number = Text(track.IndexNumber is int value && !showAlbum && playlist == null ? value.ToString(CultureInfo.InvariantCulture) : (index + 1).ToString(CultureInfo.InvariantCulture), 14, color: "Muted");
            number.Width = 34;
            number.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(number, Dock.Left);
            row.Children.Add(number);
            var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            var name = Text(track.Type == "Audio" ? track.Name : track.DisplayTitle, 15, true);
            name.TextTrimming = TextTrimming.CharacterEllipsis;
            copy.Children.Add(name);
            var caption = Text(track.Type == "Audio" ? (showAlbum ? track.Caption : track.Artists is { Length: > 0 } artists ? string.Join(", ", artists) : "") : track.Caption, 12.5, color: "Muted");
            caption.TextTrimming = TextTrimming.CharacterEllipsis;
            if (caption.Text.Length > 0) copy.Children.Add(caption);
            row.Children.Add(copy);
            var button = Action(track.Name, () => PlayQueue(tracks, position), "Card");
            button.Content = new Border { Child = row, Padding = new Thickness(14, 10, 14, 10), CornerRadius = new CornerRadius(10) };
            button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
            button.Margin = new Thickness(0, 0, 0, 2);
            var surface = (Border)button.Content;
            button.MouseEnter += (_, _) => surface.Background = ColorOf("#12FFFFFF");
            button.MouseLeave += (_, _) => surface.Background = Brushes.Transparent;
            LazyMenu(button, () => CardMenu(track, button, ButtonTab.Library, cancellation));
            list.Children.Add(button);
        }
        return list;
    }

    private static string Duration(TimeSpan length) => length.TotalMinutes < 1 ? "" :
        length.TotalHours >= 1 ? $"{(int)length.TotalHours} h {length.Minutes:00}" : $"{length.Minutes} min";

    // ---------- Listes de lecture ----------

    private Page PlaylistsPage => new("Listes de lecture", ButtonTab.None, async (account, cancellation) =>
    {
        var result = await account.Items(new() { ["IncludeItemTypes"] = "Playlist", ["Recursive"] = "true", ["SortBy"] = "SortName", ["Limit"] = "200" }, cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(FeatureHero("", "LISTES DE LECTURE", "Vos programmations, dans l’ordre.",
            "Assemblez films, épisodes et musiques (clic droit sur une carte › Ajouter à une liste) puis lancez tout d’un coup : chaque titre enchaîne sur le suivant."));
        var create = Action("Nouvelle liste", async () =>
        {
            if (AskText("Nouvelle liste de lecture", "Nom de la liste") is not { Length: > 0 } name) return;
            try
            {
                var id = await account.CreatePlaylist(name[..Math.Min(name.Length, 120)], [], cancellation);
                ShowStatus("Liste « " + name + " » créée.");
                if (PlayRequest.Identifier(id)) OpenDetail(new MediaItem { Id = id, Name = name, Type = "Playlist" }, ButtonTab.None);
                else _ = Navigate(PlaylistsPage, back: true);
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException) { ShowStatus("La liste n’a pas pu être créée."); }
        }, "Primary");
        create.HorizontalAlignment = HorizontalAlignment.Left;
        create.Margin = new Thickness(0, 0, 0, 20);
        PageContent.Children.Add(create);
        var items = (result.Items ?? []).Where(item => PlayRequest.Identifier(item.Id)).ToArray();
        if (items.Length == 0) { PageContent.Children.Add(Message("Aucune liste de lecture pour ce profil.")); return; }
        var cards = PosterGrid();
        foreach (var item in items) cards.Children.Add(Card(item, false, ButtonTab.None, cancellation, fluid: true));
        PageContent.Children.Add(cards);
    });

    private async Task RenderPlaylist(Jellyfin account, MediaItem playlist, CancellationToken cancellation)
    {
        var entries = (await account.PlaylistItems(playlist.Id, cancellation)).Items?.Where(item => PlayRequest.Identifier(item.Id)).ToArray() ?? [];
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        var length = TimeSpan.FromTicks(entries.Sum(entry => entry.RunTimeTicks ?? 0));
        var playable = entries.Where(entry => entry.CanPlay).ToArray();
        var play = Action("▶   Tout lire", () => PlayQueue(playable, 0), "Primary");
        play.IsEnabled = playable.Length > 0;
        AutomationProperties.SetAutomationId(play, "PrimaryPlayback");
        var shuffle = Action("Lecture aléatoire", () => PlayQueue(playable.OrderBy(_ => Random.Shared.Next()).ToArray(), 0));
        shuffle.IsEnabled = playable.Length > 1;
        var delete = Action("Supprimer la liste", async () =>
        {
            if (MessageBox.Show(this, "Supprimer la liste « " + playlist.Name + " » ? Les titres eux-mêmes ne sont pas supprimés.", "Liste de lecture",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            try { await account.Command("Items/" + playlist.Id, null, cancellation, HttpMethod.Delete); ShowStatus("Liste supprimée."); _ = Navigate(PlaylistsPage); }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("La liste n’a pas pu être supprimée."); }
        });
        PageContent.Children.Add(SquareHero(playlist, "LISTE DE LECTURE", playlist.Name,
            entries.Length + " élément" + (entries.Length > 1 ? "s" : "") + (length.TotalMinutes >= 1 ? " · " + Duration(length) : ""), playlist.Overview, false, cancellation, play, shuffle, delete));
        PageContent.Children.Add(entries.Length == 0 ? Message("Liste vide. Ajoutez des titres avec un clic droit sur une carte › « Ajouter à une liste de lecture ».")
            : TrackList(entries, cancellation, showAlbum: true, playlist: playlist.Id));
    }

    // Menu « Ajouter à une liste de lecture » (cartes, fiches) : listes chargées à l'ouverture.
    private MenuItem PlaylistMenu(MediaItem item, CancellationToken cancellation)
    {
        var root = new MenuItem { Header = "Ajouter à une liste de lecture" };
        var placeholder = new MenuItem { Header = "Chargement…", IsEnabled = false };
        root.Items.Add(placeholder);
        root.SubmenuOpened += async (_, _) =>
        {
            if (client is not { } account || !root.Items.Contains(placeholder)) return;
            try
            {
                var lists = (await account.Items(new() { ["IncludeItemTypes"] = "Playlist", ["Recursive"] = "true", ["SortBy"] = "SortName", ["Limit"] = "100" }, cancellation)).Items ?? [];
                root.Items.Clear();
                var create = new MenuItem { Header = "Nouvelle liste…" };
                create.Click += async (_, _) =>
                {
                    if (AskText("Nouvelle liste de lecture", "Nom de la liste") is not { Length: > 0 } name) return;
                    try { await account.CreatePlaylist(name[..Math.Min(name.Length, 120)], [item.Id], cancellation); ShowStatus("Ajouté à la nouvelle liste « " + name + " »."); }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException) { ShowStatus("La liste n’a pas pu être créée."); }
                };
                root.Items.Add(create);
                if (lists.Length > 0) root.Items.Add(new Separator());
                foreach (var list in lists.Where(list => PlayRequest.Identifier(list.Id)))
                {
                    var entry = new MenuItem { Header = list.Name };
                    entry.Click += async (_, _) =>
                    {
                        try { await account.AddToPlaylist(list.Id, [item.Id], cancellation); ShowStatus("Ajouté à « " + list.Name + " »."); }
                        catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { ShowStatus("L’ajout à la liste a échoué."); }
                    };
                    root.Items.Add(entry);
                }
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException) { placeholder.Header = "Listes indisponibles"; }
        };
        return root;
    }

    private Button PlaylistButton(MediaItem item)
    {
        var button = Action("Ajouter à une liste", () => { });
        button.Click += (_, _) =>
        {
            var menu = new ContextMenu { PlacementTarget = button, Placement = PlacementMode.Bottom };
            var entry = PlaylistMenu(item, pageRequest?.Token ?? lifetime.Token);
            menu.Items.Add(entry);
            menu.IsOpen = true;
            entry.IsSubmenuOpen = true;
        };
        return button;
    }

    // ---------- Personnes ----------

    private async Task RenderPerson(Jellyfin account, MediaItem person, CancellationToken cancellation)
    {
        var works = (await account.Items(new()
        {
            ["PersonIds"] = person.Id, ["IncludeItemTypes"] = "Movie,Series", ["Recursive"] = "true",
            ["SortBy"] = "ProductionYear,SortName", ["SortOrder"] = "Descending", ["Limit"] = "120"
        }, cancellation)).Items?.Where(item => PlayRequest.Identifier(item.Id)).ToArray() ?? [];
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        var born = person.PremiereDate is { } date ? "Né(e) le " + date.ToLocalTime().ToString("d MMMM yyyy", CultureInfo.GetCultureInfo("fr-FR")) : "";
        PageContent.Children.Add(SquareHero(person, "DISTRIBUTION", person.Name,
            string.Join(" · ", new[] { born, works.Length + " titre" + (works.Length > 1 ? "s" : "") + " dans vos médiathèques" }.Where(part => part.Length > 0)),
            person.Overview, true, cancellation));
        if (works.Length == 0) { PageContent.Children.Add(Message("Aucun titre de vos médiathèques avec cette personne.")); return; }
        var cards = PosterGrid();
        foreach (var item in works) cards.Children.Add(Card(item, false, ButtonTab.None, cancellation, fluid: true));
        PageContent.Children.Add(cards);
    }

    // ---------- Fiche : badges techniques, faits, liens ----------

    private FrameworkElement? DetailFacts(MediaItem item)
    {
        var row = new WrapPanel { Margin = new Thickness(0, 14, 0, 0) };
        void Pill(string text, bool strong = false)
        {
            row.Children.Add(new Border
            {
                CornerRadius = new CornerRadius(7), Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 7, 7),
                Background = strong ? ColorOf("#2EBCAAFF") : ColorOf("#1AFFFFFF"), BorderBrush = strong ? ColorOf("#59BCAAFF") : ColorOf("#22FFFFFF"), BorderThickness = new Thickness(1),
                Child = new TextBlock { Text = text, FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = strong ? BrushFor("Accent") : BrushFor("Ink") }
            });
        }
        if (item.CommunityRating is > 0 and var rating) Pill("★ " + rating.ToString("0.0", CultureInfo.CurrentCulture));
        if (item.CriticRating is > 0 and var critics) Pill("Critiques " + critics.ToString("0", CultureInfo.CurrentCulture) + " %");
        if (item.RunTimeTicks is > 0 && item.Type != "Series")
        {
            Pill(Duration(TimeSpan.FromTicks(item.RunTimeTicks.Value)));
            var remaining = TimeSpan.FromTicks(item.RunTimeTicks.Value - item.Resume);
            Pill("Fin à " + DateTime.Now.Add(remaining).ToString("HH:mm", CultureInfo.CurrentCulture));
        }
        var streams = item.MediaSources?.FirstOrDefault()?.MediaStreams ?? [];
        if (streams.FirstOrDefault(stream => stream.Type == "Video") is { } video)
        {
            var width = video.Width ?? 0;
            var height = video.Height ?? 0;
            Pill(width >= 3800 || height >= 2000 ? "4K" : width >= 1900 || height >= 1000 ? "1080p" : width >= 1260 || height >= 700 ? "720p" : width > 0 ? "SD" : "Vidéo", width >= 3800 || height >= 2000);
            var range = video.VideoRangeType ?? video.VideoRange ?? "";
            if (range.StartsWith("DOVI", StringComparison.OrdinalIgnoreCase)) Pill("Dolby Vision", true);
            else if (range.Contains("HDR10Plus", StringComparison.OrdinalIgnoreCase)) Pill("HDR10+", true);
            else if (range.Contains("HDR", StringComparison.OrdinalIgnoreCase) || range.Contains("PQ", StringComparison.OrdinalIgnoreCase)) Pill("HDR", true);
            else if (range.Contains("HLG", StringComparison.OrdinalIgnoreCase)) Pill("HLG", true);
            if (video.Codec is { Length: > 0 } codec) Pill(codec.ToLowerInvariant() switch { "hevc" or "h265" => "HEVC", "h264" or "avc" => "H.264", "av1" => "AV1", "vp9" => "VP9", var other => other.ToUpperInvariant() });
        }
        var audio = streams.Where(stream => stream.Type == "Audio").ToArray();
        if ((audio.FirstOrDefault(stream => stream.IsDefault) ?? audio.FirstOrDefault()) is { } main)
        {
            var label = (main.DisplayTitle ?? "") + " " + (main.Profile ?? "") + " " + (main.Title ?? "");
            if (label.Contains("Atmos", StringComparison.OrdinalIgnoreCase)) Pill("Dolby Atmos", true);
            else if (label.Contains("DTS:X", StringComparison.OrdinalIgnoreCase) || label.Contains("DTS-X", StringComparison.OrdinalIgnoreCase)) Pill("DTS:X", true);
            Pill(main.Channels switch { >= 8 => "7.1", >= 6 => "5.1", 2 => "Stéréo", 1 => "Mono", _ => main.Codec?.ToUpperInvariant() ?? "Audio" });
        }
        var languages = audio.Select(stream => stream.Language).Where(language => !string.IsNullOrWhiteSpace(language)).Distinct().Take(4).ToArray();
        if (languages.Length > 1) Pill(languages.Length + " langues audio");
        var subtitles = streams.Count(stream => stream.Type == "Subtitle");
        if (subtitles > 0) Pill(subtitles + " sous-titre" + (subtitles > 1 ? "s" : ""));
        return row.Children.Count > 0 ? row : null;
    }

    private FrameworkElement? TechnicalInfo(MediaItem item)
    {
        var source = item.MediaSources?.FirstOrDefault();
        if (source?.MediaStreams is not { Length: > 0 } streams) return null;
        var table = new Grid { Margin = new Thickness(4, 12, 0, 6) };
        table.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(150) });
        table.ColumnDefinitions.Add(new ColumnDefinition());
        void Line(string label, string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            table.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var name = Text(label, 13, true, "Muted");
            var text = Text(value, 13);
            text.TextWrapping = TextWrapping.Wrap;
            name.Margin = text.Margin = new Thickness(0, 0, 12, 7);
            Grid.SetRow(name, table.RowDefinitions.Count - 1);
            Grid.SetRow(text, table.RowDefinitions.Count - 1);
            Grid.SetColumn(text, 1);
            table.Children.Add(name);
            table.Children.Add(text);
        }
        Line("Fichier", string.Join(" · ", new[] { source.Container?.ToUpperInvariant(), source.Size is > 0 ? Size(source.Size.Value) : null,
            source.Bitrate is > 0 ? (source.Bitrate.Value / 1_000_000.0).ToString("0.0", CultureInfo.CurrentCulture) + " Mb/s" : null }.Where(part => !string.IsNullOrWhiteSpace(part))));
        foreach (var video in streams.Where(stream => stream.Type == "Video"))
            Line("Vidéo", string.Join(" · ", new[] { video.DisplayTitle, video.Width is > 0 ? video.Width + " × " + video.Height : null,
                video.RealFrameRate is > 0 ? video.RealFrameRate.Value.ToString("0.###", CultureInfo.CurrentCulture) + " i/s" : null }.Where(part => !string.IsNullOrWhiteSpace(part))));
        var index = 0;
        foreach (var audio in streams.Where(stream => stream.Type == "Audio"))
            Line(index++ == 0 ? "Audio" : "", audio.DisplayTitle ?? audio.Codec ?? "");
        index = 0;
        foreach (var subtitle in streams.Where(stream => stream.Type == "Subtitle"))
            Line(index++ == 0 ? "Sous-titres" : "", (subtitle.DisplayTitle ?? subtitle.Language ?? "") + (subtitle.IsExternal ? " · fichier externe" : ""));
        var expander = new Expander { Header = "Informations techniques", Content = table, Margin = new Thickness(0, 22, 0, 0), Foreground = BrushFor("Ink") };
        AutomationProperties.SetAutomationId(expander, "TechnicalInfo");
        return expander;
    }

    private IEnumerable<Button> DetailLinks(Jellyfin account, MediaItem item, CancellationToken cancellation)
    {
        if (item.LocalTrailerCount is > 0)
            yield return Action("Bande-annonce", async () =>
            {
                try
                {
                    var trailers = await account.ReadJson("Users/" + account.User.Id + "/Items/" + item.Id + "/LocalTrailers", cancellation);
                    var first = trailers.List().Select(trailer => trailer.Deserialize<MediaItem>(Jellyfin.Json)).FirstOrDefault(trailer => trailer != null && PlayRequest.Identifier(trailer.Id));
                    if (first != null) StartPlayback(first with { Type = "Trailer" }, 0);
                }
                catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException) { ShowStatus("Bande-annonce indisponible."); }
            });
        else if (item.RemoteTrailers?.FirstOrDefault(trailer => SafeLink(trailer.Url)) is { } remote)
            yield return Action("Bande-annonce ↗", () => OpenLink(remote.Url!));
        foreach (var link in (item.ExternalUrls ?? []).Where(link => SafeLink(link.Url) && link.Name is "IMDb" or "TheMovieDb" or "Trakt" or "TheTVDB" or "AniDB" or "MusicBrainz").Take(3))
            yield return Action(link.Name + " ↗", () => OpenLink(link.Url!));
    }

    private static bool SafeLink(string? url) => Uri.TryCreate(url, UriKind.Absolute, out var link) && link.Scheme == "https" && link.UserInfo.Length == 0;
    private void OpenLink(string url)
    {
        if (!SafeLink(url)) return;
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { ShowStatus("Impossible d’ouvrir le navigateur."); }
    }

    // ---------- Photos ----------

    private async Task OpenPhoto(MediaItem photo)
    {
        if (client is not { } account) return;
        MediaItem[] siblings = [photo];
        try
        {
            if (photo.ParentId is { } parent && PlayRequest.Identifier(parent))
                siblings = (await account.Items(new() { ["ParentId"] = parent, ["IncludeItemTypes"] = "Photo", ["SortBy"] = "SortName", ["Limit"] = "500" }, lifetime.Token)).Items?
                    .Where(item => PlayRequest.Identifier(item.Id)).ToArray() is { Length: > 0 } found ? found : [photo];
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException) { }
        var index = Math.Max(0, Array.FindIndex(siblings, item => item.Id == photo.Id));
        var viewer = new Window
        {
            Owner = this, Title = "Noctra · Photos", Background = Brushes.Black, WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Width = Math.Max(900, ActualWidth * .9), Height = Math.Max(600, ActualHeight * .9), Foreground = BrushFor("Ink"), FontFamily = FontFamily
        };
        var image = new Image { Stretch = Stretch.Uniform };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
        var caption = new TextBlock { Foreground = BrushFor("Ink"), FontSize = 14, Margin = new Thickness(20, 14, 20, 16), HorizontalAlignment = HorizontalAlignment.Center };
        var layout = new DockPanel();
        DockPanel.SetDock(caption, Dock.Bottom);
        layout.Children.Add(caption);
        layout.Children.Add(image);
        viewer.Content = layout;
        void Show()
        {
            var item = siblings[index];
            caption.Text = item.Name + "  ·  " + (index + 1) + " / " + siblings.Length + "  ·  ← → pour naviguer, Échap pour fermer";
            image.Source = null;
            _ = artwork?.Load(image, item, false, 2400, lifetime.Token);
        }
        viewer.KeyDown += (_, args) =>
        {
            if (args.Key == Key.Escape) viewer.Close();
            else if (args.Key == Key.Right && index + 1 < siblings.Length) { index++; Show(); }
            else if (args.Key == Key.Left && index > 0) { index--; Show(); }
        };
        Show();
        viewer.Show();
    }

    // ---------- Identification (administrateurs) ----------

    private Page IdentifyPage(MediaItem item) => new("Corriger l’identification", ButtonTab.None, async (account, cancellation) =>
    {
        if (!await AdminAccess(account, cancellation)) return;
        var service = new NoctraService(account, account.NoctraRoot!);
        var context = await service.Json("api/jellyfin/identify/context?itemId=" + Uri.EscapeDataString(item.Id), cancellation);
        if (cancellation.IsCancellationRequested) return;
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Corriger l’identification", context.Str("name") + (context.Num("year") > 0 ? " (" + context.Num("year") + ")" : "") + " · " + context.Str("path")));
        if (context.Flag("metadataMismatch")) PageContent.Children.Add(Message("Le nom du fichier ne correspond pas aux informations actuelles : la suggestion ci-dessous vient du fichier."));
        var form = new StackPanel();
        var name = Input(form, "Titre", context.Str("suggestedName"));
        var year = Input(form, "Année", context.Num("suggestedYear") > 0 ? context.Num("suggestedYear").ToString("0", CultureInfo.InvariantCulture) : "");
        var tmdb = Input(form, "Identifiant TMDB (facultatif)", context.Field("recommendedProviderIds").Str("Tmdb"));
        var results = new StackPanel { Margin = new Thickness(0, 18, 0, 0) };
        var search = Action("Rechercher", async () =>
        {
            results.Children.Clear();
            results.Children.Add(Message("Recherche…"));
            try
            {
                var ids = tmdb.Text.Trim().Length > 0 ? new Dictionary<string, string> { ["Tmdb"] = tmdb.Text.Trim() } : [];
                var found = await service.Send("api/jellyfin/identify/search", "POST", new
                {
                    itemId = item.Id,
                    searchInfo = new { Name = name.Text.Trim(), Year = int.TryParse(year.Text, out var value) ? value : (int?)null, ProviderIds = ids }
                }, cancellation);
                results.Children.Clear();
                var list = found.List("results");
                if (list.Length == 0) results.Children.Add(Message("Aucun résultat. Essayez un autre titre ou l’identifiant TMDB."));
                foreach (var result in list.Take(20))
                {
                    var data = result.Clone();
                    var apply = Action("Appliquer", async () =>
                    {
                        if (MessageBox.Show(this, "Associer ce média à « " + data.Str("Name") + " » et remplacer ses informations ?", "Identification",
                            MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                        try
                        {
                            var job = await service.Send("api/jellyfin/identify/apply", "POST", new { itemId = item.Id, result = data, replaceAllImages = true }, cancellation);
                            ShowStatus("Identification en cours…");
                            for (var attempt = 0; attempt < 40 && !cancellation.IsCancellationRequested; attempt++)
                            {
                                await Task.Delay(1500, cancellation);
                                var status = await service.Json("api/jellyfin/identify/apply-status?jobId=" + Uri.EscapeDataString(job.Str("jobId")), cancellation);
                                if (status.Str("status") is "running" or "queued" or "") continue;
                                ShowStatus(status.Str("message") is { Length: > 0 } message ? message : "Identification terminée.");
                                break;
                            }
                        }
                        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
                        { ShowStatus(error is NoctraApiException ? error.Message : "L’identification n’a pas pu être appliquée."); }
                    }, "Primary");
                    results.Children.Add(Row(data.Str("Name") + (data.Num("ProductionYear") > 0 ? " (" + data.Num("ProductionYear") + ")" : ""),
                        string.Join(" · ", new[] { data.Str("SearchProviderName"), data.Str("Overview") }.Where(part => part.Length > 0)), apply));
                }
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
            {
                results.Children.Clear();
                results.Children.Add(Message(error is NoctraApiException ? error.Message : "La recherche a échoué."));
            }
        }, "Primary");
        search.HorizontalAlignment = HorizontalAlignment.Left;
        search.Margin = new Thickness(0, 14, 0, 0);
        form.Children.Add(search);
        PageContent.Children.Add(Sheet(form));
        PageContent.Children.Add(results);
    });
}
