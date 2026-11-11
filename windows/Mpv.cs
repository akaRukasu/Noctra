using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;

namespace Noctra.Windows;

internal sealed class Mpv : IDisposable
{
    private const string Library = "noctra-libmpv";
    private IntPtr handle;
    internal static string LibraryPath { get; set; } = "";

    static Mpv() => NativeLibrary.SetDllImportResolver(typeof(Mpv).Assembly, (name, _, _) =>
        name == Library ? NativeLibrary.Load(LibraryPath) : IntPtr.Zero);

    internal string? LastError { get; private set; }
    internal Mpv(IntPtr window, string? authorization, double startSeconds, string? noctraToken = null, bool software = false, bool probe = false, bool live = false,
        bool paused = false, bool audioOnly = false, bool muted = false)
    {
        handle = mpv_create();
        if (handle == IntPtr.Zero) throw new InvalidOperationException("Le moteur mpv ne s’initialise pas.");
        try
        {
            Option("config", "no");
            Option("load-scripts", "no");
            Option("ytdl", "no");
            Option("osc", "no");
            Option("input-default-bindings", "no");
            Option("terminal", "no");
            Option("idle", "yes");
            Option("vo", probe ? "null" : "gpu");
            if (!software && !probe) Option("gpu-api", "d3d11");
            Option("hwdec", software || probe ? "no" : "auto");
            // Live HLS can begin at a non-zero timestamp. An artificial length can end before its first decoded frame.
            // The caller owns the wall-clock timeout and disposes the engine when its probe finishes.
            if (probe) Option("audio", "no");
            if (!software && !probe)
            {
                // 0.8 : image calée sur le son (réglage par défaut de mpv). « display-resample » suivait la fréquence de l'écran :
                // avec une fréquence dynamique (60 / 90 / 120 Hz) ou un PC très chargé, la vidéo pouvait défiler trop vite (× 1,5)
                // et le son être rééchantillonné ou coupé pour suivre.
                Option("video-sync", "audio");
                Option("d3d11-sync-interval", "1");
                Option("d3d11-flip", "yes");
            }
            Option("tls-verify", "yes");
            Option("network-timeout", "8");
            if (live || probe)
            {
                Option("hls-bitrate", "max");
                // Recent mpv versions otherwise hide alternate HLS programs in separate editions.
                // Older engines may not implement this option; they keep their normal track behavior.
                _ = mpv_set_option_string(handle, "flatten-editions", "yes");
            }
            if (!probe) Option("wid", window.ToInt64().ToString(CultureInfo.InvariantCulture));
            if (authorization != null)
                Option("http-header-fields", "Authorization: " + authorization.Replace(",", "\\,"));
            if (noctraToken is { Length: > 0 } && !noctraToken.Contains('\r') && !noctraToken.Contains('\n'))
                Option("http-header-fields", "x-noctra-token: " + noctraToken.Replace(",", "\\,"));
            if (startSeconds > 0) Option("start", startSeconds.ToString("0.000", CultureInfo.InvariantCulture));
            // 0.7 : départ en pause (SyncPlay : le groupe démarre ensemble) ; musique sans image.
            if (paused) Option("pause", "yes");
            if (muted) Option("mute", "yes");
            if (audioOnly) Option("vid", "no");
            // Sans périphérique audio utilisable (casque débranché, pilote absent) : lecture muette plutôt qu'un arrêt.
            _ = mpv_set_option_string(handle, "audio-fallback-to-null", "yes");
            // 0.8 : réserve audio plus large (0,2 s par défaut) : pas de coupure du son quand le PC est très sollicité.
            _ = mpv_set_option_string(handle, "audio-buffer", "0.5");
            // 0.8 : messages sur l'image (volume, piste, serveur…) : sobres, centrés, sur fond sombre.
            foreach (var (key, value) in new[] { ("osd-level", "1"), ("osd-duration", "1300"), ("osd-font", "Segoe UI Variable Display"),
                ("osd-font-size", "38"), ("osd-bold", "yes"), ("osd-color", "#FFF5F4FA"), ("osd-border-size", "3"), ("osd-border-color", "#C80A0B12"), ("osd-shadow-offset", "0"),
                ("osd-border-style", "background-box"), ("osd-back-color", "#C80A0B12"), ("osd-align-x", "center"), ("osd-align-y", "center"),
                ("osd-spacing", "0.4"), ("osd-bar", "no") })
                _ = mpv_set_option_string(handle, key, value);
            Check(mpv_initialize(handle));
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    internal void Load(Uri url) => Command("loadfile", url.AbsoluteUri);

    // 0.8 : moteur déjà fermé (épisode suivant lancé pendant une mise à jour) : plus aucun appel natif.
    // Un appel sur un moteur détruit faisait planter Noctra (violation d'accès).
    internal bool Closed => handle == IntPtr.Zero;

    internal void Command(params string[] values)
    {
        if (Closed) return;
        var pointers = new IntPtr[values.Length + 1];
        try
        {
            for (int i = 0; i < values.Length; i++) pointers[i] = Marshal.StringToCoTaskMemUTF8(values[i]);
            Check(mpv_command(handle, pointers));
        }
        finally
        {
            foreach (IntPtr pointer in pointers) Marshal.FreeCoTaskMem(pointer);
        }
    }

    // Commande exécutée par mpv en arrière-plan (ajout de sous-titres distants sans bloquer l'interface).
    internal void CommandAsync(params string[] values)
    {
        if (Closed) return;
        var pointers = new IntPtr[values.Length + 1];
        try
        {
            for (int i = 0; i < values.Length; i++) pointers[i] = Marshal.StringToCoTaskMemUTF8(values[i]);
            Check(mpv_command_async(handle, 0, pointers));
        }
        finally
        {
            foreach (IntPtr pointer in pointers) Marshal.FreeCoTaskMem(pointer);
        }
    }

    internal double? Seconds(string property) => !Closed && mpv_get_property_double(handle, property, 5, out var value) >= 0 ? value : null;
    internal bool Paused => !Closed && mpv_get_property_flag(handle, "pause", 3, out var value) >= 0 && value != 0;
    internal string? Text(string property)
    {
        if (Closed) return null;
        var pointer = mpv_get_property_string(handle, property);
        if (pointer == IntPtr.Zero) return null;
        try { return Marshal.PtrToStringUTF8(pointer); }
        finally { mpv_free(pointer); }
    }
    internal bool Flag(string property) => !Closed && mpv_get_property_flag(handle, property, 3, out var value) >= 0 && value != 0;

    internal IEnumerable<(Event Kind, bool Eof)> Poll()
    {
        for (int i = 0; i < 48 && !Closed; i++)
        {
            var result = Marshal.PtrToStructure<NativeEvent>(mpv_wait_event(handle, 0));
            if (result.Id == Event.None) yield break;
            if (result.Id == Event.EndFile && result.Data != IntPtr.Zero)
            {
                var error = Marshal.ReadInt32(result.Data, 4);
                if (error < 0) LastError = Marshal.PtrToStringUTF8(mpv_error_string(error));
            }
            yield return (result.Id, result.Id == Event.EndFile && result.Data != IntPtr.Zero && Marshal.ReadInt32(result.Data) == 0);
        }
    }

    public void Dispose()
    {
        if (handle == IntPtr.Zero) return;
        mpv_terminate_destroy(handle);
        handle = IntPtr.Zero;
    }

    private void Option(string key, string value) => Check(mpv_set_option_string(handle, key, value));
    private static void Check(int result)
    {
        if (result < 0) throw new InvalidOperationException("mpv a refusé l’opération (" + result + ").");
    }

    internal enum Event { None = 0, Shutdown = 1, EndFile = 7, PlaybackRestart = 21 }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeEvent
    {
        internal Event Id;
        private int error;
        private ulong reply;
        internal IntPtr Data;
    }

    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr mpv_get_property_string(IntPtr context, [MarshalAs(UnmanagedType.LPUTF8Str)] string name);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr mpv_error_string(int error);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern void mpv_free(IntPtr pointer);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr mpv_create();
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int mpv_initialize(IntPtr context);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern void mpv_terminate_destroy(IntPtr context);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int mpv_set_option_string(IntPtr context, [MarshalAs(UnmanagedType.LPUTF8Str)] string option, [MarshalAs(UnmanagedType.LPUTF8Str)] string value);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int mpv_command(IntPtr context, IntPtr[] args);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int mpv_command_async(IntPtr context, ulong reply, IntPtr[] args);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr mpv_wait_event(IntPtr context, double timeout);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, EntryPoint = "mpv_get_property")] private static extern int mpv_get_property_double(IntPtr context, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, out double value);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, EntryPoint = "mpv_get_property")] private static extern int mpv_get_property_flag(IntPtr context, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, out int value);
}
