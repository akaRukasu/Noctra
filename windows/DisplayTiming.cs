using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace Noctra.Windows;

public sealed class SmoothScrollViewer : ScrollViewer
{
    private double target;
    private long previous;
    private bool animating;
    private bool wheelLayout;
    private TranslateTransform? translation;
    private FrameworkElement? translatedContent;
    private Transform? originalTransform;
    private bool ownsBitmapCache;
    private readonly Queue<double> frameIntervals = new();
    private long lastSample;
    public double? MeasuredFramesPerSecond => frameIntervals.Count >= 8 ? 1 / frameIntervals.Order().ElementAt(frameIntervals.Count / 2) : null;
    public event Action? CadenceChanged;
    internal event EventHandler? AnimatedScrollCompleted;
    public void ResetCadence() => frameIntervals.Clear();

    public SmoothScrollViewer() => Unloaded += (_, _) => Stop();

    protected override void OnPreviewMouseWheel(MouseWheelEventArgs args)
    {
        if (!SystemParameters.ClientAreaAnimation || Keyboard.Modifiers != ModifierKeys.None || ScrollableHeight <= 0)
        {
            base.OnPreviewMouseWheel(args);
            return;
        }
        if (!animating) target = VerticalOffset;
        target = Math.Clamp(target - args.Delta * .78, 0, ScrollableHeight);
        args.Handled = true;
        if (Content is not FrameworkElement element) { ScrollToVerticalOffset(target); return; }
        if (translatedContent != element)
        {
            Stop();
            translatedContent = element;
            originalTransform = element.RenderTransform;
            translation = new TranslateTransform();
            var group = new TransformGroup(); group.Children.Add(originalTransform); group.Children.Add(translation);
            element.RenderTransform = group;
        }
        var visibleOffset = VerticalOffset - (translation?.Y ?? 0);
        if (!animating && element.CacheMode == null && RenderCapability.Tier >> 16 > 0 &&
            element.ActualWidth is > 0 and < 8000 && element.ActualHeight is > 0 and < 8000)
        {
            element.CacheMode = new BitmapCache { EnableClearType = true, SnapsToDevicePixels = true };
            ownsBitmapCache = true;
        }
        // Perform layout once per wheel input; subsequent frames move the visual on the compositor.
        wheelLayout = true;
        try { ScrollToVerticalOffset(target); UpdateLayout(); target = VerticalOffset; }
        finally { wheelLayout = false; }
        // 0.8 : glissement confié au moteur d'animation de WPF (cadence de l'écran, jusqu'à 240 Hz et plus, voir App.xaml.cs),
        // sans code à chaque image : seule l'image déjà calculée se déplace.
        var start = VerticalOffset - visibleOffset;
        var glide = new DoubleAnimation(start, 0, TimeSpan.FromMilliseconds(320)) { EasingFunction = new ExponentialEase { EasingMode = EasingMode.EaseOut, Exponent = 5 } };
        var token = ++glideToken;
        glide.Completed += (_, _) => { if (token == glideToken) Stop(); };
        translation!.BeginAnimation(TranslateTransform.YProperty, glide);
        if (animating) return;
        previous = Stopwatch.GetTimestamp();
        animating = true;
        CompositionTarget.Rendering += Render;
    }
    private int glideToken;

    // Mesure seulement : cadence réelle de l'affichage pendant un défilement (affichée dans les réglages).
    private void Render(object? sender, EventArgs args)
    {
        var now = Stopwatch.GetTimestamp();
        var elapsed = (now - previous) / (double)Stopwatch.Frequency;
        if (elapsed is > .001 and < .2)
        {
            frameIntervals.Enqueue(elapsed);
            if (frameIntervals.Count > 60) frameIntervals.Dequeue();
            if ((now - lastSample) / (double)Stopwatch.Frequency > .3) { lastSample = now; CadenceChanged?.Invoke(); }
        }
        previous = now;
    }

    protected override void OnScrollChanged(ScrollChangedEventArgs args)
    {
        if (!wheelLayout && animating && args.VerticalChange != 0 && Math.Abs(args.VerticalOffset - target) > .5) Stop();
        base.OnScrollChanged(args);
    }

    protected override void OnContentChanged(object oldContent, object newContent)
    {
        Stop();
        if (translatedContent != null && originalTransform != null) translatedContent.RenderTransform = originalTransform;
        translatedContent = null; translation = null; originalTransform = null;
        base.OnContentChanged(oldContent, newContent);
    }

    private void Stop()
    {
        if (!animating) return;
        CompositionTarget.Rendering -= Render;
        animating = false;
        if (translation != null) { translation.BeginAnimation(TranslateTransform.YProperty, null); translation.Y = 0; }
        if (ownsBitmapCache && translatedContent != null) { translatedContent.CacheMode = null; ownsBitmapCache = false; }
        AnimatedScrollCompleted?.Invoke(this, EventArgs.Empty);
    }
}

internal static class DisplayTiming
{
    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode, Size = 220)]
    private struct Mode
    {
        [FieldOffset(68)] internal ushort Size;
        [FieldOffset(184)] internal uint Frequency;
    }

    internal static int? RefreshRate(IntPtr window)
    {
        var screen = System.Windows.Forms.Screen.FromHandle(window);
        var mode = new Mode { Size = 220 };
        return EnumDisplaySettings(screen.DeviceName, -1, ref mode) && mode.Frequency is >= 20 and <= 1000 ? (int)mode.Frequency : null;
    }

    // Fréquence de l'écran le plus rapide (240 Hz, 144 Hz…) : cadence des animations de l'interface.
    internal static int? FastestRefreshRate()
    {
        int? best = null;
        foreach (var screen in System.Windows.Forms.Screen.AllScreens)
        {
            var mode = new Mode { Size = 220 };
            if (EnumDisplaySettings(screen.DeviceName, -1, ref mode) && mode.Frequency is >= 20 and <= 1000 && (best == null || mode.Frequency > best))
                best = (int)mode.Frequency;
        }
        return best;
    }

    [DllImport("user32.dll", EntryPoint = "EnumDisplaySettingsW", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplaySettings(string deviceName, int mode, ref Mode configuration);
}
