using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Forms.Integration;
using System.Windows.Media;
using System.Windows.Interop;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace Noctra.Windows;

internal sealed class MultiviewWindow : Window
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    private readonly List<Mpv> engines = [];
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private readonly List<(string Name, LiveStream Stream, Forms.Panel Panel, WindowsFormsHost Host, TextBlock Status)> slots = [];
    private bool stopped;

    internal MultiviewWindow(Window owner, (string Name, LiveStream Stream)[] selected)
    {
        Owner = owner;
        Title = "Noctra · Multivue";
        Width = 1280;
        Height = 800;
        MinWidth = 800;
        MinHeight = 540;
        Background = new SolidColorBrush(Color.FromRgb(7, 12, 24));
        Foreground = Brushes.White;
        FontFamily = owner.FontFamily;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        SourceInitialized += (_, _) =>
        {
            var dark = 1;
            DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 20, ref dark, sizeof(int));
        };
        var root = new DockPanel { Margin = new Thickness(12) };
        var bar = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
        DockPanel.SetDock(bar, Dock.Top);
        var full = new Button { Content = "Plein écran", Style = (Style)owner.Resources["Action"] };
        full.Click += (_, _) =>
        {
            var enabled = WindowStyle != WindowStyle.None;
            WindowStyle = enabled ? WindowStyle.None : WindowStyle.SingleBorderWindow;
            WindowState = enabled ? WindowState.Maximized : WindowState.Normal;
        };
        DockPanel.SetDock(full, Dock.Right);
        bar.Children.Add(full);
        bar.Children.Add(new TextBlock { Text = "MULTIVUE", Foreground = Brushes.White, FontWeight = FontWeights.Bold,
            FontSize = 20, VerticalAlignment = VerticalAlignment.Center });
        root.Children.Add(bar);
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        if (selected.Length > 1) grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.RowDefinitions.Add(new RowDefinition());
        if (selected.Length > 2) grid.RowDefinitions.Add(new RowDefinition());
        for (var index = 0; index < Math.Min(4, selected.Length); index++)
        {
            var (name, stream) = selected[index];
            var slot = index;
            var area = new DockPanel { Margin = new Thickness(5), Background = Brushes.Black };
            Grid.SetColumn(area, index % 2);
            Grid.SetRow(area, index / 2);
            var top = new DockPanel { Margin = new Thickness(10, 5, 10, 7) };
            DockPanel.SetDock(top, Dock.Top);
            var sound = new Button { Content = "Son", Style = (Style)owner.Resources["Action"] };
            DockPanel.SetDock(sound, Dock.Right);
            sound.Click += (_, _) =>
            {
                for (var engine = 0; engine < engines.Count; engine++)
                    try { engines[engine].Command("set", "mute", engine == slot ? "no" : "yes"); } catch (InvalidOperationException) { }
            };
            top.Children.Add(sound);
            top.Children.Add(new TextBlock { Text = name, Foreground = Brushes.White, FontSize = 14, FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis });
            area.Children.Add(top);
            var body = new Grid();
            var status = new TextBlock { Text = "Connexion…", Foreground = Brushes.LightGray, HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(20) };
            body.Children.Add(status);
            var panel = new Forms.Panel { BackColor = System.Drawing.Color.Black };
            var host = new WindowsFormsHost { Child = panel };
            body.Children.Add(host);
            area.Children.Add(body);
            grid.Children.Add(area);
            slots.Add((name, stream, panel, host, status));
        }
        root.Children.Add(grid);
        Content = root;
        Loaded += Open;
        Closing += (_, _) => Stop();
        timer.Tick += (_, _) =>
        {
            for (var index = 0; index < engines.Count; index++)
            {
                foreach (var (kind, _) in engines[index].Poll())
                {
                    if (kind is Mpv.Event.EndFile or Mpv.Event.Shutdown)
                    {
                        slots[index].Host.Visibility = Visibility.Collapsed;
                        slots[index].Status.Text = "Ce direct a été interrompu. Fermez puis relancez la multivue pour réessayer.";
                    }
                }
            }
        };
    }

    private void Open(object sender, RoutedEventArgs args)
    {
        foreach (var slot in slots)
        {
            if (stopped) return;
            try
            {
                slot.Host.UpdateLayout();
                var engine = new Mpv(slot.Panel.Handle, null, 0, slot.Stream.NoctraToken);
                engine.Command("set", "mute", engines.Count == 0 ? "no" : "yes");
                engine.Load(slot.Stream.Url);
                engines.Add(engine);
            }
            catch (Exception error) when (error is InvalidOperationException or DllNotFoundException or BadImageFormatException)
            {
                slot.Host.Visibility = Visibility.Collapsed;
                slot.Status.Text = "Ce flux n’a pas pu être ouvert.";
                Stop();
                return;
            }
        }
        timer.Start();
    }

    private void Stop()
    {
        if (stopped) return;
        stopped = true;
        timer.Stop();
        foreach (var engine in engines) engine.Dispose();
        engines.Clear();
    }
}

public partial class MainWindow
{
    private readonly List<(string Name, LiveStream Stream)> multiviewSelection = [];
    private MultiviewWindow? multiview;

    private void SelectMultiview(string name, LiveStream stream)
    {
        if (multiviewSelection.Any(item => item.Stream.Url == stream.Url)) return;
        if (multiviewSelection.Count >= 4)
        {
            ShowStatus("La multivue contient déjà quatre chaînes.");
            return;
        }
        multiviewSelection.Add((name, stream));
        _ = Navigate(MultiviewPage);
    }

    private Page MultiviewPage => new("Multivue", ButtonTab.Tv, (account, cancellation) =>
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(Heading("Multivue", "Choisissez jusqu’à quatre directs. Le son suit la chaîne sélectionnée."));
        foreach (var item in multiviewSelection.ToArray())
            PageContent.Children.Add(Row(item.Name, "Flux sélectionné", Action("Retirer", () =>
            {
                multiviewSelection.Remove(item);
                _ = Navigate(MultiviewPage, back: true);
            })));
        var buttons = new WrapPanel();
        var add = Action("Ajouter une chaîne", () => _ = Navigate(TvPage()));
        buttons.Children.Add(add);
        var play = Action("Lancer la multivue", () =>
        {
            multiview?.Close();
            multiview = new MultiviewWindow(this, multiviewSelection.ToArray());
            multiview.Show();
        }, "Primary");
        play.IsEnabled = multiviewSelection.Count > 0;
        play.Margin = new Thickness(8, 0, 0, 0);
        buttons.Children.Add(play);
        PageContent.Children.Add(buttons);
        return System.Threading.Tasks.Task.CompletedTask;
    });
}
