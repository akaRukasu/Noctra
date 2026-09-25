# Noctra v74 — chaîne de lecture TV revue

## LiveWatch VIP

- Le lecteur officiel LiveWatch préparé par Noctra redevient le chemin VIP principal.
- La vraie session Supabase reste côté serveur ; l'iframe reçoit uniquement une session virtuelle compatible avec le client officiel.
- Les requêtes LiveWatch/Supabase du lecteur sont relayées côté serveur avec la vraie session, sans exposer bearer ni refresh token aux comptes Noctra.
- Les indicateurs `is_vip` / rôle sont présents dans la session virtuelle afin que le player puisse reconnaître le compte avant même la lecture du profil distant.
- Les médias CDN détectés par le player sont relayés par Noctra pour éviter les blocages CORS du sandbox.
- Le relais CDN n'accepte que des URLs média plausibles et n'envoie jamais bearer, cookies ou clé Supabase vers un domaine tiers.
- `VIP HLS (secours)` reste disponible pour compatibilité ; le lecteur public avec publicité reste le dernier secours.

## OHA

- Le lecteur officiel reste prioritaire afin que la signature `mediahubmx-signature` soit produite par le client OHA lui-même.
- Les requêtes générées à partir de `location.origin` sont remappées vers le domaine OHA au lieu de pointer accidentellement vers l'origine Noctra.
- Les affectations directes à `<video src>` / `<source src>` sont interceptées.
- Les médias CDN externes sont relayés en lecture seule par Noctra afin d'éviter `Origin: null` et les refus CORS liés à l'iframe sandboxée.
- Les playlists HLS reçues via le pont sont réécrites : variantes, clés et segments continuent par le proxy TV Noctra.
- La signature OHA est relayée uniquement vers les domaines OHA, jamais vers un CDN tiers.

## WiTV

- Le HLS extrait du lecteur WiTV n'est plus remis directement au navigateur.
- Noctra crée une référence de flux et sert master, variantes et segments via `/api/tv/stream/` avec le Referer du lecteur WiTV.
- Le lecteur web préparé reste le secours si l'extraction HLS n'aboutit pas.

## Sécurité réseau TV

- Lors d'une redirection HTTP vers un autre domaine, Noctra retire `Authorization`, `Cookie`, `apikey` et `mediahubmx-signature` avant de suivre le redirect.
- Les relais média externes utilisent la validation d'URL publique existante pour refuser les adresses réseau privées.

## Validation

- `npm run check`.
- Suite complète `npm test`.
- Tests de régression : session virtuelle LiveWatch sans secret, remapping CDN LiveWatch/OHA, relayage WiTV, réécriture HLS, suppression des credentials lors d'une redirection cross-origin.
- Smoke test serveur avec `BASE_URL=/noctra` et `/noctra/health` en `74.0.0`.
