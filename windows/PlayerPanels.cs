using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Noctra.Windows;

// 0.8 : panneaux du lecteur. « Audio et sous-titres » réunit les deux choix (et la recherche de
// sous-titres en ligne) ; « Réglages » regroupe vitesse, format, décalages, chapitres et outils.
// Les choix s'appliquent sans fermer le panneau ; Échap ou un clic sur l'image le ferment.
public partial class MainWindow
{
    private Popup? playerPanel;
    private Button? playerPanelAnchor;
    private Border? playerPanelBody;
    private Func<FrameworkElement>? playerPanelContent;
    private string playerPanelTitle = "";
    private int aspectChoice;

    // ---------- Messages sur l'image (mpv) ----------

    private void Osd(string text)
    {
        if (CurrentEngine is not { } engine) return;
        try { engine.Command("show-text", text.Replace("\n", " "), "1300"); }
        catch (InvalidOperationException) { }
    }

    // ---------- Barre de progression : mémoire tampon, chapitres, heure de fin ----------

    private void ResetTimelineDecorations()
    {
        BufferBar.Width = 0;
        ChapterMarks.Children.Clear();
        EndsAtLabel.Text = "";
    }

    private void UpdateTimelineDecorations(Mpv engine, ActivePlayback state)
    {
        var usable = Math.Max(0, Timeline.ActualWidth - 2);
        if (state.Duration > 0 && usable > 0)
        {
            var ahead = engine.Seconds("demuxer-cache-time") ?? state.Position;
            BufferBar.Width = 1 + Math.Clamp(ahead / state.Duration, 0, 1) * usable;
            var speed = engine.Seconds("speed") is > 0 and var value ? value : 1;
            var end = DateTime.Now.AddSeconds(Math.Max(0, state.Duration - state.Position) / speed);
            EndsAtLabel.Text = state.Session.Audio ? "" : "Fin à " + end.ToString("HH:mm", CultureInfo.GetCultureInfo("fr-FR"));
            if (ChapterMarks.Tag as ActivePlayback != state && state.Chapters.Length > 1) DrawChapterMarks();
        }
    }

    private void DrawChapterMarks()
    {
        ChapterMarks.Children.Clear();
        if (active is not { Duration: > 0, Chapters.Length: > 1 } state || pendingLive != null) return;
        ChapterMarks.Tag = state;
        var usable = Math.Max(0, Timeline.ActualWidth - 2);
        foreach (var chapter in state.Chapters.Skip(1))
        {
            var fraction = chapter.StartPositionTicks / (double)TimeSpan.TicksPerSecond / state.Duration;
            if (fraction is <= .005 or >= .995) continue;
            var mark = new Rectangle { Width = 3, Height = 5, Fill = ColorOf("#E6000000") };
            Canvas.SetLeft(mark, 1 + fraction * usable - 1.5);
            Canvas.SetTop(mark, (Timeline.ActualHeight - 5) / 2);
            ChapterMarks.Children.Add(mark);
        }
    }

    // ---------- Panneau générique ----------

    private void ShowPlayerPanel(Button anchor, string title, Func<FrameworkElement> content, string automationId)
    {
        if (playerPanel?.IsOpen == true && playerPanelAnchor == anchor) { ClosePlayerPanel(); return; }
        ClosePlayerPanel();
        if (trackMenu != null) trackMenu.IsOpen = false;
        playerPanelContent = content;
        playerPanelTitle = title;
        playerPanelBody = new Border
        {
            Background = ColorOf("#F70E1017"), BorderBrush = ColorOf("#30FFFFFF"), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(18), Padding = new Thickness(20, 16, 20, 18),
            MaxHeight = Math.Max(280, Player.ActualHeight - 210), MaxWidth = Math.Max(360, Player.ActualWidth - 60)
        };
        AutomationProperties.SetAutomationId(playerPanelBody, automationId);
        playerPanelBody.PreviewKeyDown += (_, key) =>
        {
            if (key.Key != System.Windows.Input.Key.Escape) return;
            key.Handled = true;
            ClosePlayerPanel();
        };
        RebuildPlayerPanel();
        playerPanelAnchor = anchor;
        playerPanel = new Popup
        {
            AllowsTransparency = true, StaysOpen = true, PlacementTarget = anchor, Placement = PlacementMode.Custom, Child = playerPanelBody,
            CustomPopupPlacementCallback = (popup, target, _) =>
            {
                var scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
                double left;
                try { left = anchor.TranslatePoint(new Point(), PlayerControls).X * scale; }
                catch (InvalidOperationException) { left = 0; }
                var x = Math.Max(target.Width - popup.Width, -left + 20 * scale);
                return [new CustomPopupPlacement(new Point(x, -popup.Height - 18 * scale), PopupPrimaryAxis.None)];
            }
        };
        playerPanel.IsOpen = true;
        controlsIdle.Stop();
    }

