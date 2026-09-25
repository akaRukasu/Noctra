# Noctra 200.0.48 — récupération et stabilité TV

Base : archive v200.0.47 fournie par l'utilisateur, SHA-256
`1eeb6e7f53050396bdbac80bc5ef604e54d16a882e82ecb433684c8ad5833202`.

## Changements

La vérification des flux WiTV, OHA et StreamSports attend un préfixe média non vide, sans télécharger un segment entier ni prétendre vérifier son décodage. Les réponses HTML/JSON identifiables, les segments vides et les corps bloqués sont rejetés. Le master ABR est conservé. Un segment voisin récent peut remplacer une sonde sortie de la fenêtre live ; une seule reprise est autorisée, sous une échéance commune.

Les cookies sont isolés par origine pendant la sonde. Les en-têtes du master redirigé servent de base à ses références enfants, sans réintroduire les cookies d'un hôte précédent.

Le lecteur distingue le délai avant les premiers octets du temps nécessaire pour terminer un segment. Le profil normal laisse 10 secondes au premier octet d'un fragment et 45 secondes au transfert complet ; le profil faible laisse respectivement 15 et 65 secondes. Les erreurs transitoires ont au plus trois reprises de fragment, les délais une reprise. Les statuts 401/403/404/410/415/422/429 sont rendus à la gestion de récupération, sans insistance aveugle. Un segment 404/410 est distingué d'une playlist invalide ou d'une autorisation expirée.

Après démarrage, un contrôle toutes les deux secondes repère l'absence d'avancement pendant 18 à 35 secondes selon le profil et la durée des segments. Il attend aussi au moins 15 secondes sans progression du téléchargement, respecte la pause volontaire et espace ses interventions de 20 secondes au minimum. Le renouvellement conserve le résolveur du serveur choisi ; les règles existantes de secours manuels WiTV/OHA restent actives.

Le relais TV ne coupe plus les sources génériques après 30 secondes de transfert continu. Il annule les requêtes amont abandonnées par le lecteur et peut reprendre une fois une rupture de connexion avant l'envoi de données. Il ne rejoue pas les requêtes POST.

## Validation exécutée

```sh
node --check server.mjs
node --check public/noctra-shell.js
node --check public/noctra-sw.js
node tests/v200048-tv-recovery.mjs
node tests/v200047-provider-boundaries.mjs
node tests/v200046-witv-oha-startup.mjs
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
```

Le nouveau test exécute les fonctions de production et couvre : corps silencieux/vides/HTML/JSON, annulation des sondes, segment récent de remplacement, séparation des cookies entre CDN, budget de reprises, relais HTTP local continu et déconnexion avant/après en-têtes, configuration du moteur HLS 1.7.1 livré, lectures figées sans événements, pause manuelle, téléchargement lent progressant, ancienne réponse API et refus d'autoplay. Le point d'entrée complet du lecteur est également exécuté avec vidéo et moteur simulés pour vérifier le branchement des nouvelles règles.

Les tests v45/v46 ont reçu la dépendance de sonde média ajoutée. Le test v47 accepte la nouvelle version et inclut l'état d'attente d'un geste utilisateur. Les assertions de provenance et de secours restent vérifiées.

Le test historique `tests/tv-playback-regressions.mjs` échoue à la ligne 16 sur un ancien libellé WiTV. Le même échec a été reproduit avec les fichiers originaux v200.0.47. Ce test n'a pas été modifié pour masquer l'échec. La suite historique globale n'est pas annoncée verte.

La documentation officielle des politiques de chargement HLS a été consultée :
https://hlsjs.video-dev.org/api-docs/hls.js.loaderconfig
https://hlsjs.video-dev.org/api-docs/hls.js.retryconfig
La configuration a été vérifiée avec le fichier HLS 1.7.1 inclus dans le projet ; la bibliothèque n'a pas été remplacée.

## Limites et installation

Aucun essai prolongé des chaînes externes, de l'installation utilisateur ou de sa connexion n'a été réalisé dans cette session. Un préfixe média reçu ne prouve ni la validité de tous les segments ni le décodage de tous les codecs. Cette version ne garantit pas zéro coupure ni le retour d'un fournisseur hors ligne.

Conserver la configuration et les données de l'installation. Appliquer le ZIP et sa somme SHA-256 via la procédure de mise à jour habituelle, redémarrer Noctra, puis recharger avec Ctrl+F5 et vérifier 200.0.48. Tester les chaînes en qualité Auto. En cas de problème persistant, relever fournisseur, chaîne, serveur choisi et diagnostic `playback-progress-stalled`, sans partager d'identifiants ni d'URL signée.

L'archive distribuée ne contient ni fichier `.env` personnel, ni données d'exécution, ni identifiants de compte.
