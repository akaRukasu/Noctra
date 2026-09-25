# Noctra v78 — TV Recovery + déploiement vérifiable

## Diagnostic important

Les captures reçues après la v77 montraient encore les boutons **« OHA officiel »** et **« OHA via Noctra »**. Ces deux choix n’existent plus dans le code v77 : ils appartiennent à la v76. La mise à jour pouvait pourtant paraître réussie parce que l’ancien script Ultra.cc ne vérifiait que `"status":"ok"` dans `/health`, et non la version réellement exécutée.

La v78 rend désormais cette situation impossible à ignorer :

- `/health` et `/api/config` annoncent `78.0.0` ;
- la TV affiche `NOCTRA · TV EN DIRECT · v78` ;
- le client affiche un avertissement si sa version ne correspond pas au serveur ;
- le script de mise à jour Ultra.cc exige que `/health` renvoie exactement la nouvelle version avant d’annoncer le succès.

## Dock administrateur mobile

- la PWA ne rétrograde plus temporairement l’administrateur lorsque `ApiClient.accessToken()` n’est pas encore réhydraté ;
- la session HttpOnly Noctra est utilisée comme continuité d’authentification ;
- resynchronisation du rôle sur `pageshow`, retour de visibilité et focus ;
- les huit actions admin sont compactées dans la capsule mobile au lieu de partir hors écran ;
- aucune animation de déplacement n’est réintroduite sur le dock.

## LiveWatch VIP

- les chaînes Premium utilisent maintenant un **resolver au clic** ;
- priorité 1 : flux Premium serveur uniquement s’il est réellement validé jusqu’à une ressource média ;
- priorité 2 : lecteur officiel LiveWatch dans le bridge Noctra authentifié ;
- lecteur public « 2 pubs » conservé uniquement comme **secours manuel** ;
- le diagnostic VIP ne considère plus un simple HTTP 200 sur le HTML comme une preuve de lecture ; il teste le chemin média Premium ;
- prise en charge des endpoints Premium qui renvoient directement une playlist `#EXTM3U` au lieu d’une URL JSON ;
- le proxy HLS sait forcer le traitement playlist pour ce cas ;
- réparation du constructeur `URL` dans le sandbox opaque du bridge LiveWatch.

## OHA

- le seul chemin automatique reste **OHA intégré**, donc le client officiel qui produit lui-même `Mediaurl-Signature` et `mediahubmx-signature` ;
- réparation du constructeur `URL` dans le sandbox opaque : `new URL(path, location.origin)` ne plante plus lorsque `location.origin === "null"` ;
- assets, requêtes signées et médias restent confinés au bridge/relais existant ;
- aucun faux serveur natif non signé n’est réintroduit.

## WiTV

**Aucune modification de la logique WiTV.** Les empreintes SHA-256 des trois blocs critiques (resolver/catalogue, bridge serveur, fallback client) restent celles de la v76/v77 et sont testées automatiquement.

## Vérifications

- `node --check server.mjs` ;
- `node --check public/noctra-shell.js` ;
- `npm run check` ;
- `npm test` ;
- smoke test avec `BASE_URL=/noctra` ;
- vérification de `/health`, `/api/config`, shell/CSS v78 ;
- tests relancés depuis l’archive ZIP finale extraite dans un dossier neuf ;
- contrôle qu’aucun `.env`, dossier runtime, session LiveWatch ni identifiant utilisateur n’est inclus dans le ZIP.
