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
    string SubtitleLanguage = "fra,fre,fr", bool HardwareDecoding = true, string[]? TvFavorites = null);

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

    private void ApplyPlayerPreferences(Mpv engine)
    {
        engine.Command("set", "volume", preferences.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture));
        engine.Command("set", "sub-scale", preferences.SubtitleScale.ToString(System.Globalization.CultureInfo.InvariantCulture));
        engine.Command("set", "alang", preferences.AudioLanguage);
        engine.Command("set", "slang", preferences.SubtitleLanguage);
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
        var hardware = new CheckBox { Content = "Utiliser le décodage matériel", IsChecked = preferences.HardwareDecoding,
            Foreground = BrushFor("Ink"), Margin = new Thickness(0, 15, 0, 15) };
        form.Children.Add(hardware);
        var save = Action("Enregistrer les préférences", async () =>
        {
            preferences = preferences with
            {
                AudioLanguage = language.Text.Trim(), SubtitleLanguage = subtitles.Text.Trim(),
                SubtitleScale = scale.Value, Volume = VolumeControl.Value, HardwareDecoding = hardware.IsChecked == true
            };
            await SavePreferences(account);
            if (CurrentEngine is { } engine) ApplyPlayerPreferences(engine);
        }, "Primary");
        save.HorizontalAlignment = HorizontalAlignment.Left;
        form.Children.Add(save);
        return form;
    }
}
