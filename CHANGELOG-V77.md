# Noctra Media Client v77 — LiveWatch VIP / OHA

Cette version est volontairement limitée à **LiveWatch VIP** et **OHA**. La logique WiTV de la v76 n'a pas été modifiée : les blocs resolver/catalogue, bridge et fallback client sont contrôlés par empreinte dans les tests de régression.

## LiveWatch VIP

- Le HLS direct non documenté n'est plus le chemin principal. Les catalogues publics LiveWatch fournissent des embeds ; le VIP utilise donc le **lecteur officiel LiveWatch exécuté dans un bridge Noctra authentifié**.
- La session VIP partagée reste côté serveur. Le navigateur reçoit seulement une session Supabase virtuelle destinée à l'état local du player ; le vrai bearer et le vrai refresh token ne sont jamais sérialisés dans l'iframe.
- Le bridge reproduit explicitement les réponses `auth/v1/user` et `rest/v1/user_profiles` à partir de la session VIP déjà vérifiée côté serveur. Le player officiel voit donc `is_vip=true` et le rôle VIP même si une politique Supabase/RLS évolue.
- Les appels officiels LiveWatch/Supabase sont envoyés avec le vrai bearer côté serveur. Une réponse 401/403 provoque une seule actualisation de session puis une nouvelle tentative.
- Une ouverture de chaîne rafraîchit la session avant de préparer le player, sans ralentir le chargement du catalogue.
- Les chunks JS/CSS et ressources dynamiques LiveWatch restent dans le bridge Noctra, y compris lorsqu'ils sont chargés après le bundle initial.
- Le bridge signale maintenant explicitement si l'écran « Débloquer le direct / Pub 1 » réapparaît malgré le VIP, au lieu de laisser Noctra annoncer à tort une lecture Premium.
- **Aucune bascule automatique vers la page publique avec deux publicités.** Le choix `Public · 2 pubs (secours)` reste uniquement manuel.
- Le bouton de diagnostic VIP vérifie le profil VIP et la joignabilité des embeds officiels au lieu de dépendre d'un endpoint HLS non documenté.

## OHA

- La page OHA distante n'est plus utilisée dans une iframe directe : ce chemin était celui qui produisait la page grise/icone de document cassé lorsque le fournisseur refusait le framing.
- **`OHA intégré` est désormais l'unique chemin automatique** : il exécute le client officiel dans le bridge Noctra.
- Les anciens « serveurs natifs » non signés ne sont plus exposés dans l'interface comme s'ils étaient fiables. Les protocoles MediaURL/MediaHubMX exigent des signatures produites par le client officiel ; Noctra conserve et relaie celles-ci au lieu d'en fabriquer.
- Le bridge transmet `Mediaurl-Signature` et `mediahubmx-signature` uniquement aux domaines OHA et les retire lors du passage vers un CDN tiers.
- Les scripts, links, images, iframes et sources créés dynamiquement sont remappés vers le bridge.
- Les bundles JS/CSS OHA sont réécrits pour que les chunks root-relative et URLs absolues OHA ne s'échappent pas du proxy lorsque le chargeur de modules ne passe pas par `window.fetch`.
- Les médias HLS/CDN continuent à être relayés en lecture seule par Noctra et les playlists sont réécrites vers les références de flux Noctra.
- En cas d'échec du bridge, l'interface affiche l'erreur OHA : elle ne rebascule plus automatiquement sur l'iframe distante déjà connue comme cassée. Le bouton `Ouvrir` garde l'URL officielle externe.

## WiTV

- **Aucun changement fonctionnel.** Les trois zones WiTV critiques sont comparées à la v76 par SHA-256 dans `tests/tv-playback-regressions.mjs`.

## Vérifications locales

- `npm run check`
- `npm test`
- tests spécifiques LiveWatch VIP, OHA et conservation bit-à-bit de WiTV
- smoke test serveur avec `BASE_URL=/noctra` et `/noctra/health` en `77.0.0`

La validation d'un flux vidéo réel reste dépendante de la connectivité de l'instance Noctra vers LiveWatch/OHA ; l'environnement de construction ne dispose pas de la résolution DNS sortante nécessaire vers ces fournisseurs.
