using System;
using System.Threading;
using System.Windows;

namespace Noctra.Windows;

public partial class App : Application
{
    private Mutex? instance;
    internal static int AnimationRate { get; private set; } = 60;

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
        // 0.8 : WPF anime l'interface à 60 images/s par défaut, quelle que soit la fréquence de l'écran.
        // Cadence portée à celle de l'écran le plus rapide (240 Hz, 144 Hz…) pour les fondus, survols et défilements.
        // Rendu logiciel (pas de carte graphique utilisable) : cadence de WPF conservée, pour ne pas charger le processeur.
        var hz = System.Windows.Media.RenderCapability.Tier >> 16 >= 2 ? Math.Clamp(DisplayTiming.FastestRefreshRate() ?? 60, 60, 480) : 60;
        try
        {
            System.Windows.Media.Animation.Timeline.DesiredFrameRateProperty.OverrideMetadata(typeof(System.Windows.Media.Animation.Timeline),
                new FrameworkPropertyMetadata { DefaultValue = (int?)hz });
            AnimationRate = hz;
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException) { } // réglage déjà figé : cadence par défaut de WPF.
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        instance?.Dispose();
        base.OnExit(e);
    }
}
