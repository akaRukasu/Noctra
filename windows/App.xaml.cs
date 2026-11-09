using System;
using System.Threading;
using System.Windows;

namespace Noctra.Windows;

public partial class App : Application
{
    private Mutex? instance;

    protected override void OnStartup(StartupEventArgs e)
    {
        if (Environment.GetEnvironmentVariable("NOCTRA_WINDOWS_DATA") == null)
        {
            instance = new Mutex(true, "Local\\NoctraWindowsDesktop", out var created);
            if (!created)
            {
                MessageBox.Show("Noctra est déjà ouvert sur ce PC.", "Noctra", MessageBoxButton.OK, MessageBoxImage.Information);
                Shutdown();
                return;
            }
        }
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        instance?.Dispose();
        base.OnExit(e);
    }
}
