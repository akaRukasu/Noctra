package androidx.media3.common;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface Player {
    int STATE_IDLE = 1;
    int STATE_BUFFERING = 2;
    int STATE_READY = 3;
    int STATE_ENDED = 4;

    void setMediaItem(MediaItem mediaItem);
    void prepare();
    void setPlayWhenReady(boolean playWhenReady);
    void release();
    void stop();
    int getPlaybackState();
    PlaybackException getPlayerError();
    boolean isPlaying();
    void setVolume(float volume);
    void seekToDefaultPosition();
    void setMediaItem(MediaItem mediaItem, long startPositionMs);
    long getCurrentPosition();
    long getDuration();
    long getTotalBufferedDuration();
    void seekTo(long positionMs);
    TrackSelectionParameters getTrackSelectionParameters();
    void setTrackSelectionParameters(TrackSelectionParameters parameters);
}
