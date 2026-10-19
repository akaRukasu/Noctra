# Noctra 200.0.131 — serveurs de toutes les sources sous chaque chaîne

Cette version contient aussi toutes les corrections de la 200.0.130 (voir `MISE-A-JOUR-V200130.md`).

## Symptôme
Une chaîne comme beIN Sport 1 n'avait que les serveurs de 3 sources (Movix, WiTV, FSTV), alors que LiveWatch, OHA, NorthTV, FrameTV, Daddy TV… la proposent aussi.

## Cause
Pour réunir les chaînes, Noctra regarde aussi leur pays : « TF1 » française et « TF1 » d'un autre pays restent séparées. Le pays fourni par le serveur depuis le référentiel iptv-org passait en premier. Or le serveur le devine d'après le nom, et « beIN Sports 1 » existe aussi au Qatar. Selon la source, la même chaîne devenait donc française ou étrangère : elle n'était plus réunie, et la version « étrangère », masquée puisque seules les chaînes françaises s'affichent, emportait ses serveurs.

## Correction
- Le pays d'une chaîne vient d'abord des indications explicites : pays donné par la source, drapeau, « FR: », « [FR] », « … UK », puis des marques françaises connues (TF1, Canal+, beIN Sports 1 à 3 et MAX, RMC Sport…). Le pays deviné par iptv-org ne sert qu'en dernier recours.
- Les chaînes vraiment étrangères restent séparées (« AR: beIN Sports 1 », « beIN Sports MENA »…).
- Sous le titre « Toutes les chaînes », l'apport de chaque source est affiché (« LiveWatch 245 · Movix 812 · OHA 0 »…), ainsi que les sources en attente ou indisponibles. Une source absente se repère ainsi tout de suite.

## Validation
- Nouveau test `tests/v200131-tv-country-coverage.mjs` (`npm run test:v200131`, qui enchaîne les tests 130 à 108) : beIN Sport 1 réunie depuis Movix (pays iptv-org « Qatar »), LiveWatch et OHA ; MENA et « AR: » restent à part.
- Banc d'essai Chromium : ligne « 7 sources réunies : LiveWatch 5 · Movix 5 · … ».
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé avec les vraies sources TV : injoignables d'ici.
