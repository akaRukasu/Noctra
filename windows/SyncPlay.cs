using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

namespace Noctra.Windows;

// 0.7 : SyncPlay (regarder ensemble, synchronisé par le serveur Jellyfin) et télécommande
// de ce PC depuis un autre appareil (commandes « Play », « Playstate », « GeneralCommand »).
public partial class MainWindow
{
    private JellyfinSocket? realtime;
    private bool realtimeConnected;
    private TimeSpan serverClockOffset;
    private long syncPing = 120;
    private SyncGroup? syncGroup;
    private readonly System.Windows.Threading.DispatcherTimer syncClock = new() { Interval = TimeSpan.FromSeconds(45) };
    private MediaItem? syncPendingItem;

    private sealed class SyncGroup
    {
        internal string Id = "";
        internal string Name = "";
        internal List<string> Members = [];
        internal string State = "Idle";
        internal string? PlaylistItemId;
        internal string? ItemId;
        internal bool Playing;
        internal string LastCommand = "";
        internal DateTime CommandWhen;
        internal long CommandTicks;
        internal bool AwaitingReady;
        internal bool Buffering;
        internal DateTime NextDrift;
        internal CancellationTokenSource? Scheduled;
        // 0.8 : fermeture automatique (plus de lecture, plus personne d'autre).
        internal bool HadOthers;
        internal DateTime? IdleSince;
    }

    // 0.8 : suppression d'une séance ouverte : Noctra la rejoint sans rien lire puis la quitte ;
    // Jellyfin supprime une séance dès que plus personne n'y est (il n'a pas de commande de suppression).
    private string? closingGroupId;
    private string closingGroupName = "";
    private int closingOthers;
    private string[] closingParticipants = [];

