using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Noctra.Windows;

// 0.7 : Quick Connect. Se connecter avec un code autorisé depuis un appareil déjà connecté,
// et autoriser depuis ce PC le code affiché par un autre appareil.
public partial class MainWindow
{
    private CancellationTokenSource? quickConnect;

    private async void StartQuickConnect(object sender, RoutedEventArgs args)
    {
        if (client != null || closing) return;
        quickConnect?.Cancel();
        var attempt = quickConnect = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var token = attempt.Token;
        QuickConnectButton.IsEnabled = false;
        LoginStatus.Text = "Demande d’un code au serveur…";
        var address = ServerAddress.Text.Trim();
        try
        {
            var (target, noctra) = await Jellyfin.ResolveServer(address, token);
            using (var enabled = await Jellyfin.Http.GetAsync(new Uri(target, "QuickConnect/Enabled"), token))
                if (enabled.IsSuccessStatusCode && (await enabled.Content.ReadAsStringAsync(token)).Trim() == "false")
                    throw new InvalidOperationException("Quick Connect est désactivé sur ce serveur (Tableau de bord Jellyfin › Général).");
            // Jellyfin 10.9+ : POST ; versions antérieures : GET.
            var initiate = await Anonymous(HttpMethod.Post, new Uri(target, "QuickConnect/Initiate"), null, token);
            if (initiate.StatusCode is HttpStatusCode.MethodNotAllowed or HttpStatusCode.NotFound)
            {
                initiate.Dispose();
                initiate = await Anonymous(HttpMethod.Get, new Uri(target, "QuickConnect/Initiate"), null, token);
            }
            using var initiated = initiate;
            if (initiate.StatusCode == HttpStatusCode.Unauthorized) throw new InvalidOperationException("Quick Connect est désactivé sur ce serveur.");
            initiate.EnsureSuccessStatusCode();
            var reply = JsonDocument.Parse(await initiate.Content.ReadAsStringAsync(token)).RootElement;
            var secret = reply.Str("Secret");
            var code = reply.Str("Code");
            if (secret.Length is 0 or > 256 || code.Length is 0 or > 16) throw new InvalidOperationException("Le serveur n’a pas fourni de code.");
            QuickConnectCode.Text = code;
            QuickConnectPanel.Visibility = Visibility.Visible;
            LoginStatus.Text = "En attente de l’autorisation sur l’autre appareil…";
            var deadline = DateTime.UtcNow.AddMinutes(5);
            while (DateTime.UtcNow < deadline)
            {
                await Task.Delay(2500, token);
                using var state = await Anonymous(HttpMethod.Get, new Uri(target, "QuickConnect/Connect?Secret=" + Uri.EscapeDataString(secret)), null, token);
                if (!state.IsSuccessStatusCode) continue;
                if (!JsonDocument.Parse(await state.Content.ReadAsStringAsync(token)).RootElement.Flag("Authenticated")) continue;
                using var login = await Anonymous(HttpMethod.Post, new Uri(target, "Users/AuthenticateWithQuickConnect"), new { Secret = secret }, token);
                login.EnsureSuccessStatusCode();
                var signedIn = Jellyfin.Session(target, noctra, deviceId, await login.Content.ReadAsStringAsync(token));
                if (closing || client != null) return;
                var message = await RememberAccount(address, signedIn);
                QuickConnectPanel.Visibility = Visibility.Collapsed;
                LoginStatus.Text = "";
                Enter(signedIn);
                ShowStatus(message.Length > 0 ? message : "Connecté avec Quick Connect.");
                return;
            }
            LoginStatus.Text = "Le code a expiré. Demandez-en un nouveau.";
            QuickConnectPanel.Visibility = Visibility.Collapsed;
        }
        catch (InvalidOperationException error) { LoginStatus.Text = error.Message; QuickConnectPanel.Visibility = Visibility.Collapsed; }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        {
            if (token.IsCancellationRequested) return;
            LoginStatus.Text = "Quick Connect est indisponible sur ce serveur. Vérifiez son adresse.";
            QuickConnectPanel.Visibility = Visibility.Collapsed;
        }
        finally { if (quickConnect == attempt) QuickConnectButton.IsEnabled = true; }
    }

