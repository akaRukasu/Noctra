using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Interop;

namespace Noctra.Windows;

public partial class MainWindow : Window
{
    private readonly string dataDirectory = Environment.GetEnvironmentVariable("NOCTRA_WINDOWS_DATA") ??
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NoctraDesktop");
    private readonly CancellationTokenSource lifetime = new();
    private CancellationTokenSource? pageRequest;
    private Jellyfin? client;
    private Artwork? artwork;
    private readonly Stack<Page> history = new();
    private Page? page;
    private string deviceId = Guid.NewGuid().ToString("N");
    private bool closing;
    private bool readyToClose;

    public MainWindow()
    {
        InitializeComponent();
        ConfigurePlayer();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        AttachDisplayTracking();
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000) || SystemParameters.HighContrast) return;
        var window = new WindowInteropHelper(this).Handle;
        const int captionColor = 35;
        const int textColor = 36;
        var background = 0x1B1011;
        var foreground = 0xFEF3F6;
        _ = DwmSetWindowAttribute(window, captionColor, ref background, sizeof(int));
        _ = DwmSetWindowAttribute(window, textColor, ref foreground, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    private string AccountPath => Path.Combine(dataDirectory, "account.dat");

    private void MinimizeWindow(object sender, RoutedEventArgs args) => WindowState = WindowState.Minimized;
    private void MaximizeWindow(object sender, RoutedEventArgs args) =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void QuitWindow(object sender, RoutedEventArgs args) => Close();

    private async void Load(object sender, RoutedEventArgs args)
    {
        Loaded -= Load;
        SizeChanged += (_, _) => SizeHeader();
        DpiChanged += (_, args) => Artwork.Scale = args.NewDpi.DpiScaleX;
        TvSidebar.IsVisibleChanged += (_, _) => ApplyContentMargins();
        Scroller.ScrollChanged += (_, _) => UpdateNavigationSurface();
        statusTimer.Tick += (_, _) => { statusTimer.Stop(); FadeStatus(); };
        StateChanged += (_, _) => Dispatcher.BeginInvoke(() => SizeHeader());
        LocationChanged += (_, _) => { if (WindowState == WindowState.Maximized) SizeHeader(); };
        SizeHeader();
        var arguments = Environment.GetCommandLineArgs();
        var server = Array.IndexOf(arguments, "--server");
        var overridden = server >= 0 && server + 1 < arguments.Length;
        ServerAddress.Text = overridden ? arguments[server + 1] : Jellyfin.DefaultAddress;
        SignInButton.IsEnabled = false;
        SavedAccount? saved = null;
        try
        {
            Directory.CreateDirectory(dataDirectory);
            var installedPlayer = Path.Combine(AppContext.BaseDirectory, "player", "20261104", "libmpv-2.dll");
            Mpv.LibraryPath = File.Exists(installedPlayer)
                ? installedPlayer : Path.Combine(dataDirectory, "libmpv-2.dll");
            var devicePath = Path.Combine(dataDirectory, "device.txt");
            if (File.Exists(devicePath) && Guid.TryParse(await File.ReadAllTextAsync(devicePath, lifetime.Token), out var existing))
                deviceId = existing.ToString("N");
            else
                await File.WriteAllTextAsync(devicePath, deviceId, lifetime.Token);
            if (overridden || !File.Exists(AccountPath)) return;

            var encrypted = await File.ReadAllBytesAsync(AccountPath, lifetime.Token);
            saved = JsonSerializer.Deserialize<SavedAccount>(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
            if (saved == null || !Jellyfin.TryAddress(saved.JellyfinUrl, out var root)) return;
            ServerAddress.Text = saved.Address;
            Username.Text = saved.User.Name;
            Remember.IsChecked = true;
            LoginStatus.Text = "Récupération de la session…";
            Jellyfin.TryAddress(saved.NoctraUrl, out var noctra);
            if (noctra == null && Jellyfin.TryAddress(saved.Address, out var oldAddress) &&
                oldAddress!.AbsoluteUri.TrimEnd('/') != root!.AbsoluteUri.TrimEnd('/'))
                noctra = new Uri(oldAddress.AbsoluteUri.TrimEnd('/') + "/");
            var restored = new Jellyfin(root!, deviceId, saved.User, saved.Token, noctra);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            var viewer = await restored.Validate(timeout.Token);
            if (viewer.Id != saved.User.Id) throw new InvalidOperationException();
            if (!closing) Enter(new Jellyfin(root!, deviceId, viewer, saved.Token, noctra));
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            LoginStatus.Text = "Session indisponible. Connectez-vous à nouveau.";
            // Sans réseau : les téléchargements du profil enregistré restent lisibles.
            if (saved?.User is { } viewer && PlayRequest.Identifier(viewer.Id)) OfferOffline(viewer);
        }
        finally
        {
            SignInButton.IsEnabled = true;
            if (client == null && !closing) Username.Focus();
        }
    }

    private async void SignIn(object sender, RoutedEventArgs args)
    {
        if (!SignInButton.IsEnabled || closing || client != null) return;
        var username = Username.Text.Trim();
        var address = ServerAddress.Text.Trim();
        if (username.Length == 0)
        {
            LoginStatus.Text = "Indiquez votre identifiant Jellyfin.";
            Username.Focus();
            return;
        }
        SignInButton.IsEnabled = false;
        LoginStatus.Text = "Connexion en cours…";
        try
        {
            var signedIn = await Jellyfin.SignIn(address, deviceId, username, Password.Password, lifetime.Token);
            if (closing) return;
            var message = await RememberAccount(address, signedIn);
            if (closing) return;
            Enter(signedIn);
            ShowStatus(message);
        }
        catch (InvalidOperationException error) { LoginStatus.Text = error.Message; }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        {
            LoginStatus.Text = "Le serveur n’a pas répondu correctement. Vérifiez son adresse et votre connexion.";
        }
        finally
        {
            Password.Clear();
            SignInButton.IsEnabled = true;
        }
    }

    private async Task<string> RememberAccount(string address, Jellyfin signedIn)
    {
        try
        {
            if (Remember.IsChecked == true)
            {
                var saved = new SavedAccount(address, signedIn.Root.AbsoluteUri, signedIn.User, signedIn.Token, signedIn.NoctraRoot?.AbsoluteUri);
                var encrypted = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(saved), null, DataProtectionScope.CurrentUser);
                await File.WriteAllBytesAsync(AccountPath, encrypted, lifetime.Token);
            }
            else File.Delete(AccountPath);
            return "";
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or CryptographicException)
        {
            return "Impossible de mettre à jour la session enregistrée sur ce PC.";
        }
    }

    private void Enter(Jellyfin signedIn)
    {
        client = signedIn;
        offlineMode = false;
        offlineViewer = signedIn.User;
        OfflineButton.Visibility = Visibility.Collapsed;
        QuickConnectPanel.Visibility = Visibility.Collapsed;
        quickConnect?.Cancel();
        StartRealtime(signedIn);
        _ = SyncOfflinePositions(signedIn);
        savedTvOwner = null;
        savedTvSources = null;
        tvCatalogCache.Clear(); tvCatalogOwner = null;
        tvResolutionCache.Clear(); tvResolutionOwner = null;
        seriesStatuses.Clear();
        serverHealth.Clear();
        _ = LoadPreferences(signedIn);
        Artwork.Scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
        artwork = new Artwork(signedIn, Path.Combine(dataDirectory, "Cache", "Images"));
        history.Clear();
        ProfileName.Text = signedIn.User.Name;
        Initial.Text = signedIn.User.Name.Length > 0 ? signedIn.User.Name[..1].ToUpperInvariant() : "N";
        LoginShell.Visibility = Visibility.Collapsed;
        LibraryShell.Visibility = Visibility.Visible;
        _ = Navigate(HomePage, reset: true);
    }

    private async void SignOut(object sender, RoutedEventArgs args)
    {
        var previous = client;
        SignInButton.IsEnabled = false;
        AmbientArt.Source = null;
        savedTvSources = null;
        savedTvOwner = null;
        externalPlayer?.Close();
        tvCatalogCache.Clear(); tvCatalogOwner = null;
        tvResolutionCache.Clear(); tvResolutionOwner = null;
        externalPlayer = null;
        seriesStatuses.Clear();
        serverHealth.Clear();
        multiview?.Close();
        multiview = null;
        multiviewSelection.Clear();
        _ = EndCast();
        if (syncGroup != null) _ = SyncRequest("Leave");
        StopRealtime();
        foreach (var job in offlineJobs.Values) job.Cancel.Cancel();
        offlineViewer = null;
        pageRequest?.Cancel();
        client = null;
        artwork = null;
        page = null;
        history.Clear();
        PageContent.Children.Clear();
        SearchBox.Clear();
        ProfileName.Text = "";
        LibraryShell.Visibility = Visibility.Collapsed;
        LoginShell.Visibility = Visibility.Visible;
        LoginStatus.Text = "";
        Remember.IsChecked = false;
        try { File.Delete(AccountPath); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            LoginStatus.Text = "Impossible de supprimer la session enregistrée. Fermez puis relancez Noctra pour vérifier.";
        }
        Username.Clear();
        Username.Focus();
        if (previous != null) await RevokeSession(previous);
        if (!closing) SignInButton.IsEnabled = true;
    }

    private async Task RevokeSession(Jellyfin account)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        try { await account.Command("Sessions/Logout", null, timeout.Token); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { }
    }

    private sealed record Page(string Title, ButtonTab Tab, Func<Jellyfin, CancellationToken, Task> Render);
    private enum ButtonTab { Home, Library, Favorites, Discover, Tv, None }
    private Page HomePage => new("Accueil", ButtonTab.Home, RenderHome);

    private async Task Navigate(Page destination, bool reset = false, bool back = false)
    {
        var account = client;
        if (account == null || closing) return;
        if (reset) history.Clear();
        else if (!back && page != null) history.Push(page);
        page = destination;

        CloseHoverPreview();
        pageRequest?.Cancel();
        pageRequest?.Dispose();
        pageRequest = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var cancellation = pageRequest.Token;
        AmbientArt.Source = null;
        PageLabel.Text = destination.Title;
        BackButton.Visibility = history.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        HomeTab.Tag = destination.Tab == ButtonTab.Home ? "active" : null;
        LibraryTab.Tag = destination.Tab == ButtonTab.Library ? "active" : null;
        FavoritesTab.Tag = destination.Tab == ButtonTab.Favorites ? "active" : null;
        DiscoverTab.Tag = destination.Tab == ButtonTab.Discover ? "active" : null;
        SearchPlaceholder.Text = destination.Tab == ButtonTab.Discover ? "Rechercher un titre à ajouter" : "Rechercher un titre";
        TvTab.Tag = destination.Tab == ButtonTab.Tv ? "active" : null;
        ShowStatus("");
        TvSidebar.Visibility = Visibility.Collapsed;
        AlphabetRail.Visibility = Visibility.Collapsed;
        AlphabetRail.Children.Clear();
        TvMenu.Children.Clear();
        TvMenuScroller.ScrollToTop();
        PageContent.Children.Clear();
        Scroller.ScrollToTop();
        PageContent.Children.Add(Message("Chargement…"));
        try
        {
            await destination.Render(account, cancellation);
            // 0.6 : arrivée de la page en fondu (l'accueil anime aussi ses rangées une à une).
            if (!cancellation.IsCancellationRequested && SystemParameters.ClientAreaAnimation)
                PageContent.BeginAnimation(OpacityProperty, new System.Windows.Media.Animation.DoubleAnimation(.0, 1, TimeSpan.FromMilliseconds(240)));
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            if (cancellation.IsCancellationRequested) return;
            PageContent.Children.Clear();
            PageContent.Children.Add(Message(error is NoctraApiException ? error.Message : destination.Tab == ButtonTab.Tv ?
                "Impossible de charger cette section TV. Vérifiez le service Noctra ou réessayez." : "Impossible de charger cette page. Vérifiez la connexion au serveur."));
            var retry = Action("Réessayer", () => _ = Navigate(destination, back: true));
            retry.HorizontalAlignment = HorizontalAlignment.Left;
            PageContent.Children.Add(retry);
        }
    }

    private void OpenHome(object sender, RoutedEventArgs args) => _ = Navigate(HomePage, reset: true);
    private void OpenLibraries(object sender, RoutedEventArgs args) => _ = Navigate(new("Médiathèques", ButtonTab.Library, RenderLibraries), reset: true);
    private void OpenFavorites(object sender, RoutedEventArgs args) => _ = Navigate(BrowsePage("Favoris", ButtonTab.Favorites, favorite: true), reset: true);
    private void OpenProfile(object sender, RoutedEventArgs args) => _ = Navigate(new("Profil", ButtonTab.None, RenderProfile));

    private Task RenderProfile(Jellyfin account, CancellationToken cancellation)
    {
        PageContent.Children.Clear();
        // 0.6 : en-tête de profil (avatar en dégradé, nom, serveur).
        var header = new DockPanel { Margin = new Thickness(0, 8, 0, 26) };
        var avatar = new Border { Width = 76, Height = 76, CornerRadius = new CornerRadius(38), Background = (Brush)Resources["AccentGradient"],
            Margin = new Thickness(0, 0, 22, 0), Child = new TextBlock { Text = account.User.Name.Length > 0 ? account.User.Name[..1].ToUpperInvariant() : "N",
                FontSize = 34, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(10, 10, 18)),
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
        DockPanel.SetDock(avatar, Dock.Left);
        header.Children.Add(avatar);
        var who = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        who.Children.Add(Text(account.User.Name, 34, true));
        var server = Text("Profil Jellyfin · " + account.Root.Host, 15, color: "Muted");
        server.Margin = new Thickness(0, 4, 0, 0);
        who.Children.Add(server);
        header.Children.Add(who);
        PageContent.Children.Add(header);
        displayReadout = Text("", 14, color: "Muted");
        displayReadout.Margin = new Thickness(0, 8, 0, 16);
        System.Windows.Automation.AutomationProperties.SetAutomationId(displayReadout, "DisplayReadout");
        UpdateDisplayReadout();
        PageContent.Children.Add(displayReadout);
        PageContent.Children.Add(PlaybackSettings(account));
        PageContent.Children.Add(AccountTools(account, cancellation));
        var signOut = Action("Se déconnecter", () => SignOut(this, new RoutedEventArgs()));
        signOut.HorizontalAlignment = HorizontalAlignment.Left;
        PageContent.Children.Add(signOut);
        return Task.CompletedTask;
    }
    private void Back(object sender, RoutedEventArgs args) { if (history.TryPop(out var previous)) _ = Navigate(previous, back: true); }
    private void Search(object sender, RoutedEventArgs args)
    {
        var term = SearchBox.Text.Trim();
        // 0.8 : depuis Découverte, la recherche porte sur les titres à ajouter (demandes).
        if (term.Length > 0 && page?.Tab == ButtonTab.Discover && client?.NoctraRoot != null) _ = Navigate(DiscoverySearchPage(term));
        else if (term.Length > 0) _ = Navigate(BrowsePage("Recherche", ButtonTab.None, search: term));
        else SearchBox.Focus();
    }

    private void SearchKey(object sender, KeyEventArgs args)
    {
        if (args.Key != Key.Enter) return;
        args.Handled = true;
        Search(sender, args);
    }

    // 0.6 : notification en pastille, fondu d'entrée, disparition seule après quelques secondes.
    private readonly System.Windows.Threading.DispatcherTimer statusTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private void ShowStatus(string text)
    {
        statusTimer.Stop();
        StatusText.Text = text;
        if (text.Length == 0)
        {
            StatusBar.BeginAnimation(OpacityProperty, null);
            StatusBar.Visibility = Visibility.Collapsed;
            return;
        }
        StatusBar.Visibility = Visibility.Visible;
        StatusBar.BeginAnimation(OpacityProperty, new System.Windows.Media.Animation.DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180)));
        statusTimer.Interval = TimeSpan.FromSeconds(Math.Clamp(text.Length / 14.0, 4, 9));
        statusTimer.Start();
    }

    private void FadeStatus()
    {
        var fade = new System.Windows.Media.Animation.DoubleAnimation(0, TimeSpan.FromMilliseconds(260));
        fade.Completed += (_, _) => { if (!statusTimer.IsEnabled) StatusBar.Visibility = Visibility.Collapsed; };
        StatusBar.BeginAnimation(OpacityProperty, fade);
    }

    private async void CloseWindow(object? sender, CancelEventArgs args)
    {
        if (readyToClose) return;
        args.Cancel = true;
        if (closing) return;
        closing = true;
        multiview?.Close();
        if (syncGroup != null) await Task.WhenAny(SyncRequest("Leave"), Task.Delay(1500));
        StopRealtime();
        foreach (var job in offlineJobs.Values) job.Cancel.Cancel();
        await EndCast();
        lifetime.Cancel();
        FinishPlayback();
        await Task.WhenAny(stopping, Task.Delay(7000));
        readyToClose = true;
        _ = Dispatcher.BeginInvoke(new Action(Close));
    }
}
