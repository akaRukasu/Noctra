# Noctra Media Client v80

## Objectif

Correction ciblée du dock mobile et stabilisation des lecteurs LiveWatch VIP / OHA à partir de la v79. La logique WiTV reste inchangée et ses blocs critiques continuent d'être vérifiés bit-à-bit par les tests.

## Dock mobile

- Le logo Noctra est totalement retiré du dock uniquement sous 760 px.
- L'espace auparavant réservé au logo est supprimé : le dock devient une barre continue dédiée aux actions.
- Les boutons admin restent répartis sur toute la largeur de la barre.
- Les règles v79 supprimant halo, double bulle et animation restent actives.

## LiveWatch VIP

- Le catalogue reste limité au catalogue principal LiveWatch `/api/v1/public/all` et aux embeds `/embed/<id>`.
- Au clic, Noctra tente d'abord le flux Premium authentifié lorsqu'il est réellement fourni par la session VIP.
- Si ce chemin n'est pas fourni ou échoue au niveau réseau, le second chemin reste le lecteur LiveWatch officiel exécuté dans le bridge VIP Noctra.
- Le lecteur public avec deux publicités reste strictement manuel et n'est pas utilisé comme fallback automatique.
- Les assets JS/CSS officiels réécrits par le bridge ne conservent plus les attributs SRI `integrity` / `crossorigin` devenus invalides après proxy/réécriture.
- La session virtuelle Supabase est fournie pour toute clé de stockage `sb-*-auth-token`, ce qui évite qu'un changement de project-ref côté LiveWatch fasse apparaître le lecteur comme anonyme alors que la session serveur reste valide.
- Les redirections canoniques LiveWatch -> LiveWatch conservent les cookies et le bearer ; toute redirection vers un domaine tiers les retire toujours.
- Les médias CDN sans extension sont acceptés seulement après validation du Content-Type média/HLS/DASH.
- Lorsqu'un vrai `<video>` / `<source>` est résolu par le lecteur officiel, le bridge envoie immédiatement cette URL relayée au lecteur natif Noctra. La lecture ne dépend donc plus uniquement de la balise vidéo dans l'iframe sandboxée.

## OHA / oha.cx

- `https://oha.cx/live` reste la racine primaire du catalogue et du lecteur.
- Le bridge conserve désormais les cookies émis par OHA entre la page `/watch`, les assets et les appels API ; ils restent limités aux hôtes OHA officiels.
- Une redirection canonique `oha.cx <-> oha.to` peut conserver les cookies et signatures OHA nécessaires, mais aucune donnée sensible n'est transmise à un CDN tiers.
- Les scripts et feuilles de style proxifiés ne gardent plus de SRI/crossorigin devenu invalide après réécriture.
- Les médias CDN sans extension sont acceptés après vérification de leur Content-Type et restent en lecture seule.
- Les playlists externes réutilisent les éventuels cookies émis par leur propre CDN pour leurs variantes/segments.
- Dès que le client OHA officiel assigne une vraie source à un `<video>` / `<source>`, le bridge transmet la source relayée au lecteur natif Noctra. Cela évite qu'une vidéo correctement résolue reste invisible dans le sandbox OHA.

## WiTV

- Aucune modification de la logique WiTV.
- Les empreintes SHA-256 des trois blocs critiques WiTV (resolver/catalogue, bridge serveur, fallback client) restent identiques à la v76 et sont testées à chaque `npm test`.

## Version / cache

- Version : `80.0.0`
- Cache PWA : `noctra-shell-v80`
- HLS.js / shell / thème / manifeste : cache-busters v80
- Marqueur TV : `NOCTRA · TV EN DIRECT · v80`
- `/health` et `/api/config` annoncent `80.0.0`.

## Vérifications

- `npm run check` : OK
- `npm test` : OK
- responsive / dock mobile : OK
- LiveWatch VIP / bridge / SRI / handoff média : OK
- OHA oha.cx / cookies / SRI / handoff média : OK
- conservation bit-à-bit WiTV : OK
- smoke test serveur avec `BASE_URL=/noctra` : OK

Le test vidéo réel de bout en bout dépend toujours du réseau de l'instance Ultra.cc vers LiveWatch et OHA ; l'environnement de construction ne peut pas résoudre directement leurs domaines.