    private void RebuildPlayerPanel()
    {
        if (playerPanelBody == null || playerPanelContent == null) return;
        var stack = new StackPanel();
        var heading = Text(playerPanelTitle.ToUpperInvariant(), 11, true, "Accent");
        heading.Margin = new Thickness(2, 0, 0, 12);
        stack.Children.Add(heading);
        stack.Children.Add(playerPanelContent());
        playerPanelBody.Child = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Focusable = false };
    }

    private void ClosePlayerPanel()
    {
        if (playerPanel != null) playerPanel.IsOpen = false;
        playerPanel = null;
        playerPanelAnchor = null;
        playerPanelBody = null;
        playerPanelContent = null;
        if (FloatingControls && OverlaysOpen) { controlsIdle.Stop(); controlsIdle.Start(); }
    }

    private TextBlock PanelSection(string title, double top = 16)
    {
        var label = Text(title, 11, true, "Muted");
        label.Margin = new Thickness(2, top, 0, 8);
        return label;
    }

    private Button PanelRow(string label, bool selected, Action click, string? detail = null, string? automationId = null)
    {
        var check = new TextBlock { Text = selected ? "" : "", FontFamily = (FontFamily)Resources["IconFont"], FontSize = 13,
            Foreground = BrushFor("Accent"), Width = 26, VerticalAlignment = VerticalAlignment.Center };
        DockPanel.SetDock(check, Dock.Left);
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        var name = Text(label, 13.5, selected);
        name.TextTrimming = TextTrimming.CharacterEllipsis;
        copy.Children.Add(name);
        if (!string.IsNullOrWhiteSpace(detail))
        {
            var more = Text(detail, 11.5, color: "Muted");
            more.TextTrimming = TextTrimming.CharacterEllipsis;
            more.Margin = new Thickness(0, 2, 0, 0);
            copy.Children.Add(more);
        }
        var row = new DockPanel();
        row.Children.Add(check);
        row.Children.Add(copy);
        var button = new Button { Style = (Style)Resources["PanelRow"], Content = row, Background = selected ? ColorOf("#14FFFFFF") : Brushes.Transparent };
        AutomationProperties.SetName(button, label);
        if (automationId != null) AutomationProperties.SetAutomationId(button, automationId);
        button.Click += (_, _) => click();
        return button;
    }

    private Button PanelChip(string label, bool selected, Action click, string? automationId = null, string? name = null)
    {
        var chip = new Button { Style = (Style)Resources[selected ? "Primary" : "Action"], Content = label, MinHeight = 34,
            Padding = new Thickness(14, 4, 14, 4), Margin = new Thickness(0, 0, 6, 6), FontSize = 12.5 };
        AutomationProperties.SetName(chip, name ?? label);
        if (automationId != null) AutomationProperties.SetAutomationId(chip, automationId);
        chip.Click += (_, _) => click();
        return chip;
    }

    // ---------- Pistes ----------

    private sealed record PlayerTrack(int Id, string Type, string Label, string? Detail, bool Selected);

    private static readonly Dictionary<string, string> LanguageNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fre"] = "Français", ["fra"] = "Français", ["fr"] = "Français", ["eng"] = "Anglais", ["en"] = "Anglais",
        ["spa"] = "Espagnol", ["es"] = "Espagnol", ["ger"] = "Allemand", ["deu"] = "Allemand", ["de"] = "Allemand",
        ["ita"] = "Italien", ["it"] = "Italien", ["por"] = "Portugais", ["pt"] = "Portugais", ["jpn"] = "Japonais", ["ja"] = "Japonais",
        ["kor"] = "Coréen", ["ko"] = "Coréen", ["chi"] = "Chinois", ["zho"] = "Chinois", ["ara"] = "Arabe", ["rus"] = "Russe",
        ["dut"] = "Néerlandais", ["nld"] = "Néerlandais", ["tur"] = "Turc", ["pol"] = "Polonais", ["hin"] = "Hindi"
    };

    private static List<PlayerTrack> Tracks(Mpv engine, string type)
    {
        var result = new List<PlayerTrack>();
        var count = (int)Math.Clamp(engine.Seconds("track-list/count") ?? 0, 0, 100);
        for (var index = 0; index < count; index++)
        {
            var prefix = "track-list/" + index.ToString(CultureInfo.InvariantCulture) + "/";
            if (engine.Text(prefix + "type") != type) continue;
            var id = (int)(engine.Seconds(prefix + "id") ?? 0);
            var title = engine.Text(prefix + "title");
            var lang = engine.Text(prefix + "lang");
            var language = lang != null && LanguageNames.TryGetValue(lang, out var named) ? named : lang?.ToUpperInvariant();
            var label = string.IsNullOrWhiteSpace(title) ? language ?? $"Piste {id}" :
                language != null && !title.Contains(language, StringComparison.OrdinalIgnoreCase) ? title + " · " + language : title;
            var channels = engine.Seconds(prefix + "demux-channel-count") is > 0 and var number
                ? number switch { 1 => "mono", 2 => "stéréo", 6 => "5.1", 8 => "7.1", _ => number.ToString("0", CultureInfo.InvariantCulture) + " canaux" } : null;
            var detail = string.Join(" · ", new[] { engine.Text(prefix + "codec")?.ToUpperInvariant(), channels,
                engine.Flag(prefix + "external") ? "externe" : null, engine.Flag(prefix + "forced") ? "forcés" : null,
                engine.Flag(prefix + "default") ? "par défaut" : null }.Where(part => !string.IsNullOrWhiteSpace(part)));
            result.Add(new PlayerTrack(id, type, label, detail, engine.Flag(prefix + "selected")));
        }
        return result;
    }

    private void SelectTrack(PlayerTrack? track, string type)
    {
        Command("set", type == "audio" ? "aid" : "sid", track?.Id.ToString(CultureInfo.InvariantCulture) ?? "no");
        Osd((type == "audio" ? "Audio · " : "Sous-titres · ") + (track?.Label ?? "désactivés"));
    }

    // Touches C (sous-titres) et A (audio) : piste suivante, sous-titres désactivés compris.
    private void CycleTrack(string type)
    {
        if (CurrentEngine is not { } engine) return;
        var tracks = Tracks(engine, type);
        if (tracks.Count == 0) { Osd(type == "audio" ? "Une seule piste audio" : "Aucun sous-titre"); return; }
        var current = tracks.FindIndex(track => track.Selected);
        var next = current + 1;
        if (type == "sub" && next >= tracks.Count) SelectTrack(null, type);
        else SelectTrack(tracks[next % tracks.Count], type);
        if (playerPanel?.IsOpen == true) Dispatcher.BeginInvoke(RebuildPlayerPanel, System.Windows.Threading.DispatcherPriority.Background);
    }

    private void SubtitleTrack(object sender, RoutedEventArgs args)
    {
        if (CurrentEngine == null) return;
        var onlineResults = new StackPanel();
        string? searchedLanguage = null;
        ShowPlayerPanel((Button)sender, "Audio et sous-titres", () =>
        {
            var engine = CurrentEngine;
            var columns = new Grid();
            columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star), MinWidth = 220 });
            columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star), MinWidth = 240 });
            var audio = new StackPanel { MaxWidth = 340 };
            var subtitles = new StackPanel { MaxWidth = 360 };
            Grid.SetColumn(subtitles, 2);
            columns.Children.Add(audio);
            columns.Children.Add(subtitles);
            audio.Children.Add(PanelSection("AUDIO", 0));
            var audioTracks = engine == null ? [] : Tracks(engine, "audio");
            foreach (var track in audioTracks)
                audio.Children.Add(PanelRow(track.Label, track.Selected, () => { SelectTrack(track, "audio"); RebuildLater(); }, track.Detail));
            if (audioTracks.Count == 0) audio.Children.Add(Text("Aucune piste audio", 13, color: "Muted"));
            subtitles.Children.Add(PanelSection("SOUS-TITRES", 0));
            var subtitleTracks = engine == null ? [] : Tracks(engine, "sub");
            subtitles.Children.Add(PanelRow("Désactivés", !subtitleTracks.Any(track => track.Selected), () => { SelectTrack(null, "sub"); RebuildLater(); },
                automationId: "SubtitleOff"));
            foreach (var track in subtitleTracks)
                subtitles.Children.Add(PanelRow(track.Label, track.Selected, () => { SelectTrack(track, "sub"); RebuildLater(); }, track.Detail));
            if (active is { Started: true, Session.Local: false, Session.Audio: false } current && client is { } account)
            {
                subtitles.Children.Add(PanelSection("RECHERCHER EN LIGNE"));
                var languages = new WrapPanel();
                foreach (var (code, language) in new[] { ("fre", "Français"), ("eng", "Anglais"), ("spa", "Espagnol"), ("ger", "Allemand"), ("ita", "Italien"), ("por", "Portugais") })
                    languages.Children.Add(PanelChip(language, searchedLanguage == code, () =>
                    {
                        searchedLanguage = code;
                        RebuildLater();
                        _ = SearchSubtitles(account, current, code, onlineResults);
                    }, "SubtitleSearch-" + code, "Rechercher des sous-titres · " + language));
                subtitles.Children.Add(languages);
                if (onlineResults.Parent is Panel previous) previous.Children.Remove(onlineResults);
                subtitles.Children.Add(onlineResults);
            }
            return columns;
        }, "TracksPanel");
    }

    private void RebuildLater() => Dispatcher.BeginInvoke(RebuildPlayerPanel, System.Windows.Threading.DispatcherPriority.Background);

    private async Task SearchSubtitles(Jellyfin account, ActivePlayback state, string language, StackPanel output)
    {
        output.Children.Clear();
        output.Children.Add(Text("Recherche en cours…", 12.5, color: "Muted"));
        JsonElement[] results;
        try { results = (await account.RemoteSubtitles(state.Session.ItemId, language, lifetime.Token)).List(); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            output.Children.Clear();
            var failed = Text("Recherche indisponible : le serveur n’a pas d’extension de sous-titres en ligne configurée.", 12.5, color: "Muted");
            failed.TextWrapping = TextWrapping.Wrap;
            output.Children.Add(failed);
            return;
        }
        if (active != state) return;
        output.Children.Clear();
        if (results.Length == 0) output.Children.Add(Text("Aucun sous-titre trouvé dans cette langue.", 12.5, color: "Muted"));
        foreach (var result in results.Take(18))
        {
            var id = result.Str("Id");
            if (id.Length is 0 or > 400) continue;
            var downloads = result.Num("DownloadCount");
            var detail = string.Join(" · ", new[] { result.Str("ProviderName"), result.Str("Format").ToUpperInvariant(),
                downloads > 0 ? downloads.ToString("N0", CultureInfo.CurrentCulture) + " téléchargements" : "" }.Where(part => part.Length > 0));
            var name = result.Str("Name");
            output.Children.Add(PanelRow(name.Length > 0 ? name : "Sous-titre", false, () => _ = DownloadSubtitle(account, state, id), detail));
        }
    }

    // ---------- Réglages ----------

    private void PlayerSettings(object sender, RoutedEventArgs args)
    {
        if (CurrentEngine == null) return;
        ShowPlayerPanel((Button)sender, "Réglages de lecture", () =>
        {
            var engine = CurrentEngine;
            var panel = new StackPanel { Width = 430 };
            var live = pendingLive != null;
            panel.Children.Add(PanelSection(SyncControls ? "VITESSE · RÉGLÉE PAR LE GROUPE" : "VITESSE", 0));
            var speeds = new WrapPanel();
            var speed = engine?.Seconds("speed") ?? 1;
            foreach (var value in new[] { .5, .75, 1, 1.25, 1.5, 2 })
            {
                var label = value == 1 ? "Normale" : "×" + value.ToString("0.##", CultureInfo.GetCultureInfo("fr-FR"));
                var chip = PanelChip(label, Math.Abs(speed - value) < .01, () => { SetSpeed(value); Osd("Vitesse · " + label); RebuildLater(); });
                chip.IsEnabled = !live && !SyncControls;
                speeds.Children.Add(chip);
            }
            panel.Children.Add(speeds);
            if (active?.Session.Audio != true)
            {
                panel.Children.Add(PanelSection("FORMAT DE L’IMAGE"));
                var formats = new WrapPanel();
                var choices = new[] { ("Automatique", "-1", "0"), ("Remplir l’écran", "-1", "1"), ("16:9", "16:9", "0"), ("4:3", "4:3", "0"), ("2.39:1", "2.39", "0") };
                for (var index = 0; index < choices.Length; index++)
                {
                    var (label, ratio, panscan) = choices[index];
                    var choice = index;
                    formats.Children.Add(PanelChip(label, aspectChoice == choice, () =>
                    {
                        aspectChoice = choice;
                        Command("set", "video-aspect-override", ratio);
                        Command("set", "panscan", panscan);
                        Osd("Image · " + label);
                        RebuildLater();
                    }));
                }
                panel.Children.Add(formats);
                panel.Children.Add(DelayRow(engine, "DÉCALAGE DES SOUS-TITRES", "sub-delay", "Sous-titres"));
            }
            panel.Children.Add(DelayRow(engine, "DÉCALAGE AUDIO", "audio-delay", "Audio"));
            if (active is { Chapters.Length: > 1 } state && !live)
            {
                panel.Children.Add(PanelSection("CHAPITRES"));
                var list = new StackPanel();
                var currentIndex = Array.FindLastIndex(state.Chapters, chapter => chapter.StartPositionTicks / (double)TimeSpan.TicksPerSecond <= state.Position + .5);
                for (var index = 0; index < Math.Min(state.Chapters.Length, 80); index++)
                {
                    var chapter = state.Chapters[index];
                    var seconds = chapter.StartPositionTicks / (double)TimeSpan.TicksPerSecond;
                    list.Children.Add(PanelRow(string.IsNullOrWhiteSpace(chapter.Name) ? "Chapitre " + (index + 1) : chapter.Name, index == currentIndex,
                        () => { UserSeek(seconds); RebuildLater(); }, FormatTime(seconds)));
                }
                panel.Children.Add(new ScrollViewer { Content = list, MaxHeight = 220, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Focusable = false });
            }
            panel.Children.Add(PanelSection("OUTILS"));
            var tools = new WrapPanel();
            tools.Children.Add(PanelChip("Statistiques · I", statsPopup?.IsOpen == true, () => { ShowStats(statsPopup?.IsOpen != true); RebuildLater(); },
                "StatsToggle", "Statistiques de lecture"));
            tools.Children.Add(PanelChip(miniPlayer ? "Quitter le mini-lecteur · P" : "Mini-lecteur · P", miniPlayer, () => { ClosePlayerPanel(); SetMiniPlayer(!miniPlayer); },
                "MiniToggle"));
            panel.Children.Add(tools);
            var keys = Text("Raccourcis : Espace pause · ← → 15 s · ↑ ↓ volume · F plein écran · C sous-titres · A audio · M son · 0-9 position", 11.5, color: "Muted");
            keys.TextWrapping = TextWrapping.Wrap;
            keys.Margin = new Thickness(2, 10, 0, 0);
            panel.Children.Add(keys);
            return panel;
        }, "SettingsPanel");
    }

    private FrameworkElement DelayRow(Mpv? engine, string title, string property, string name)
    {
        var block = new StackPanel();
        block.Children.Add(PanelSection(title));
        var value = engine?.Seconds(property) ?? 0;
        var row = new WrapPanel();
        void Shift(double delta)
        {
            Command("add", property, delta.ToString("0.0", CultureInfo.InvariantCulture));
            var now = CurrentEngine?.Seconds(property) ?? 0;
            Osd(name + " · " + now.ToString("+0.0;−0.0;0", CultureInfo.GetCultureInfo("fr-FR")) + " s");
            RebuildLater();
        }
        row.Children.Add(PanelChip("−0,5 s", false, () => Shift(-.5)));
        row.Children.Add(PanelChip("−0,1 s", false, () => Shift(-.1)));
        var readout = Text(value.ToString("+0.0;−0.0;0,0", CultureInfo.GetCultureInfo("fr-FR")) + " s", 14, true);
        readout.MinWidth = 64;
        readout.TextAlignment = TextAlignment.Center;
        readout.VerticalAlignment = VerticalAlignment.Center;
        readout.Margin = new Thickness(4, 0, 10, 6);
        row.Children.Add(readout);
        row.Children.Add(PanelChip("+0,1 s", false, () => Shift(.1)));
        row.Children.Add(PanelChip("+0,5 s", false, () => Shift(.5)));
        if (Math.Abs(value) > .001)
            row.Children.Add(PanelChip("Réinitialiser", false, () => { Command("set", property, "0"); Osd(name + " · sans décalage"); RebuildLater(); }));
        block.Children.Add(row);
        return block;
    }
}
