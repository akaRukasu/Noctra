using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

internal sealed record PlaybackPreferences(double Volume = 85, double SubtitleScale = 1.1, string AudioLanguage = "fra,fre,fr",
    string SubtitleLanguage = "fra,fre,fr", bool HardwareDecoding = true, string[]? TvFavorites = null,
    string SubtitleColor = "white", string SubtitleBackground = "shadow", double SubtitlePosition = 100, string? SubtitleMode = "smart");

public partial class MainWindow
{
    private PlaybackPreferences preferences = new();
    private async Task LoadPreferences(Jellyfin account)
    {
        preferences = new PlaybackPreferences();
        var path = Path.Combine(dataDirectory, "preferences-" + account.User.Id + ".json");
        try
        {
            if (File.Exists(path))
            {
                var saved = JsonSerializer.Deserialize<PlaybackPreferences>(await File.ReadAllTextAsync(path, lifetime.Token));
                if (client == account && saved != null) preferences = saved with
                {
                    Volume = Math.Clamp(saved.Volume, 0, 100), SubtitleScale = Math.Clamp(saved.SubtitleScale, .5, 2.5)
                };
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or OperationCanceledException) { }
        if (client == account) VolumeControl.Value = preferences.Volume;
    }

    // 0.6 : chaînes favorites (clé de nom de chaîne), propres au profil sur ce PC.
    private bool IsTvFavorite(string name) => preferences.TvFavorites?.Contains(ChannelKey(name)) == true;
    private async Task ToggleTvFavorite(Jellyfin account, string name)
    {
        var key = ChannelKey(name);
        var current = preferences.TvFavorites ?? [];
        preferences = preferences with { TvFavorites = current.Contains(key) ? current.Where(item => item != key).ToArray() : current.Append(key).ToArray() };
        await SavePreferences(account);
    }

    private async Task SavePreferences(Jellyfin account)
    {
        var path = Path.Combine(dataDirectory, "preferences-" + account.User.Id + ".json");
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(preferences), lifetime.Token);
            File.Move(temporary, path, true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or OperationCanceledException)
        {
            if (!closing) ShowStatus("Les préférences n’ont pas pu être enregistrées sur ce PC.");
        }
        finally
        {
            try { File.Delete(temporary); } catch (IOException) { }
        }
    }

    // Sous-titres au lancement, comme le mode « intelligent » de Jellyfin : rien quand l'audio est déjà dans une langue
    // préférée (seulement les passages forcés), sous-titres de la langue préférée quand l'audio est étranger.
    // Auparavant mpv recevait seulement la langue préférée (français) et activait une piste française même en VF.
    private static readonly (string Value, string Label)[] SubtitleModes =
    [
        ("smart", "Seulement si l'audio est dans une autre langue"), ("forced", "Seulement les passages forcés"),
        ("always", "Toujours, dans la langue préférée"), ("off", "Jamais (activables dans le lecteur)")
    ];

