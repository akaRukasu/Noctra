using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading;
using System.Windows;

namespace Noctra.Windows;

public partial class MainWindow
{
    private const string MpvArchive = "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261104/mpv-dev-x86_64-20261104-git-46787be250.7z";
    private const string MpvArchiveHash = "5AE0AAA85B2E690E9C574A44E10A86F3D5FE4B406EF6DFA684F5AB25E6BF6306";
    private async void InstallPlayer(object sender, RoutedEventArgs args)
    {
        var item = pendingMedia;
        var live = pendingLive;
        if (item == null && live == null || installation != null) return;
        InstallButton.IsEnabled = false;
        PlayerMessage.Text = "Téléchargement et vérification du lecteur mpv…";
        var temp = Path.Combine(dataDirectory, "install-" + Guid.NewGuid().ToString("N"));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        installation = timeout;
        try
        {
            Directory.CreateDirectory(temp);
            var archive = Path.Combine(temp, "mpv.7z");
            using var downloader = new HttpClient();

            using (var response = await downloader.GetAsync(MpvArchive, HttpCompletionOption.ResponseHeadersRead, timeout.Token))
            {
                response.EnsureSuccessStatusCode();
                await using var file = File.Create(archive);
                await response.Content.CopyToAsync(file, timeout.Token);
            }
            await using (var file = File.OpenRead(archive))
            {
                if (Convert.ToHexString(await SHA256.HashDataAsync(file, timeout.Token)) != MpvArchiveHash)
                    throw new InvalidOperationException("L’archive mpv ne correspond pas à la version prévue.");
            }
            var unzip = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "tar.exe")) { CreateNoWindow = true, UseShellExecute = false };
            foreach (var argument in new[] { "-xf", archive, "-C", temp, "libmpv-2.dll" }) unzip.ArgumentList.Add(argument);
            using var process = Process.Start(unzip) ?? throw new InvalidOperationException();
            await process.WaitForExitAsync();
            timeout.Token.ThrowIfCancellationRequested();
            if (process.ExitCode != 0) throw new InvalidOperationException();
            File.Move(Path.Combine(temp, "libmpv-2.dll"), Mpv.LibraryPath, overwrite: true);
            if (item != null && ReferenceEquals(pendingMedia, item)) _ = OpenPlayback(item);
            if (live != null && pendingLive == live) OpenLive(live);
        }
        catch
        {
            if (item != null && ReferenceEquals(pendingMedia, item) || live != null && pendingLive == live)
                Notice("Installation du lecteur impossible. Vérifiez la connexion et réessayez.", install: true);
        }
        finally
        {
            try
            {
                File.Delete(Path.Combine(temp, "mpv.7z"));
                File.Delete(Path.Combine(temp, "libmpv-2.dll"));
                if (Directory.Exists(temp)) Directory.Delete(temp);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
            InstallButton.IsEnabled = true;
            installation = null;
        }
    }

}
