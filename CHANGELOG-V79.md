# Noctra Media Client v79

## Objectif

Stabilisation ciblée de la partie TV à partir de la v78, sans modifier la logique WiTV qui était déjà fonctionnelle.

## Dock mobile

- Suppression du halo / de la bulle active qui réapparaissait sur le bouton sélectionné.
- Neutralisation des pseudo-éléments `::before` / `::after` du bouton actif sur mobile.
- Suppression du second fond/bordure actif qui produisait l'impression d'une bulle dédoublée.
- Le dock reste statique : aucun déplacement ni animation au survol/clic.

## LiveWatch VIP

- L'onglet **LiveWatch** ne fusionne plus implicitement DaddyTV, NorthTV et FrameTV.
- Le catalogue affiché vient uniquement de l'API LiveWatch principale `/api/v1/public/all` et ne conserve que les embeds de la famille `/embed/<id>`.
- Le fournisseur d'une chaîne issue de cet onglet reste donc `LiveWatch`, au lieu de pouvoir devenir DaddyTV parce que son catalogue répond plus vite.
- Le chemin principal VIP utilise le **lecteur officiel LiveWatch** dans le bridge authentifié Noctra.
- Le lecteur public avec deux étapes publicitaires reste un secours manuel uniquement.
- Correction du bridge : les `<iframe>`, `<script>` et `<img>` externes n'étaient pas des médias, mais étaient envoyés dans le tunnel `media=1`. Ils pouvaient alors être refusés et laisser un écran noir. Seuls `video`, `audio` et `source` utilisent désormais le tunnel média.
- Le diagnostic VIP teste le profil VIP et l'accessibilité du lecteur officiel de la famille LiveWatch principale ; DaddyTV n'est plus utilisé comme preuve de fonctionnement de LiveWatch.

## OHA

- `https://oha.cx/live` redevient la racine OHA **primaire**.
- Si une requête effectuée depuis `oha.cx` est redirigée par OHA vers son hôte canonique, la réponse est acceptée mais le catalogue conserve `oha.cx` comme point de départ du lecteur `/watch`.
- Le bridge mémorise ensuite l'URL réellement obtenue après redirection afin que les assets/API suivants utilisent le bon hôte officiel.
- Correction du même défaut de bridge que LiveWatch : scripts, iframes et images ne sont plus envoyés par erreur dans le proxy réservé aux médias.
- Les ressources vidéo (`video`, `audio`, `source`), playlists et segments restent relayés lorsque nécessaire pour le sandbox/CORS.
- Les signatures `Mediaurl-Signature` et `mediahubmx-signature` produites par le client OHA officiel continuent d'être relayées par Noctra.

## WiTV

- **Aucune modification de la logique WiTV.**
- Les trois blocs critiques WiTV restent vérifiés par empreinte SHA-256 par rapport à la v76 : resolver/catalogue, bridge serveur et fallback/lecteur client.

## Version / cache

- Version : `79.0.0`
- Cache PWA : `noctra-shell-v79`
- HLS.js et Service Worker : cache-busters v79
- Partie TV : marqueur visuel `NOCTRA · TV EN DIRECT · v79`
- `/health` et `/api/config` annoncent `79.0.0`.

## Tests

- `npm run check`
- `npm test`
- tests statiques
- responsive / dock mobile
- LiveWatch VIP
- résolveurs TV WiTV/OHA
- régressions de lecture TV
- conservation bit-à-bit des blocs WiTV

Le dernier test d'un flux réel LiveWatch/OHA reste dépendant du réseau de l'instance qui exécute Noctra : l'environnement de construction ne dispose pas d'un accès DNS sortant aux fournisseurs TV.