    private void ApplyPlayerPreferences(Mpv engine, bool loading = false)
    {
        engine.Command("set", "volume", preferences.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture));
        engine.Command("set", "sub-scale", preferences.SubtitleScale.ToString(System.Globalization.CultureInfo.InvariantCulture));
        engine.Command("set", "alang", preferences.AudioLanguage);
        void Optional(string name, params string[] values)
        {
            // Première valeur acceptée par ce moteur (les anciennes versions de mpv ignorent certaines valeurs).
            foreach (var value in values)
                try { engine.Command("set", name, value); return; } catch (InvalidOperationException) { }
        }
        var mode = SubtitleModes.Any(option => option.Value == preferences.SubtitleMode) ? preferences.SubtitleMode : "smart";
        engine.Command("set", "slang", mode is "forced" or "off" ? "" : preferences.SubtitleLanguage);
        Optional("subs-with-matching-audio", mode == "always" ? "yes" : "forced", "no");
        Optional("subs-fallback", mode == "always" ? "default" : "no");
        Optional("subs-fallback-forced", mode == "off" ? "no" : "yes");
        if (loading && mode == "off") Optional("sid", "no");
        // 0.7 : apparence des sous-titres texte (couleur, contour ou bandeau, hauteur).
        Optional("sub-color", preferences.SubtitleColor == "yellow" ? "#FFF1C40F" : "#FFFFFFFF");
        Optional("sub-border-color", "#FF000000");
        Optional("sub-border-size", preferences.SubtitleBackground == "none" ? "1.5" : "3");
        Optional("sub-shadow-offset", preferences.SubtitleBackground == "shadow" ? "1.5" : "0");
        Optional("sub-back-color", preferences.SubtitleBackground == "box" ? "#B0000000" : "#00000000");
        Optional("sub-border-style", preferences.SubtitleBackground == "box" ? "background-box" : "outline-and-shadow");
        Optional("sub-pos", Math.Clamp(preferences.SubtitlePosition, 70, 100).ToString("0", System.Globalization.CultureInfo.InvariantCulture));
    }

    private FrameworkElement PlaybackSettings(Jellyfin account)
    {
        var form = new StackPanel { Margin = new Thickness(0, 28, 0, 0) };
        form.Children.Add(Text("Préférences de lecture", 23, true));
        form.Children.Add(Text("Réglages propres à ce profil sur ce PC.", 13, color: "Muted"));
        var language = Input(form, "Langues audio préférées", preferences.AudioLanguage);
        var subtitles = Input(form, "Langues de sous-titres préférées", preferences.SubtitleLanguage);
        var label = Text("Taille des sous-titres", 13, true, "Muted");
        label.Margin = new Thickness(0, 15, 0, 5);
        form.Children.Add(label);
        var scale = new Slider { Minimum = .5, Maximum = 2.5, Value = preferences.SubtitleScale, Width = 250, HorizontalAlignment = HorizontalAlignment.Left };
        form.Children.Add(scale);
        ComboBox Choice(string label, (string Value, string Label)[] options, string current)
        {
            var caption = Text(label, 13, true, "Muted");
            caption.Margin = new Thickness(0, 15, 0, 5);
            form.Children.Add(caption);
            var combo = new ComboBox { ItemsSource = options.Select(option => option.Label).ToArray(), Width = 250, MinHeight = 36, HorizontalAlignment = HorizontalAlignment.Left,
                SelectedIndex = Math.Max(0, Array.FindIndex(options, option => option.Value == current)) };
            System.Windows.Automation.AutomationProperties.SetName(combo, label);
            form.Children.Add(combo);
            return combo;
        }
        (string, string)[] colors = [("white", "Blanc"), ("yellow", "Jaune")];
        (string, string)[] backgrounds = [("shadow", "Contour et ombre"), ("none", "Contour fin"), ("box", "Bandeau sombre")];
        (string, string)[] positions = [("100", "En bas"), ("92", "Un peu plus haut"), ("84", "Au-dessus des bandeaux")];
        var subtitleMode = Choice("Sous-titres au lancement", SubtitleModes, preferences.SubtitleMode ?? "smart");
        var color = Choice("Couleur des sous-titres", colors, preferences.SubtitleColor);
        var background = Choice("Style des sous-titres", backgrounds, preferences.SubtitleBackground);
        var position = Choice("Position des sous-titres", positions, preferences.SubtitlePosition.ToString("0", System.Globalization.CultureInfo.InvariantCulture));
        var hardware = new CheckBox { Content = "Utiliser le décodage matériel", IsChecked = preferences.HardwareDecoding,
            Foreground = BrushFor("Ink"), Margin = new Thickness(0, 15, 0, 15) };
        form.Children.Add(hardware);
        var save = Action("Enregistrer les préférences", async () =>
        {
            preferences = preferences with
            {
                AudioLanguage = language.Text.Trim(), SubtitleLanguage = subtitles.Text.Trim(),
                SubtitleScale = scale.Value, Volume = VolumeControl.Value, HardwareDecoding = hardware.IsChecked == true,
                SubtitleMode = SubtitleModes[Math.Max(0, subtitleMode.SelectedIndex)].Value,
                SubtitleColor = colors[Math.Max(0, color.SelectedIndex)].Item1, SubtitleBackground = backgrounds[Math.Max(0, background.SelectedIndex)].Item1,
                SubtitlePosition = double.Parse(positions[Math.Max(0, position.SelectedIndex)].Item1, System.Globalization.CultureInfo.InvariantCulture)
            };
            await SavePreferences(account);
            if (CurrentEngine is { } engine) ApplyPlayerPreferences(engine);
        }, "Primary");
        save.HorizontalAlignment = HorizontalAlignment.Left;
        form.Children.Add(save);
        return form;
    }
}
