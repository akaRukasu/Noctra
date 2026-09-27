package okhttp3;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

/** Signatures de compilation seulement : la vraie classe vient de l'APK Jellyfin. */
public interface Dns {
    List<InetAddress> lookup(String hostname) throws UnknownHostException;
}
