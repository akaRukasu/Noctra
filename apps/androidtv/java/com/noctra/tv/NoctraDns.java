package com.noctra.tv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URL;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.Dns;
import okhttp3.OkHttpClient;

/**
 * DNS sécurisé (DNS-over-HTTPS : Cloudflare, Google, Quad9, joints par leur
 * adresse IP, donc sans passer par le DNS du fournisseur d'accès).
 *
 * En France, les fournisseurs d'accès bloquent par DNS de nombreux sites de
 * sport en direct (décisions ARCOM) : le nom ne se résout pas, ou renvoie vers
 * une page de blocage. Un PC avec un navigateur en DNS sécurisé les ouvre, un
 * téléviseur non. blocked() détecte ce cas (échec, adresse locale, ou adresse
 * différente de celle du DNS sécurisé pour un site servi par Cloudflare) ;
 * les requêtes de ces sites passent alors par OkHttp avec ce DNS.
 */
final class NoctraDns implements Dns {
    static final NoctraDns SECURE = new NoctraDns();

    private static final String[] RESOLVERS = {
        "https://1.1.1.1/dns-query?type=A&name=",
        "https://8.8.8.8/resolve?type=A&name=",
        "https://9.9.9.9:5053/dns-query?type=A&name="
    };
    private static final long TTL_MS = 10 * 60 * 1000;
    private static final Map<String, Object[]> resolved = new HashMap<String, Object[]>();
    private static final Map<String, Object[]> verdicts = new HashMap<String, Object[]>();
    private static OkHttpClient client;

    private NoctraDns() { }

    /** Résolution par DNS sécurisé, puis DNS du système en dernier recours. */
    @Override
    public List<InetAddress> lookup(String host) throws UnknownHostException {
        List<InetAddress> secure = secure(host);
        if (!secure.isEmpty()) return secure;
        return Arrays.asList(InetAddress.getAllByName(host));
    }

    /** Client HTTP qui résout tout par le DNS sécurisé. */
    static synchronized OkHttpClient client() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .dns(SECURE)
                .followRedirects(true)
                .followSslRedirects(true)
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(25, TimeUnit.SECONDS)
                .build();
        }
        return client;
    }

    static List<InetAddress> secure(String host) {
        if (host == null || host.isEmpty()) return new ArrayList<InetAddress>();
        synchronized (resolved) {
            Object[] entry = resolved.get(host);
            if (entry != null && System.currentTimeMillis() - (Long) entry[0] < TTL_MS) {
                @SuppressWarnings("unchecked") List<InetAddress> cached = (List<InetAddress>) entry[1];
                return cached;
            }
        }
        List<InetAddress> addresses = new ArrayList<InetAddress>();
        for (String resolver : RESOLVERS) {
            addresses = query(resolver, host);
            if (!addresses.isEmpty()) break;
        }
        synchronized (resolved) {
            resolved.put(host, new Object[] { System.currentTimeMillis(), addresses });
        }
        return addresses;
    }

    private static List<InetAddress> query(String resolver, String host) {
        List<InetAddress> addresses = new ArrayList<InetAddress>();
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(resolver + URLEncoder.encode(host, "UTF-8")).openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setRequestProperty("Accept", "application/dns-json");
            if (connection.getResponseCode() != 200) return addresses;
            InputStream input = connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
            input.close();
            JSONArray answers = new JSONObject(buffer.toString("UTF-8")).optJSONArray("Answer");
            for (int i = 0; answers != null && i < answers.length(); i++) {
                JSONObject answer = answers.optJSONObject(i);
                if (answer == null || answer.optInt("type") != 1) continue;
                String ip = answer.optString("data");
                // Adresse IPv4 littérale : aucune résolution supplémentaire.
                if (ip.matches("\\d{1,3}(\\.\\d{1,3}){3}")) addresses.add(InetAddress.getByName(ip));
            }
        } catch (Throwable ignored) {
            addresses.clear();
        } finally {
            if (connection != null) connection.disconnect();
        }
        return addresses;
    }

    /** Site bloqué par le DNS du fournisseur d'accès ? (résultat mémorisé 10 min) */
    static boolean blocked(String host) {
        if (host == null || host.isEmpty() || host.matches("[\\d.]+") || host.indexOf(':') >= 0) return false;
        synchronized (verdicts) {
            Object[] entry = verdicts.get(host);
            if (entry != null && System.currentTimeMillis() - (Long) entry[0] < TTL_MS) return (Boolean) entry[1];
        }
        boolean verdict = judge(host);
        synchronized (verdicts) {
            verdicts.put(host, new Object[] { System.currentTimeMillis(), verdict });
        }
        return verdict;
    }

    private static boolean judge(String host) {
        InetAddress[] system;
        try {
            system = InetAddress.getAllByName(host);
        } catch (Throwable error) {
            // Introuvable pour le système mais connu du DNS sécurisé : bloqué.
            return !secure(host).isEmpty();
        }
        for (InetAddress address : system) {
            if (address.isLoopbackAddress() || address.isAnyLocalAddress() || address.isSiteLocalAddress()) return !secure(host).isEmpty();
        }
        // Site servi par Cloudflare (adresses identiques partout) mais adresse
        // système différente et hors Cloudflare : réponse modifiée par le FAI.
        List<InetAddress> secure = secure(host);
        if (secure.isEmpty() || !cloudflare(secure.get(0))) return false;
        for (InetAddress address : system) {
            if (secure.contains(address) || cloudflare(address)) return false;
        }
        return true;
    }

    private static boolean cloudflare(InetAddress address) {
        if (!(address instanceof Inet4Address)) return false;
        byte[] ip = address.getAddress();
        int a = ip[0] & 0xff;
        int b = ip[1] & 0xff;
        return (a == 104 && b >= 16 && b <= 31) || (a == 172 && b >= 64 && b <= 71)
            || (a == 188 && b == 114) || (a == 162 && (b == 158 || b == 159)) || (a == 141 && b == 101)
            || (a == 108 && b == 162) || (a == 190 && b == 93) || (a == 197 && b == 234) || (a == 198 && b == 41)
            || (a == 173 && b == 245) || (a == 103 && (b == 21 || b == 22 || b == 31));
    }
}
