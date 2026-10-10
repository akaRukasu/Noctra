# Noctra 200.0.134 — flux directs LiveWatch (livewatch.icu)

Cette version contient aussi toutes les corrections de la 200.0.133 (voir `MISE-A-JOUR-V200133.md`).

## Symptôme
Sur livewatch.icu, les serveurs directs d'une chaîne LiveWatch (« VIP · CABLE », « VIP · SAT », « VIP · BASIC »…) échouent dans le lecteur : « Shaka · réessaie ou choisis HLS.js ».

## Cause probable
Le serveur Noctra demande le flux à l'API LiveWatch avec la session VIP, puis relaie la vidéo. La session n'était jointe qu'aux adresses `livewatch.icu` et `www.livewatch.icu`. Si le nouveau site sert ses flux depuis un sous-domaine (par exemple `hls.livewatch.icu`), ou y redirige, la session était retirée. Le serveur de flux refusait alors la lecture.

## Correction
- La session VIP (et les cookies LiveWatch) est jointe aux flux, et à leurs morceaux de vidéo, servis par un sous-domaine LiveWatch.
- Elle est conservée lors d'une redirection d'un hôte LiveWatch vers un autre.
- Jamais vers un autre site.

## Diagnostic
Dans `/api/tv/livewatch/diagnostics` (compte administrateur), `checks[0].stream` décrit le flux direct d'une chaîne test :
- son hôte, et l'hôte atteint après redirection ;
- si la session VIP lui est envoyée ;
- la réponse HTTP et le type de playlist obtenue.

Les jetons sont masqués dans le chemin.

## Validation
- Nouveau test `tests/v200134-livewatch-stream-hosts.mjs` (`npm run test:v200134`, qui enchaîne les tests 133 à 108).
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé avec le vrai site (injoignable d'ici).