    private async Task<HttpResponseMessage> Anonymous(HttpMethod method, Uri url, object? body, CancellationToken cancellation)
    {
        using var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("Authorization", Jellyfin.Authorization(deviceId, null));
        if (body != null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        return await Jellyfin.Http.SendAsync(request, cancellation);
    }

    // Profil : autoriser un autre appareil et changer le mot de passe.
    private FrameworkElement AccountTools(Jellyfin account, CancellationToken cancellation)
    {
        var tools = new StackPanel { Margin = new Thickness(0, 30, 0, 10) };
        tools.Children.Add(Text("Quick Connect", 23, true));
        tools.Children.Add(Text("Connectez un téléviseur, un téléphone ou un autre PC sans y saisir votre mot de passe.", 13, color: "Muted"));
        var code = Input(tools, "Code affiché sur l’autre appareil");
        code.MaxLength = 12;
        AutomationProperties.SetAutomationId(code, "QuickConnectInput");
        var authorize = Action("Autoriser cet appareil", async () =>
        {
            var value = code.Text.Trim();
            if (value.Length is 0 or > 12) { ShowStatus("Saisissez le code affiché sur l’autre appareil."); return; }
            try
            {
                await account.Command("QuickConnect/Authorize?code=" + Uri.EscapeDataString(value) + "&userId=" + account.User.Id, null, cancellation);
                code.Clear();
                ShowStatus("Appareil autorisé : il se connecte à votre compte.");
            }
            catch (HttpRequestException error)
            {
                ShowStatus(error.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.BadRequest ? "Code inconnu ou expiré." :
                    error.StatusCode == HttpStatusCode.Unauthorized ? "Quick Connect est désactivé sur ce serveur." : "Le serveur n’a pas accepté ce code.");
            }
            catch (OperationCanceledException) { }
        }, "Primary");
        authorize.HorizontalAlignment = HorizontalAlignment.Left;
        authorize.Margin = new Thickness(0, 12, 0, 0);
        AutomationProperties.SetAutomationId(authorize, "QuickConnectAuthorize");
        tools.Children.Add(authorize);

        var password = new StackPanel { Margin = new Thickness(0, 30, 0, 0) };
        password.Children.Add(Text("Mot de passe", 23, true));
        password.Children.Add(Text("Modifie le mot de passe de votre compte Jellyfin (tous vos appareils).", 13, color: "Muted"));
        PasswordBox Secret(string label)
        {
            var caption = Text(label, 13, true, "Muted");
            caption.Margin = new Thickness(0, 12, 0, 5);
            var box = new PasswordBox { MinWidth = 220, MaxWidth = 420, HorizontalAlignment = HorizontalAlignment.Left, MinHeight = 42 };
            AutomationProperties.SetName(box, label);
            password.Children.Add(caption);
            password.Children.Add(box);
            return box;
        }
        var current = Secret("Mot de passe actuel");
        var next = Secret("Nouveau mot de passe");
        var confirm = Secret("Confirmer le nouveau mot de passe");
        var change = Action("Changer le mot de passe", async () =>
        {
            if (next.Password.Length == 0 || next.Password != confirm.Password) { ShowStatus("Les deux nouveaux mots de passe ne correspondent pas."); return; }
            if (MessageBox.Show(this, "Changer le mot de passe de ce compte Jellyfin ?", "Mot de passe", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            try
            {
                await account.Command("Users/" + account.User.Id + "/Password", new { CurrentPw = current.Password, NewPw = next.Password }, cancellation);
                ShowStatus("Mot de passe modifié.");
            }
            catch (HttpRequestException error)
            {
                ShowStatus(error.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized ? "Mot de passe actuel incorrect." : "Le serveur a refusé la modification.");
            }
            catch (OperationCanceledException) { }
            finally { current.Clear(); next.Clear(); confirm.Clear(); }
        });
        change.HorizontalAlignment = HorizontalAlignment.Left;
        change.Margin = new Thickness(0, 12, 0, 0);
        password.Children.Add(change);
        tools.Children.Add(password);
        return tools;
    }
}