    // Après le départ : la séance a-t-elle vraiment disparu ? Sinon, une autre session y est encore
    // (PWA, téléphone, autre PC, parfois du même compte). Un administrateur peut déconnecter ces
    // appareils (après confirmation) : Jellyfin retire alors leurs sessions et supprime la séance.
    private async Task ConfirmGroupDeleted(Jellyfin account, string groupId, string name, string[] participants)
    {
        JsonElement? still = null;
        try
        {
            await Task.Delay(700, lifetime.Token);
            still = (await account.ReadJson("SyncPlay/List", lifetime.Token)).List().Cast<JsonElement?>().FirstOrDefault(group => group!.Value.Str("GroupId") == groupId);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
        if (client != account) return;
        if (still == null)
        {
            ShowStatus("Séance « " + name + " » supprimée.");
            if (page?.Title == SyncPageTitle) _ = Navigate(SyncPlayPage, back: true);
            return;
        }
        var people = still.Value.List("Participants").Select(member => member.Str()).Where(person => person.Length > 0).Distinct().ToArray();
        if (people.Length == 0) people = participants;
        JsonElement[] sessions = [];
        if (account.User.Policy?.IsAdministrator == true)
        {
            try
            {
                sessions = (await account.ReadJson("Sessions", lifetime.Token)).List()
                    .Where(session => people.Contains(session.Str("UserName")) && session.Str("DeviceId") is { Length: > 0 and < 200 } device && device != account.DeviceId)
                    .ToArray();
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
        }
        if (sessions.Length == 0)
        {
            ShowStatus("« " + name + " » est encore occupée par " + string.Join(", ", people) +
                " sur un autre appareil (PWA, téléphone…). Elle disparaîtra quand cet appareil quittera la séance.");
            if (page?.Title == SyncPageTitle) _ = Navigate(SyncPlayPage, back: true);
            return;
        }
        string Describe(JsonElement session)
        {
            var when = DateTime.TryParse(session.Str("LastActivityDate"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var date)
                ? " · actif le " + date.ToLocalTime().ToString("dd/MM HH:mm", CultureInfo.GetCultureInfo("fr-FR")) : "";
            return "• " + session.Str("DeviceName") + " (" + session.Str("Client") + ", " + session.Str("UserName") + when + ")";
        }
        var list = string.Join("\n", sessions.Take(12).Select(Describe));
        if (MessageBox.Show(this, "Jellyfin garde « " + name + " » tant qu’une de ces sessions y est inscrite :\n\n" + list +
                "\n\nDéconnecter ces appareils de Jellyfin ? La séance sera supprimée ; ils devront se reconnecter.",
                "Supprimer la séance", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            if (page?.Title == SyncPageTitle) _ = Navigate(SyncPlayPage, back: true);
            return;
        }
        foreach (var device in sessions.Select(session => session.Str("DeviceId")).Distinct())
        {
            try { await account.Command("Devices?id=" + Uri.EscapeDataString(device), null, lifetime.Token, HttpMethod.Delete); }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { }
        }
        try
        {
            await Task.Delay(1500, lifetime.Token);
            var gone = !(await account.ReadJson("SyncPlay/List", lifetime.Token)).List().Any(group => group.Str("GroupId") == groupId);
            ShowStatus(gone ? "Séance « " + name + " » supprimée (appareils déconnectés)." : "Appareils déconnectés ; Jellyfin n’a pas encore fermé la séance, réessayez dans un instant.");
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
        if (page?.Title == SyncPageTitle) _ = Navigate(SyncPlayPage, back: true);
    }
    private readonly System.Windows.Threading.DispatcherTimer syncIdle = new() { Interval = TimeSpan.FromSeconds(10) };
    private static readonly double SyncIdleLimit = double.TryParse(Environment.GetEnvironmentVariable("NOCTRA_SYNC_IDLE_SECONDS"),
        System.Globalization.NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && seconds > 0 ? seconds : 0;

    private DateTime ServerNow => DateTime.UtcNow + serverClockOffset;

    // Journal de diagnostic SyncPlay (NOCTRA_TRACE=chemin, utilisé par le test d'interface).
    private static readonly string? TracePath = Environment.GetEnvironmentVariable("NOCTRA_TRACE");
    private static void Trace(string text)
    {
        if (TracePath == null) return;
        try { System.IO.File.AppendAllText(TracePath, DateTime.UtcNow.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture) + " " + text + Environment.NewLine); }
        catch (Exception error) when (error is System.IO.IOException or UnauthorizedAccessException) { }
    }
    private bool InSyncGroup => syncGroup != null;

    private void StartRealtime(Jellyfin account)
    {
        StopRealtime();
        realtime = new JellyfinSocket(account,
            (type, data) => Dispatcher.BeginInvoke(() => { if (client == account && !closing) RealtimeMessage(account, type, data); }),
            connected => Dispatcher.BeginInvoke(() =>
            {
                if (client != account) return;
                realtimeConnected = connected;
                if (connected) _ = AnnounceCapabilities(account);
                // 0.8 : Jellyfin garde ce PC dans une séance si Noctra a été fermé sans la quitter (même
                // identifiant d'appareil au lancement suivant) : la séance restait ouverte avec un participant
                // fantôme. À la connexion, hors séance côté Noctra, on la quitte côté serveur (sans effet sinon).
                if (connected && syncGroup == null && closingGroupId == null) _ = SyncRequest("Leave");
                RefreshSyncIndicators();
            }));
        realtime.Start();
        if (!syncClockConfigured)
        {
            syncClockConfigured = true;
            syncClock.Tick += (_, _) => { if (client is { } current && syncGroup != null) _ = SyncClock(current); };
            syncIdle.Tick += (_, _) => SyncIdleTick();
            if (SyncIdleLimit > 0) syncIdle.Interval = TimeSpan.FromSeconds(Math.Clamp(SyncIdleLimit / 3, 1, 10));
        }
    }
    private bool syncClockConfigured;

    private void StopRealtime()
    {
        realtime?.Close();
        realtime = null;
        realtimeConnected = false;
        syncClock.Stop();
        if (syncGroup != null) syncGroup.Scheduled?.Cancel();
        syncGroup = null;
        RefreshSyncIndicators();
    }

    // Ce PC apparaît dans Jellyfin comme un lecteur pilotable (téléphone, PWA, autre client).
    private async Task AnnounceCapabilities(Jellyfin account)
    {
        for (var attempt = 0; attempt < 4 && client == account; attempt++)
        {
            try
            {
                await account.Command("Sessions/Capabilities/Full", new
                {
                    PlayableMediaTypes = new[] { "Video", "Audio" },
                    SupportedCommands = new[] { "DisplayMessage", "SetVolume", "VolumeUp", "VolumeDown", "ToggleMute", "Mute", "Unmute", "ToggleFullscreen", "PlayState", "PlayMediaSource" },
                    SupportsMediaControl = true,
                    SupportsPersistentIdentifier = true
                }, lifetime.Token);
                Trace("capacités annoncées");
                return;
            }
            catch (HttpRequestException error) when (error.StatusCode == null)
            {
                Trace("capacités : " + error.Message);
                try { await Task.Delay(800 * (attempt + 1), lifetime.Token); } catch (OperationCanceledException) { return; }
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { return; }
        }
    }

    private void RealtimeMessage(Jellyfin account, string type, JsonElement data)
    {
        Trace("ws " + type + " " + data.Str("Type") + data.Str("Command"));
        switch (type)
        {
            case "SyncPlayGroupUpdate": SyncUpdate(account, data); break;
            case "SyncPlayCommand": SyncCommand(data); break;
            case "Playstate": RemotePlaystate(data); break;
            case "Play": _ = RemotePlay(account, data); break;
            case "GeneralCommand": RemoteGeneral(data); break;
        }
    }

    // ---------- Télécommande ----------

    private void RemotePlaystate(JsonElement data)
    {
        var engine = CurrentEngine;
        switch (data.Str("Command"))
        {
            case "Stop": FinishPlayback(); break;
            case "Pause": if (engine != null && !engine.Paused) TogglePause(this, new RoutedEventArgs()); break;
            case "Unpause": if (engine is { Paused: true }) TogglePause(this, new RoutedEventArgs()); break;
            case "PlayPause": TogglePause(this, new RoutedEventArgs()); break;
            case "Seek":
                if (pendingLive == null && data.Num("SeekPositionTicks") is var ticks and >= 0) UserSeek(ticks / TimeSpan.TicksPerSecond);
                break;
            case "Rewind": if (pendingLive == null) BackFifteen(this, new RoutedEventArgs()); break;
            case "FastForward": if (pendingLive == null) ForwardFifteen(this, new RoutedEventArgs()); break;
            case "NextTrack": PlayQueueStep(1); break;
            case "PreviousTrack": PlayQueueStep(-1); break;
        }
    }

    private async Task RemotePlay(Jellyfin account, JsonElement data)
    {
        var ids = data.List("ItemIds").Select(id => id.Str()).Where(PlayRequest.Identifier).ToArray();
        if (ids.Length == 0) return;
        try
        {
            var items = new List<MediaItem>();
            foreach (var id in ids.Take(200)) items.Add(await account.Detail(id, lifetime.Token));
            if (client != account || closing) return;
            var start = (long)Math.Max(0, data.Num("StartPositionTicks"));
            var index = (int)Math.Clamp(data.Num("StartIndex"), 0, items.Count - 1);
            if (pendingMedia != null || pendingLive != null) FinishPlayback();
            ShowStatus("Lecture demandée depuis un autre appareil.");
            PlayQueue(items.ToArray(), index, start);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        { ShowStatus("Le titre demandé à distance est introuvable sur ce compte."); }
    }

    private void RemoteGeneral(JsonElement data)
    {
        var arguments = data.Field("Arguments");
        switch (data.Str("Name"))
        {
            case "DisplayMessage":
                var header = arguments.Str("Header");
                ShowStatus((header.Length > 0 ? header + " · " : "") + arguments.Str("Text"));
                break;
            case "SetVolume":
                if (double.TryParse(arguments.Str("Volume"), NumberStyles.Float, CultureInfo.InvariantCulture, out var volume))
                    VolumeControl.Value = Math.Clamp(volume, 0, 100);
                break;
            case "VolumeUp": VolumeControl.Value = Math.Min(100, VolumeControl.Value + 5); break;
            case "VolumeDown": VolumeControl.Value = Math.Max(0, VolumeControl.Value - 5); break;
            case "ToggleMute": case "Mute": case "Unmute": Command("cycle", "mute"); break;
            case "ToggleFullscreen": SetFullscreen(!fullscreen); break;
        }
    }

    // ---------- SyncPlay : messages du serveur ----------

    private void SyncUpdate(Jellyfin account, JsonElement data)
    {
        var payload = data.Field("Data");
        switch (data.Str("Type"))
        {
            case "GroupJoined":
                if (closingGroupId != null && data.Str("GroupId") == closingGroupId)
                {
                    // Séance rejointe seulement pour la supprimer : aucune lecture, départ immédiat.
                    var people = payload.List("Participants").Select(member => member.Str()).Where(name => name.Length > 0).ToList();
                    closingParticipants = people.Distinct().ToArray();
                    people.Remove(account.User.Name);
                    closingOthers = people.Count;
                    _ = SyncRequest("Leave");
                    return;
                }
                syncGroup?.Scheduled?.Cancel();
                syncGroup = new SyncGroup
                {
                    Id = data.Str("GroupId"), Name = payload.Str("GroupName"), State = payload.Str("State"),
                    Members = payload.List("Participants").Select(member => member.Str()).Where(name => name.Length > 0).ToList()
                };
                syncGroup.HadOthers = syncGroup.Members.Count > 1;
                ShowStatus("Vous regardez ensemble dans « " + syncGroup.Name + " ».");
                _ = SyncClock(account);
                syncClock.Start();
                syncIdle.Start();
                if (syncPendingItem is { } pending)
                {
                    syncPendingItem = null;
                    _ = SyncRequest("SetNewQueue", new { PlayingQueue = new[] { pending.Id }, PlayingItemPosition = 0, StartPositionTicks = pending.Resume });
                }
                else if (syncGroup.State is "Playing" or "Paused" or "Waiting") _ = EnsureGroupPlayback(syncGroup);
                break;
            case "UserJoined":
                if (syncGroup != null && payload.Str() is { Length: > 0 } joined)
                {
                    if (!syncGroup.Members.Contains(joined)) syncGroup.Members.Add(joined);
                    syncGroup.HadOthers = true;
                    ShowStatus(joined + " a rejoint le groupe.");
                }
                break;
            case "UserLeft":
                if (syncGroup != null && payload.Str() is { Length: > 0 } left)
                {
                    syncGroup.Members.Remove(left);
                    ShowStatus(left + " a quitté le groupe.");
                }
                break;
            case "GroupLeft":
                if (closingGroupId != null && syncGroup?.Id != data.Str("GroupId"))
                {
                    var closedId = closingGroupId;
                    closingGroupId = null;
                    _ = ConfirmGroupDeleted(account, closedId, closingGroupName, closingParticipants);
                    return;
                }
                LeaveSyncLocally(syncGroup == null ? "" : "Vous avez quitté le groupe.");
                break;
            case "NotInGroup":
            case "GroupDoesNotExist":
                if (closingGroupId != null && syncGroup == null)
                {
                    closingGroupId = null;
                    ShowStatus("Cette séance n’existe déjà plus.");
                    if (page?.Title == SyncPageTitle) _ = Navigate(SyncPlayPage, back: true);
                    return;
                }
                LeaveSyncLocally(syncGroup == null ? "" : "Ce groupe n’existe plus.");
                break;
            case "StateUpdate":
                if (syncGroup != null) syncGroup.State = payload.Str("State");
                break;
            case "PlayQueue":
                _ = SyncQueue(account, payload);
                break;
            case "LibraryAccessDenied":
                ShowStatus("Un participant n’a pas accès à ce titre dans Jellyfin.");
                break;
            case "CreateGroupDenied":
            case "JoinGroupDenied":
                ShowStatus("Jellyfin n’autorise pas SyncPlay pour ce compte (droit à activer par l’administrateur).");
                break;
        }
        RefreshSyncIndicators();
    }

    // Séance déjà en lecture rejointe : le serveur doit envoyer le titre en cours. Sans lui après quelques secondes,
    // la demande est refaite une fois ; ensuite « Rejoindre la lecture » reste proposé (icône SyncPlay du bandeau).
    private string? rejoinedGroupId;
    private async Task EnsureGroupPlayback(SyncGroup group)
    {
        try { await Task.Delay(6000, lifetime.Token); }
        catch (OperationCanceledException) { return; }
        if (syncGroup != group || group.ItemId != null || group.State == "Idle" || closingGroupId != null) return;
        if (rejoinedGroupId != group.Id)
        {
            rejoinedGroupId = group.Id;
            Trace("lecture du groupe non reçue : nouvelle demande");
            SyncRejoin();
        }
        else ShowStatus("La lecture du groupe n’a pas démarré sur ce PC : « Rejoindre la lecture » dans le menu SyncPlay du bandeau.");
    }

    // Rejoindre la lecture du groupe (arrivée en cours de lecture, lecteur fermé, démarrage manqué) :
    // Jellyfin restaure la place dans la séance et renvoie le titre et la position du groupe.
    private bool CanRejoinGroup => syncGroup is { } group && group.State is "Playing" or "Paused" or "Waiting" &&
        !(active is { Synchronized: true } current && group.ItemId != null && SameId(current.Session.ItemId, group.ItemId));
    private void SyncRejoin()
    {
        if (syncGroup is not { } group) return;
        Trace("rejoindre la lecture " + group.Id);
        ShowStatus("Reprise de la lecture du groupe « " + group.Name + " »…");
        _ = SyncRequest("Join", new { GroupId = group.Id });
    }
    private static bool SameId(string? left, string? right) =>
        left != null && right != null && string.Equals(left.Replace("-", ""), right.Replace("-", ""), StringComparison.OrdinalIgnoreCase);

    private void LeaveSyncLocally(string message)
    {
        rejoinedGroupId = null;
        syncGroup?.Scheduled?.Cancel();
        syncGroup = null;
        syncClock.Stop();
        SetSpeed(1);
        if (message.Length > 0) ShowStatus(message);
        RefreshSyncIndicators();
    }

    private async Task SyncQueue(Jellyfin account, JsonElement queue)
    {
        if (syncGroup is not { } group) return;
        var playlist = queue.List("Playlist");
        var index = (int)queue.Num("PlayingItemIndex");
        group.Playing = queue.Flag("IsPlaying");
        if (index < 0 || index >= playlist.Length) return;
        var itemId = playlist[index].Str("ItemId");
        var playlistItemId = playlist[index].Str("PlaylistItemId");
        if (!PlayRequest.Identifier(itemId)) return;
        var reason = queue.Str("Reason");
        // Simple modification de la file (ajout, ordre) : la lecture en cours continue.
        if (group.PlaylistItemId == playlistItemId && active?.Session.ItemId == itemId && reason is not ("NewPlaylist" or "SetCurrentItem")) return;
        group.PlaylistItemId = playlistItemId;
        group.ItemId = itemId;
        var startTicks = (long)Math.Max(0, queue.Num("StartPositionTicks"));
        // Titre déjà à l'écran sur ce PC (séance créée pendant la lecture, retour dans la séance) : la lecture est gardée,
        // mise en pause à la position du groupe puis signalée prête ; plus de fermeture et réouverture de la vidéo.
        if (active is { Started: true, Engine: not null } current && SameId(current.Session.ItemId, itemId) && pendingLive == null && current.Session.Local == false)
        {
            Trace("queue → lecture en cours conservée " + itemId);
            current.Synchronized = true;
            group.AwaitingReady = true;
            group.LastCommand = "";
            Command("set", "pause", "yes");
            SetSpeed(1);
            SeekTo(startTicks / (double)TimeSpan.TicksPerSecond);
            UpdateEpisodeButtons();
            RefreshSyncIndicators();
            _ = SyncRequest("SetIgnoreWait", new { IgnoreWait = false });
            return;
        }
        MediaItem item;
        try { item = await account.Detail(itemId, lifetime.Token); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        {
            ShowStatus("Le titre choisi par le groupe est introuvable sur ce compte.");
            return;
        }
        if (client != account || syncGroup != group || group.PlaylistItemId != playlistItemId || closing) { Trace("queue ignorée"); return; }
        Trace("queue → lecture " + itemId + " (en cours : " + (pendingMedia?.Id ?? "-") + ")");
        if (pendingMedia != null || pendingLive != null) FinishPlayback(refresh: false);
        group.AwaitingReady = true;
        group.LastCommand = "";
        StartPlayback(item, startTicks, synchronized: true);
        _ = SyncRequest("SetIgnoreWait", new { IgnoreWait = false });
    }

    private void SyncCommand(JsonElement data)
    {
        if (syncGroup is not { } group || data.Str("GroupId") != group.Id) return;
        var item = data.Str("PlaylistItemId");
        if (item.Length > 0 && group.PlaylistItemId != null && item != group.PlaylistItemId) return;
        var when = ParseServerTime(data.Str("When")) ?? ServerNow;
        var ticks = (long)Math.Max(0, data.Num("PositionTicks"));
        group.Scheduled?.Cancel();
        var scheduled = group.Scheduled = new CancellationTokenSource();
        group.LastCommand = data.Str("Command");
        group.CommandWhen = when;
        group.CommandTicks = ticks;
        switch (group.LastCommand)
        {
            case "Unpause":
                group.Playing = true;
                _ = SyncUnpause(group, scheduled.Token);
                break;
            case "Pause":
                group.Playing = false;
                _ = SyncPause(group, scheduled.Token);
                break;
            case "Seek":
                group.Playing = false;
                if (active is { Started: true })
                {
                    Command("set", "pause", "yes");
                    SetSpeed(1);
                    group.AwaitingReady = true;
                    SeekTo(ticks / (double)TimeSpan.TicksPerSecond);
                }
                break;
            case "Stop":
                group.Playing = false;
                if (pendingMedia != null) FinishPlayback();
                break;
        }
        RefreshSyncIndicators();
    }

    private async Task SyncUnpause(SyncGroup group, CancellationToken token)
    {
        if (active is not { Started: true }) return; // appliqué au démarrage de la vidéo
        var wait = group.CommandWhen - ServerNow;
        if (wait > TimeSpan.Zero)
        {
            Command("set", "pause", "yes");
            SeekTo(group.CommandTicks / (double)TimeSpan.TicksPerSecond);
            try { await Task.Delay(wait, token); }
            catch (OperationCanceledException) { return; }
            if (syncGroup != group || token.IsCancellationRequested) return;
            Command("set", "pause", "no");
        }
        else
        {
            SeekTo((group.CommandTicks + (-wait).Ticks) / (double)TimeSpan.TicksPerSecond);
            Command("set", "pause", "no");
        }
        group.NextDrift = DateTime.UtcNow.AddSeconds(2.5);
    }

    private async Task SyncPause(SyncGroup group, CancellationToken token)
    {
        var wait = group.CommandWhen - ServerNow;
        if (wait > TimeSpan.Zero)
        {
            try { await Task.Delay(wait, token); }
            catch (OperationCanceledException) { return; }
        }
        if (syncGroup != group || token.IsCancellationRequested) return;
        Command("set", "pause", "yes");
        SetSpeed(1);
        SeekTo(group.CommandTicks / (double)TimeSpan.TicksPerSecond);
    }

    // Vidéo prête (premier affichage) : le serveur démarre le groupe quand tout le monde l'est.
    private void SyncStarted(ActivePlayback state)
    {
        Trace("vidéo prête, groupe " + (syncGroup?.Id ?? "aucun") + ", position " + state.Position.ToString("0.0", CultureInfo.InvariantCulture));
        if (syncGroup is not { } group)
        {
            Command("set", "pause", "no");
            return;
        }
        group.AwaitingReady = false;
        _ = SyncReady(group, state, false);
        if (group.LastCommand == "Unpause" && group.Playing) _ = SyncUnpause(group, (group.Scheduled ??= new()).Token);
    }

    // Fin d'un déplacement demandé par le groupe.
    private void SyncSeekCompleted(ActivePlayback state)
    {
        if (syncGroup is not { AwaitingReady: true } group) return;
        group.AwaitingReady = false;
        // Position réelle après le déplacement (le minuteur ne l'a pas encore relue).
        state.Position = state.Engine?.Seconds("time-pos") ?? state.Position;
        _ = SyncReady(group, state, false);
    }

    private Task SyncReady(SyncGroup group, ActivePlayback state, bool playing) =>
        SyncRequest("Ready", new
        {
            When = ServerNow.ToString("o", CultureInfo.InvariantCulture),
            PositionTicks = (long)(state.Position * TimeSpan.TicksPerSecond),
            IsPlaying = playing, PlaylistItemId = group.PlaylistItemId ?? ""
        });

    // Écart avec le groupe : léger changement de vitesse, ou saut au-delà de 2,5 s ; mise en
    // mémoire tampon signalée au groupe (qui attend alors ce PC).
    private void SyncTick(ActivePlayback state, Mpv engine)
    {
        if (syncGroup is not { } group) return;
        var waiting = engine.Flag("paused-for-cache");
        if (waiting && group.Playing && !group.Buffering)
        {
            group.Buffering = true;
            _ = SyncRequest("Buffering", new
            {
                When = ServerNow.ToString("o", CultureInfo.InvariantCulture), PositionTicks = (long)(state.Position * TimeSpan.TicksPerSecond),
                IsPlaying = true, PlaylistItemId = group.PlaylistItemId ?? ""
            });
        }
        else if (!waiting && group.Buffering)
        {
            group.Buffering = false;
            _ = SyncReady(group, state, true);
        }
        if (!group.Playing || group.LastCommand != "Unpause" || engine.Paused || waiting || DateTime.UtcNow < group.NextDrift) return;
        group.NextDrift = DateTime.UtcNow.AddSeconds(1);
        var expected = (group.CommandTicks + (ServerNow - group.CommandWhen).Ticks) / (double)TimeSpan.TicksPerSecond;
        var drift = state.Position - expected;
        if (Math.Abs(drift) > 2.5)
        {
            SetSpeed(1);
            SeekTo(expected);
            group.NextDrift = DateTime.UtcNow.AddSeconds(3);
        }
        else if (Math.Abs(drift) > .12) SetSpeed(drift > 0 ? .95 : 1.05);
        else SetSpeed(1);
        SyncDriftReadout = drift;
    }
    private double SyncDriftReadout;

    private void SetSpeed(double speed)
    {
        if (CurrentEngine is not { } engine) return;
        try { engine.Command("set", "speed", speed.ToString("0.00", CultureInfo.InvariantCulture)); }
        catch (InvalidOperationException) { }
    }

    private static DateTime? ParseServerTime(string value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var time) ? time : null;

    // Horloge du serveur (méthode NTP simplifiée, meilleur de trois échanges) et ping du groupe.
    private async Task SyncClock(Jellyfin account)
    {
        var best = (Offset: TimeSpan.Zero, Delay: TimeSpan.MaxValue);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                var sent = DateTime.UtcNow;
                var reply = await account.ReadJson("GetUtcTime", lifetime.Token);
                var back = DateTime.UtcNow;
                if (ParseServerTime(reply.Str("RequestReceptionTime")) is not { } reception ||
                    ParseServerTime(reply.Str("ResponseTransmissionTime")) is not { } transmission) continue;
                var delay = back - sent - (transmission - reception);
                if (delay < best.Delay) best = ((reception - sent + (transmission - back)) / 2, delay);
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { }
        }
        if (best.Delay == TimeSpan.MaxValue || client != account) return;
        serverClockOffset = best.Offset;
        syncPing = (long)Math.Clamp(best.Delay.TotalMilliseconds, 0, 5000);
        if (syncGroup != null) await SyncRequest("Ping", new { Ping = syncPing });
    }

    private async Task SyncRequest(string action, object? body = null)
    {
        Trace("requête " + action + (client == null ? " (sans compte)" : ""));
        if (client is not { } account) return;
        try
        {
            // Erreur de transport (connexion coupée ou refusée) : nouvel essai, la commande reste valable.
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    await account.Command("SyncPlay/" + action, body ?? new { }, lifetime.Token);
                    break;
                }
                catch (HttpRequestException error) when (error.StatusCode == null && attempt < 2 && client == account)
                {
                    Trace("requête " + action + " : nouvel essai (" + error.Message + ")");
                    await Task.Delay(300 * (attempt + 1), lifetime.Token);
                }
            }
            Trace("requête " + action + " acceptée");
        }
        catch (Exception error) when (TracePath != null && error is not (HttpRequestException or OperationCanceledException))
        {
            Trace("requête " + action + " : " + error.GetType().Name + " " + error.Message);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
        {
            Trace("requête " + action + " : " + error.GetType().Name + " " + error.Message);
            if (error is HttpRequestException { StatusCode: System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.Unauthorized })
                ShowStatus("Jellyfin n’autorise pas SyncPlay pour ce compte (droit à activer par l’administrateur).");
            else if (!lifetime.IsCancellationRequested) ShowStatus("Le serveur n’a pas répondu à la demande SyncPlay. Réessayez.");
        }
    }

    // ---------- SyncPlay : actions locales ----------

    private void SyncCreate(string name, MediaItem? item = null)
    {
        closingGroupId = null;
        syncPendingItem = item;
        _ = SyncRequest("New", new { GroupName = string.IsNullOrWhiteSpace(name) ? "Soirée Noctra" : name.Trim()[..Math.Min(name.Trim().Length, 60)] });
    }

    private void SyncJoin(string groupId) { closingGroupId = null; if (PlayRequest.Identifier(groupId)) _ = SyncRequest("Join", new { GroupId = groupId }); }
    private void SyncLeave() => _ = SyncRequest("Leave");

    // Supprime une séance ouverte (la sienne ou une séance oubliée).
    private void SyncDelete(string groupId, string name)
    {
        if (!PlayRequest.Identifier(groupId)) return;
        if (syncGroup?.Id == groupId)
        {
            if (syncGroup.Members.Count > 1)
                ShowStatus("D’autres personnes sont encore dans « " + name + " » : vous la quittez, elle se fermera quand tout le monde sera parti.");
            if (pendingMedia != null && active?.Synchronized == true) FinishPlayback();
            SyncLeave();
            return;
        }
        if (syncGroup != null) { ShowStatus("Quittez d’abord votre séance en cours pour supprimer une autre séance."); return; }
        closingGroupId = groupId;
        closingGroupName = name;
        closingOthers = 0;
        closingParticipants = [];
        _ = SyncRequest("Join", new { GroupId = groupId });
        _ = DeleteFallback();
        // Sans réponse du serveur (ce PC y était peut-être déjà inscrit) : départ quand même, puis vérification.
        async Task DeleteFallback()
        {
            try { await Task.Delay(4000, lifetime.Token); }
            catch (OperationCanceledException) { return; }
            if (closingGroupId != groupId || client is not { } account) return;
            closingGroupId = null;
            await SyncRequest("Leave");
            await ConfirmGroupDeleted(account, groupId, name, closingParticipants);
        }
    }

    // Fermeture automatique : plus aucune lecture et plus personne d'autre dans la séance.
    // Délai : 1 min après le départ du dernier participant, 10 min si personne n'est jamais venu.
    private void SyncIdleTick()
    {
        if (syncGroup is not { } group) { syncIdle.Stop(); return; }
        var playing = pendingMedia != null || active != null || group.State is "Playing" or "Waiting";
        if (playing || group.Members.Count > 1) { group.IdleSince = null; return; }
        group.IdleSince ??= DateTime.UtcNow;
        var limit = group.HadOthers ? SyncIdleLimit > 0 ? SyncIdleLimit : 60 : 600;
        if ((DateTime.UtcNow - group.IdleSince.Value).TotalSeconds < limit) return;
        Trace("séance fermée automatiquement " + group.Id);
        var name = group.Name;
        SyncLeave();
        ShowStatus("Séance « " + name + " » fermée : plus de lecture ni d’autre participant.");
    }

    // Un titre lancé pendant une séance commune démarre chez tous les participants.
    private void SyncPlayItem(MediaItem item, long startTicks)
    {
        ShowStatus("Lancement de « " + item.DisplayTitle + " » pour tout le groupe…");
        _ = SyncRequest("SetNewQueue", new { PlayingQueue = new[] { item.Id }, PlayingItemPosition = 0, StartPositionTicks = startTicks });
    }

    private void RefreshSyncIndicators()
    {
        var group = syncGroup;
        SyncBadge.Visibility = group == null ? Visibility.Collapsed : Visibility.Visible;
        SyncBadgeText.Text = group == null ? "" : "Ensemble · " + Math.Max(1, group.Members.Count);
        SyncBadge.ToolTip = group == null ? null : group.Name + " · " + string.Join(", ", group.Members);
        RefreshHeaderSync();
        if (page?.Title == SyncPageTitle && LibraryShell.Visibility == Visibility.Visible && pageRequest != null && !rerenderingSync)
        {
            rerenderingSync = true;
            _ = Dispatcher.BeginInvoke(async () => { try { if (page?.Title == SyncPageTitle) await Navigate(SyncPlayPage, back: true); } finally { rerenderingSync = false; } });
        }
    }
    private bool rerenderingSync;
    // 0.8 : SyncPlay depuis le bandeau (icône discrète, comme Jellyfin et la PWA) : créer une séance,
    // rejoindre une séance ouverte, ou voir son groupe et le quitter.
    private void HeaderSyncMenu(object sender, RoutedEventArgs args)
    {
        if (client is not { } account) return;
        var button = (Button)sender;
        var menu = new ContextMenu { PlacementTarget = button, Placement = PlacementMode.Bottom, MinWidth = 280 };
        MenuItem Entry(string header, Action? click, string? id = null, bool enabled = true)
        {
            var entry = new MenuItem { Header = header, IsEnabled = enabled, Padding = new Thickness(6, 8, 18, 8) };
            if (id != null) AutomationProperties.SetAutomationId(entry, id);
            if (click != null) entry.Click += (_, _) => click();
            return entry;
        }
        if (syncGroup is { } group)
        {
            menu.Items.Add(Entry("« " + group.Name + " » · " + string.Join(", ", group.Members), null, enabled: false));
            menu.Items.Add(new Separator());
            if (CanRejoinGroup)
            {
                var rejoin = Entry("▶  Rejoindre la lecture", SyncRejoin, "HomeSyncRejoin");
                rejoin.FontWeight = FontWeights.SemiBold;
                menu.Items.Add(rejoin);
            }
            menu.Items.Add(Entry("Ouvrir le groupe", () => _ = Navigate(SyncPlayPage), "HomeSyncOpen"));
            menu.Items.Add(Entry("Quitter la séance", SyncLeave, "HomeSyncLeave"));
            if (group.Members.Count <= 1) menu.Items.Add(Entry("Supprimer la séance", () => SyncDelete(group.Id, group.Name), "HomeSyncDelete"));
        }
        else
        {
            menu.Items.Add(Entry("Créer une séance", () =>
            {
                if (!realtimeConnected) { ShowStatus("Connexion temps réel au serveur indisponible : SyncPlay ne peut pas démarrer."); return; }
                SyncCreate("Soirée de " + account.User.Name);
                _ = Navigate(SyncPlayPage);
            }, "HomeSyncCreate"));
            var searching = Entry("Recherche des séances ouvertes…", null, enabled: false);
            menu.Items.Add(new Separator());
            menu.Items.Add(searching);
            menu.Items.Add(new Separator());
            menu.Items.Add(Entry("Regarder ensemble…", () => _ = Navigate(SyncPlayPage), "HomeSyncList"));
            _ = LoadOpenGroups();
            async Task LoadOpenGroups()
            {
                JsonElement[] groups;
                try { groups = (await account.ReadJson("SyncPlay/List", lifetime.Token)).List(); }
                catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException) { groups = []; }
                var index = menu.Items.IndexOf(searching);
                if (index < 0) return;
                menu.Items.RemoveAt(index);
                if (groups.Length == 0) menu.Items.Insert(index, Entry("Aucune séance ouverte", null, enabled: false));
                for (var number = 0; number < Math.Min(groups.Length, 8); number++)
                {
                    var id = groups[number].Str("GroupId");
                    var name = groups[number].Str("GroupName");
                    var label = name.Length > 0 ? name : "séance";
                    var join = Entry("« " + label + " » · " + groups[number].List("Participants").Length + " participant(s)", null);
                    join.Items.Add(Entry("Rejoindre", () => SyncJoin(id), "HomeSyncJoin" + number));
                    join.Items.Add(Entry("Supprimer", () => SyncDelete(id, label), "HomeSyncDelete" + number));
                    menu.Items.Insert(index + number, join);
                }
            }
        }
        trackMenu = menu;
        menu.IsOpen = true;
    }

    private void RefreshHeaderSync()
    {
        var inGroup = syncGroup != null;
        SyncHeaderDot.Visibility = inGroup ? Visibility.Visible : Visibility.Collapsed;
        if (inGroup) SyncHeaderGlyph.Foreground = BrushFor("Accent");
        else SyncHeaderGlyph.ClearValue(TextBlock.ForegroundProperty);
        SyncHeaderButton.ToolTip = syncGroup is { } group ? "En séance : « " + group.Name + " » · " + Math.Max(1, group.Members.Count) + " participant(s)" +
            (CanRejoinGroup ? " · cliquez pour rejoindre la lecture" : "") : "Regarder ensemble (SyncPlay)";
    }

    private void SyncMenu(object sender, RoutedEventArgs args)
    {
        var button = (Button)sender;
        var menu = new ContextMenu { Background = ColorOf("#1A1D29"), Foreground = BrushFor("Ink"), PlacementTarget = button, Placement = PlacementMode.Bottom };
        MenuItem Entry(string header, Action? click, bool enabled = true)
        {
            var entry = new MenuItem { Header = header, Foreground = BrushFor("Ink"), IsEnabled = enabled, Padding = new Thickness(6, 8, 18, 8) };
            if (click != null) entry.Click += (_, _) => click();
            menu.Items.Add(entry);
            return entry;
        }
        if (syncGroup is { } group)
        {
            Entry(group.Name + " · " + group.Members.Count + " participant" + (group.Members.Count > 1 ? "s" : ""), null, false);
            foreach (var member in group.Members) Entry("   " + member, null, false);
            menu.Items.Add(new Separator());
            Entry("Quitter le groupe", SyncLeave);
        }
        else
        {
            var current = pendingMedia;
            Entry("Créer un groupe avec ce titre", current == null ? null : () =>
            {
                var position = (long)((active?.Position ?? 0) * TimeSpan.TicksPerSecond);
                SyncCreate("Soirée de " + (client?.User.Name ?? "Noctra"), current with { UserData = new WatchData(false, position, false) });
            }, current != null && realtimeConnected);
            if (!realtimeConnected) Entry("Connexion temps réel indisponible", null, false);
            var loading = Entry("Recherche des groupes…", null, false);
            _ = FillGroups(menu, loading);
        }
        trackMenu = menu;
        menu.IsOpen = true;
    }

    private async Task FillGroups(ContextMenu menu, MenuItem placeholder)
    {
        if (client is not { } account) return;
        try
        {
            var groups = (await account.ReadJson("SyncPlay/List", lifetime.Token)).List();
            menu.Items.Remove(placeholder);
            if (groups.Length == 0) menu.Items.Add(new MenuItem { Header = "Aucun groupe ouvert", IsEnabled = false, Foreground = BrushFor("Muted") });
            foreach (var group in groups)
            {
                var id = group.Str("GroupId");
                var entry = new MenuItem { Header = "Rejoindre « " + group.Str("GroupName") + " » · " + group.List("Participants").Length, Foreground = BrushFor("Ink"), Padding = new Thickness(6, 8, 18, 8) };
                entry.Click += (_, _) => SyncJoin(id);
                menu.Items.Add(entry);
            }
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        {
            placeholder.Header = "SyncPlay indisponible sur ce compte";
        }
    }

    private const string SyncPageTitle = "Regarder ensemble";

    private Page SyncPlayPage => new(SyncPageTitle, ButtonTab.None, async (account, cancellation) =>
    {
        PageContent.Children.Clear();
        PageContent.Children.Add(FeatureHero("", "REGARDER ENSEMBLE", "Une séance, plusieurs écrans.",
            "Lecture, pause et déplacements synchronisés au dixième de seconde avec les autres participants, sur ce PC, la PWA, Android ou un autre ordinateur."));
        if (!realtimeConnected)
        {
            PageContent.Children.Add(Message("Connexion temps réel au serveur en cours… Si elle n’aboutit pas, vérifiez que le WebSocket de Jellyfin est accessible."));
            var retry = Action("Réessayer la connexion", () => { if (client is { } current) StartRealtime(current); _ = Navigate(SyncPlayPage, back: true); });
            retry.HorizontalAlignment = HorizontalAlignment.Left;
            retry.Margin = new Thickness(0, 0, 0, 20);
            PageContent.Children.Add(retry);
        }
        if (syncGroup is { } group)
        {
            var card = new StackPanel();
            card.Children.Add(Text("VOTRE GROUPE", 11, true, "Accent"));
            var name = Text(group.Name, 30, true);
            name.Margin = new Thickness(0, 6, 0, 4);
            AutomationProperties.SetAutomationId(name, "SyncGroupName");
            card.Children.Add(name);
            var state = group.State switch { "Playing" => "Lecture en cours", "Paused" => "En pause", "Waiting" => "En attente des participants", _ => "Aucune lecture" };
            card.Children.Add(Text(state + " · ping " + syncPing + " ms", 13, color: "Muted"));
            var members = new WrapPanel { Margin = new Thickness(0, 18, 0, 18) };
            foreach (var member in group.Members) members.Children.Add(Chip(member));
            card.Children.Add(members);
            card.Children.Add(Text("Lancez un film ou un épisode depuis Noctra : il démarre chez tout le monde au même instant.", 14, color: "Muted"));
            if (group.Members.Count <= 1)
            {
                var alone = Text("Vous êtes seul dans cette séance : en la quittant, elle est supprimée. Sans lecture ni autre participant, elle se ferme seule.", 13, color: "Muted");
                alone.TextWrapping = TextWrapping.Wrap;
                alone.Margin = new Thickness(0, 10, 0, 0);
                card.Children.Add(alone);
            }
            var buttons = new WrapPanel { Margin = new Thickness(0, 18, 0, 0) };
            if (CanRejoinGroup)
            {
                var rejoin = Action("▶   Rejoindre la lecture", SyncRejoin, "Primary");
                rejoin.Margin = new Thickness(0, 0, 10, 0);
                AutomationProperties.SetAutomationId(rejoin, "SyncRejoin");
                buttons.Children.Add(rejoin);
            }
            buttons.Children.Add(Action("Quitter le groupe", SyncLeave));
            card.Children.Add(buttons);
            PageContent.Children.Add(Sheet(card));
            return;
        }
        var create = new StackPanel();
        create.Children.Add(Text("Créer un groupe", 22, true));
        var groupName = Input(create, "Nom du groupe", "Soirée de " + account.User.Name);
        AutomationProperties.SetAutomationId(groupName, "SyncGroupInput");
        var start = Action("Créer le groupe", () => SyncCreate(groupName.Text), "Primary");
        start.HorizontalAlignment = HorizontalAlignment.Left;
        start.Margin = new Thickness(0, 14, 0, 0);
        AutomationProperties.SetAutomationId(start, "SyncCreate");
        create.Children.Add(start);
        PageContent.Children.Add(Sheet(create));
        var heading = Text("Groupes ouverts", 22, true);
        heading.Margin = new Thickness(0, 26, 0, 12);
        PageContent.Children.Add(heading);
        try
        {
            var groups = (await account.ReadJson("SyncPlay/List", cancellation)).List();
            if (cancellation.IsCancellationRequested) return;
            if (groups.Length == 0) PageContent.Children.Add(Message("Aucun groupe ouvert pour le moment. Créez-en un : les autres le verront ici."));
            foreach (var open in groups)
            {
                var id = open.Str("GroupId");
                var people = open.List("Participants").Select(member => member.Str()).ToArray();
                var openName = open.Str("GroupName");
                var others = people.Count(person => person != account.User.Name);
                var delete = Action("Supprimer", () =>
                {
                    if (others > 0 && MessageBox.Show(this, string.Join(", ", people) + " y sont encore. Jellyfin ne supprime une séance que lorsque tout le monde l’a quittée : " +
                        "vous en sortirez, elle restera ouverte pour eux.", "Supprimer « " + openName + " » ?", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                    SyncDelete(id, openName);
                });
                AutomationProperties.SetAutomationId(delete, "SyncDelete-" + id);
                PageContent.Children.Add(Row(openName, people.Length + " participant" + (people.Length > 1 ? "s" : "") + " · " + string.Join(", ", people),
                    delete, Action("Rejoindre", () => SyncJoin(id), "Primary")));
            }
        }
        catch (HttpRequestException error) when (error.StatusCode is System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.Unauthorized)
        {
            PageContent.Children.Add(Message("SyncPlay n’est pas autorisé pour ce compte. L’administrateur peut l’activer dans les droits de l’utilisateur Jellyfin."));
        }
    });

    // Grand en-tête illustré des pages de fonctions (dégradé, icône, accroche).
    private FrameworkElement FeatureHero(string glyph, string eyebrow, string title, string description)
    {
        var grid = new Grid { MinHeight = 210, ClipToBounds = true };
        grid.Children.Add(new Border { CornerRadius = new CornerRadius(24), Background = new LinearGradientBrush
        {
            StartPoint = new Point(0, 0), EndPoint = new Point(1, 1),
            GradientStops = { new GradientStop(Color.FromRgb(44, 31, 84), 0), new GradientStop(Color.FromRgb(22, 26, 48), .55), new GradientStop(Color.FromRgb(12, 48, 64), 1) }
        } });
        grid.Children.Add(new Border { CornerRadius = new CornerRadius(24), BorderBrush = ColorOf("#26FFFFFF"), BorderThickness = new Thickness(1) });
        var halo = new System.Windows.Shapes.Ellipse { Width = 340, Height = 340, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, -120, -60, 0), Fill = new RadialGradientBrush(Color.FromArgb(110, 188, 170, 255), Color.FromArgb(0, 188, 170, 255)) };
        grid.Children.Add(halo);
        var icon = new TextBlock { Text = glyph, FontFamily = (FontFamily)Resources["IconFont"], FontSize = 92, Foreground = ColorOf("#30FFFFFF"),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 56, 0) };
        grid.Children.Add(icon);
        var copy = new StackPanel { Margin = new Thickness(36, 32, 200, 32), VerticalAlignment = VerticalAlignment.Center };
        copy.Children.Add(Text(eyebrow, 11, true, "Accent"));
        var heading = Text(title, 38, true);
        heading.TextWrapping = TextWrapping.Wrap;
        heading.Margin = new Thickness(0, 8, 0, 10);
        copy.Children.Add(heading);
        var caption = Text(description, 15, color: "Muted");
        caption.TextWrapping = TextWrapping.Wrap;
        caption.MaxWidth = 640;
        caption.HorizontalAlignment = HorizontalAlignment.Left;
        copy.Children.Add(caption);
        grid.Children.Add(copy);
        grid.Margin = new Thickness(0, 6, 0, 24);
        Reveal(copy, 80, 14);
        return grid;
    }

    private Border Chip(string label, string? glyph = null)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(new Border { Width = 26, Height = 26, CornerRadius = new CornerRadius(13), Background = BrushFor("AccentGradient"), Margin = new Thickness(0, 0, 9, 0),
            Child = new TextBlock { Text = glyph ?? (label.Length > 0 ? label[..1].ToUpperInvariant() : "?"), FontFamily = glyph != null ? (FontFamily)Resources["IconFont"] : FontFamily,
                FontWeight = FontWeights.Bold, FontSize = 12, Foreground = ColorOf("#0A0A12"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } });
        row.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, Foreground = BrushFor("Ink"), FontWeight = FontWeights.SemiBold });
        return new Border { Child = row, Padding = new Thickness(6, 6, 14, 6), CornerRadius = new CornerRadius(19), Background = ColorOf("#14FFFFFF"),
            BorderBrush = ColorOf("#1FFFFFFF"), BorderThickness = new Thickness(1), Margin = new Thickness(0, 0, 8, 8) };
    }

    private Border Sheet(UIElement content) => new()
    {
        Child = content, Padding = new Thickness(26, 22, 26, 24), CornerRadius = new CornerRadius(20),
        Background = BrushFor("Panel"), BorderBrush = BrushFor("Outline"), BorderThickness = new Thickness(1), Margin = new Thickness(0, 0, 0, 14)
    };
}
