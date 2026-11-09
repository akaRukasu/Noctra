using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Noctra.Windows;

internal sealed class ExternalPlayerWindow : Window
{
    private readonly WebView2 browser = new() { DefaultBackgroundColor = System.Drawing.Color.FromArgb(5, 6, 10) };
    private readonly TextBlock status = new() { Text = "Ouverture du lecteur…", Foreground = Brushes.LightGray, FontSize = 12, Margin = new Thickness(0, 5, 0, 0) };
    private readonly TextBlock blocked = new() { Foreground = Brushes.LightGray, FontSize = 11, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 12, 0) };
    private readonly TextBlock audioStatus = new() { Text="Son · connexion…",Foreground=Brushes.LightGray,FontSize=11 };
    private readonly ExternalAudio audio = new();
    private readonly MainWindow host;
    private readonly System.Collections.Generic.HashSet<string> audioAcknowledged = new();
    private bool audioIdentityPending;
    private DateTime nextAudioIdentity;
    private readonly Border header;
    private readonly ScreenFullscreen screenMode;
    private bool protection = true, closed, full;
    private double reportedVideoArea;
    private int blocks, redirects;
    private string? protectionScript;
    private readonly string channelName;
    private readonly System.Collections.Generic.HashSet<string> navigationHosts = new(StringComparer.OrdinalIgnoreCase);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    internal ExternalPlayerWindow(MainWindow owner, string name, Uri page, NoctraService service, string directory)
    {
        Owner = owner; Title = "Noctra · Lecteur externe"; Width = 1280; Height = 820; MinWidth = 850; MinHeight = 550;
        host=owner;
        channelName = name;
        screenMode = new ScreenFullscreen(this);
        AutomationProperties.SetAutomationId(browser, "ExternalVideo");
        WindowStartupLocation = WindowStartupLocation.CenterOwner; Background = Brushes.Black; Foreground = Brushes.White; FontFamily = owner.FontFamily;
        AutomationProperties.SetAutomationId(status, "ExternalPlaybackStatus");
        AutomationProperties.SetAutomationId(blocked, "BlockedRequestCount");
        AutomationProperties.SetAutomationId(audioStatus,"ExternalAudioStatus");
        var root = new DockPanel();
        var bar = new DockPanel();
        header = new Border { Child = bar, Background = new SolidColorBrush(Color.FromRgb(7, 8, 13)), Padding = new Thickness(18, 13, 18, 13) };
        DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);
        Button Button(string text, Action action)
        {
            var button = new Button { Content = text, Style = (Style)owner.Resources["Action"], Margin = new Thickness(7, 0, 0, 0) };
            button.Click += (_, _) => action(); return button;
        }
        var buttons = new StackPanel { Orientation = Orientation.Horizontal }; DockPanel.SetDock(buttons, Dock.Right); bar.Children.Add(buttons);
        buttons.Children.Add(blocked);
        var shield = Button("Protection pubs active", () => { });
        shield.Click += async (_, _) =>
        {
            protection = !protection;
            shield.Content = protection ? "Protection pubs active" : "Protection pubs en pause";
            try { await ConfigureProtection(); if (!closed) browser.CoreWebView2?.Reload(); }
            catch (Exception error) when (error is InvalidOperationException or COMException) { }
        };
        buttons.Children.Add(shield);
        buttons.Children.Add(Button("Actualiser", () => browser.CoreWebView2?.Reload()));
        buttons.Children.Add(Button("Plein écran", () => Fullscreen(!full)));
        var close = Button("Fermer", Close); AutomationProperties.SetAutomationId(close, "ExternalClose"); buttons.Children.Add(close);
        var labels = new StackPanel();
        labels.Children.Add(new TextBlock { Text = name, FontSize = 17, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis }); labels.Children.Add(status); labels.Children.Add(audioStatus); bar.Children.Add(labels);
        root.Children.Add(browser); Content = root;
        navigationHosts.Add(page.Host);
        SourceInitialized += (_, _) => { var dark = 1; DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 20, ref dark, sizeof(int)); };
        Loaded += async (_, _) => await Open(page, service, directory);
        Closed += (_, _) => { closed = true; browser.Dispose(); audio.Dispose(); };
        PreviewKeyDown += (_, args) =>
        {
            if (args.Key == Key.F11) { Fullscreen(!full); args.Handled = true; }
            else if (args.Key == Key.Escape && full) { Fullscreen(false); args.Handled = true; }
        };
    }

    private async Task Open(Uri page, NoctraService service, string directory)
    {
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(directory, "external-players"),
                options: new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required") { ExclusiveUserDataFolderAccess=true });
            if (closed) return;
            var options = environment.CreateCoreWebView2ControllerOptions(); options.IsInPrivateModeEnabled = true;
            await browser.EnsureCoreWebView2Async(environment, options);
            if (closed) return;
            var web = browser.CoreWebView2;
            web.Settings.AreHostObjectsAllowed = false; web.Settings.AreDevToolsEnabled = false;
            web.Settings.AreDefaultContextMenusEnabled = false; web.Settings.IsStatusBarEnabled = false;
            web.Settings.IsPasswordAutosaveEnabled = false; web.Settings.IsGeneralAutofillEnabled = false;
            web.Settings.IsSwipeNavigationEnabled = false;
            web.PermissionRequested += (_, request) => request.State = CoreWebView2PermissionState.Deny;
            web.Settings.AreDefaultScriptDialogsEnabled = false;
            web.ScriptDialogOpening += (_, request) => { if (!protection) request.Accept(); else CountBlocked(); };
            web.DownloadStarting += (_, request) => { request.Cancel = true; CountBlocked(); };
            web.NewWindowRequested += (_, request) => { request.Handled = true; CountBlocked(); };
            web.NavigationStarting += (_, request) =>
            {
                audio.Clear(); audioAcknowledged.Clear(); reportedVideoArea = 0;
                if (!Uri.TryCreate(request.Uri, UriKind.Absolute, out var target) || !WebUri(target) || !service.AllowWebRequest(target) || protection && AdProtection.Blocked(target))
                { request.Cancel = true; CountBlocked(); return; }
                if (navigationHosts.Contains(target.Host)) return;
                if (request.IsRedirected && redirects++ < 4) { navigationHosts.Add(target.Host); return; }
                request.Cancel = true; CountBlocked();
            };
            web.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            web.WebResourceRequested += (_, request) =>
            {
                if (!Uri.TryCreate(request.Request.Uri, UriKind.Absolute, out var target)) return;
                if (!WebUri(target) && target.Scheme is not ("data" or "blob") || !service.AllowWebRequest(target) || protection && AdProtection.Blocked(target))
                { request.Response = environment.CreateWebResourceResponse(Stream.Null, 403, "Blocked", "Content-Type: text/plain"); CountBlocked(); return; }
                // Only TV media/proxy endpoints receive the session token. Never expose administration APIs to provider pages.
                if (request.Request.Headers.Contains("x-noctra-token")) request.Request.Headers.RemoveHeader("x-noctra-token");
                if (service.WebToken(target) is { } token) request.Request.Headers.SetHeader("x-noctra-token", token);
            };
            web.NavigationCompleted += (_, result) =>
            {
                if (closed) return;
                if (!result.IsSuccess && result.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled) status.Text = "Le lecteur n’a pas chargé. Actualisez ou choisissez un autre serveur.";
                else if (!status.Text.StartsWith("Image reçue", StringComparison.Ordinal)) status.Text = "Lecteur chargé · lancez la vidéo si nécessaire";
                web.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "noctra-protection", enabled = protection }));
            };
            web.WebMessageReceived += VideoMessage;
            web.FrameCreated += (_, args) => ObserveFrame(args.Frame);
            web.ContainsFullScreenElementChanged += (_, _) => Fullscreen(web.ContainsFullScreenElement);
            web.ProcessFailed += (_, _) => status.Text = "Le lecteur s’est interrompu. Actualisez ou essayez un autre serveur.";
            await ConfigureProtection();
            await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.OhaMediaCompatibility);
            await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.TargetChannel(channelName));
            await web.AddScriptToExecuteOnDocumentCreatedAsync(audio.Script);
            web.Navigate(page.AbsoluteUri);
        }
        catch (WebView2RuntimeNotFoundException)
        { status.Text = "Le composant Microsoft WebView2 est absent. Relancez le setup pour l’installer."; }
        catch (Exception error) when (error is InvalidOperationException or COMException or IOException)
        { if (!closed) status.Text = "Impossible d’ouvrir ce lecteur. Actualisez ou choisissez un autre serveur."; }
    }

    private void ObserveFrame(CoreWebView2Frame frame)
    {
        frame.WebMessageReceived += VideoMessage;
        frame.FrameCreated += (_, args) => ObserveFrame(args.Frame);
    }
    private void VideoMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs message)
    {
        try
        {
            if (closed || message.WebMessageAsJson.Length > 40000) return;
            using var data = JsonDocument.Parse(message.WebMessageAsJson);
            var type=data.RootElement.Str("type");
            if (type.StartsWith("noctra-audio",StringComparison.Ordinal))
            {
                if (data.RootElement.Str("key")!=audio.Nonce)return;
                if(type=="noctra-audio")
                {
                    var id=data.RootElement.Str("id");
                    bool native=true;
                    try
                    {
                        if(audio.Receive(data.RootElement,host.ExternalVolume))
                        {
                            audioStatus.Text="Son · Noctra";
                            AutomationProperties.SetHelpText(audioStatus,audio.HasSignal ? "Signal audio reçu par Noctra" : "Flux audio Noctra silencieux");
                        }
                        native=audio.IsInitialized;
                        if(native&&!audioIdentityPending&&DateTime.UtcNow>=nextAudioIdentity)
                        {
                            audioIdentityPending=true;nextAudioIdentity=DateTime.UtcNow.AddSeconds(3);
                            _=RefreshAudioIdentity();
                        }
                    }
                    catch(Exception error) when(error is InvalidOperationException or NAudio.MmException or System.Runtime.InteropServices.COMException)
                    { native=false;audioStatus.Text="Son du lecteur web · sortie distincte"; }
                    if(audioAcknowledged.Count>128)audioAcknowledged.Clear();
                    if(!native||audioAcknowledged.Add(id))
                    {
                        var acknowledgement=JsonSerializer.Serialize(new {type="noctra-audio-ack",key=audio.Nonce,id,native});
                        if(sender is CoreWebView2Frame frame)frame.PostWebMessageAsJson(acknowledgement);else browser.CoreWebView2?.PostWebMessageAsJson(acknowledgement);
                    }
                }
                else if(type=="noctra-audio-clear")audio.Clear(data.RootElement.Str("id"));
                else if(type=="noctra-audio-unavailable")audioStatus.Text="Son du lecteur web · sortie distincte";
                return;
            }
            if (data.RootElement.Str("type") == "noctra-ad-cleaned" && data.RootElement.Num("count") is > 0 and <= 500 and var count)
            { blocks += (int)count; blocked.Text = $"{blocks} blocages"; return; }
            if (data.RootElement.Str("type") != "noctra-video" || data.RootElement.Num("height") is not (> 0 and < 10000)) return;
            var area = data.RootElement.Num("area");
            if (area < reportedVideoArea * .75) return;
            reportedVideoArea = area;
            status.Text = $"Image reçue · {data.RootElement.Num("height"):0}p";
            status.Foreground = new SolidColorBrush(Color.FromRgb(166, 232, 199));
        }
        catch (Exception error) when (error is JsonException or COMException) { }
    }

    private async Task RefreshAudioIdentity()
    {
        try {await AudioIdentity.Refresh();}
        finally {audioIdentityPending=false;}
    }

    private static bool WebUri(Uri uri) => uri.UserInfo.Length == 0 && (uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback);
    private async Task ConfigureProtection()
    {
        if (closed || browser.CoreWebView2 is not { } web) return;
        if (protectionScript != null) web.RemoveScriptToExecuteOnDocumentCreated(protectionScript);
        protectionScript = await web.AddScriptToExecuteOnDocumentCreatedAsync(AdProtection.ProtectionScript(protection));
    }
    private void CountBlocked() { blocks++; blocked.Text = $"{blocks} blocage{(blocks > 1 ? "s" : "")}"; }
    private void Fullscreen(bool enabled)
    {
        if (closed || enabled == full) return;
        if (enabled) screenMode.Enter(); else screenMode.Exit();
        full = screenMode.Active;
        header.Visibility = full ? Visibility.Collapsed : Visibility.Visible;
    }
}

public partial class MainWindow
{
    internal double ExternalVolume => preferences.Volume / 100;
    private ExternalPlayerWindow? externalPlayer;
    private void OpenExternalPlayer(string name, Uri page, NoctraService service)
    {
        if (closing || client == null) return;
        externalPlayer?.Close();
        externalPlayer = new ExternalPlayerWindow(this, name, page, service, dataDirectory);
        externalPlayer.Show();
    }
}
