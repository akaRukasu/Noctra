using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Noctra.Windows;

public partial class MainWindow
{
    private string displayDevice = "";
    private int? displayHz;
    private bool displayUpdateQueued, displayForce;
    private TextBlock? displayReadout;

    private void AttachDisplayTracking()
    {
        var source = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
        source?.AddHook(DisplayMessage);
        LocationChanged += (_, _) => QueueDisplayUpdate();
        StateChanged += (_, _) => QueueDisplayUpdate();
        Scroller.CadenceChanged += UpdateDisplayReadout;
        QueueDisplayUpdate(true);
    }

    private IntPtr DisplayMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message is 0x007E or 0x02E0) QueueDisplayUpdate(true); // display mode or per-monitor DPI changed
        return IntPtr.Zero;
    }

    private void QueueDisplayUpdate(bool force = false)
    {
        displayForce |= force;
        if (displayUpdateQueued || closing) return;
        displayUpdateQueued = true;
        Dispatcher.BeginInvoke(() =>
        {
            displayUpdateQueued = false;
            if (closing) return;
            SizeHeader();
            var handle = new WindowInteropHelper(this).Handle;
            var device = System.Windows.Forms.Screen.FromHandle(handle).DeviceName;
            if (!displayForce && device == displayDevice) return;
            displayForce = false;
            displayDevice = device;
            displayHz = DisplayTiming.RefreshRate(handle);
            Scroller.ResetCadence();
            UpdateDisplayReadout();
            CorrectVideoDisplay();
        }, DispatcherPriority.Background);
    }

    private void CorrectVideoDisplay()
    {
        // 0.8 : plus de fréquence imposée au lecteur. La valeur annoncée par Windows est fausse avec une fréquence
        // dynamique (60 ↔ 120 Hz) : imposée, elle faisait défiler la vidéo trop vite (× 1,5) et saccader le son.
        // L'image est désormais calée sur le son (Mpv.cs) ; la fréquence reste affichée dans les réglages.
        _ = displayHz;
    }

    private void UpdateDisplayReadout()
    {
        if (displayReadout == null) return;
        displayReadout.Text = "Écran actuel · " + displayDevice.Replace(@"\\.\", "") + " · " +
            (displayHz is { } hz ? hz + " Hz" : "fréquence non disponible") + " · animations " + App.AnimationRate + " images/s" +
            (Scroller.MeasuredFramesPerSecond is { } fps ? $"\nDernier défilement · {fps:0} images/s" : "\nDéfilement synchronisé avec l’affichage Windows");
    }
}
