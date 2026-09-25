# Noctra 200.0.47 — provenance et échecs de lecture

## Ce qui est corrigé

WiTV ne change plus automatiquement de fournisseur : premier HLS WiTV vérifié, puis lecteur officiel WiTV si nécessaire. FSTV et LiveWatch restent des choix manuels. Si aucune option propre n'existe, Noctra le signale sans déclencher un secours externe.

OHA ne lance plus automatiquement le lecteur web après une résolution native échouée. Un serveur explicitement choisi qui échoue retourne une erreur, pas le même bridge à nouveau. L'absence de première image est bornée à 36 secondes par tentative native OHA/WiTV ; une résolution réseau préalable peut s'ajouter à ce délai. Les autres options natives non essayées restent prioritaires. Cela borne les boucles, mais ne répare pas un média absent chez le fournisseur.

## Vérification sur les sites réels

Le 4 septembre 2026, depuis le navigateur de test :

- WiTV : page Canal+ Foot et lecteur public PlayerJS id=1 examinés ; vidéo à readyState 4, temps média observé à 23,4 secondes. Le lecteur était ensuite en pause. Ce test prouve la réception de vidéo sur ce lecteur à cet instant, pas une stabilité prolongée ni le fonctionnement en iframe dans chaque installation Noctra.
- Kool : sélection du pays France, puis BEIN SPORTS 1 .b. La route `/watch?live=38449168821b069f8d9798` s'est ouverte mais le lecteur officiel a affiché « There was an error » avec un message de média non chargé. Une capture d'erreur ne permet pas de distinguer définitivement serveur, réseau et codec.
- Le contrôle HLS direct depuis le serveur de travail n'a pas pu aboutir : le suivi de la requête a signalé une autorisation réseau annulée. Aucune validation serveur-vers-CDN ni contournement réseau n'est revendiqué.

Aucun compte VIP, identifiant personnel ou paramètre privé n'a été nécessaire à ces observations.

## Tests locaux exécutés

```sh
node --check server.mjs
node --check public/noctra-shell.js
node tests/v200047-provider-boundaries.mjs
node tests/v200046-witv-oha-startup.mjs
node tests/v200045-media-resilience.mjs
node tests/tv-native-resolvers.mjs
node tests/request-quality.mjs
node tests/library-grid-balance.mjs
```

Les tests v47 exécutent les fonctions de production sur des réponses simulées : échec HTTP de page, absence d'URL HLS, erreur HLS, diagnostic sans URL privée, refus de boucle OHA vers le bridge, conservation du bridge en manuel, arrêt du lecteur au délai de démarrage. Les tests v45/v46 conservent les vérifications du relais HLS, des sondes concurrentes et de StreamSports ; leurs assertions concernées ont été adaptées à la nouvelle politique de secours. La suite historique globale n'est pas annoncée comme intégralement verte.

## Mise à jour et retour utile

Sauvegarder l'installation, conserver configuration et données, appliquer l'archive par la procédure habituelle, redémarrer Noctra puis Ctrl+F5. Vérifier la version 200.0.47.

Si le HLS WiTV échoue encore, relever la chaîne exacte et l'événement de diagnostic `witv-native-unavailable` (étape et statut HTTP), sans communiquer d'URL signée ni d'identifiants. Pour OHA, comparer la même variante sur le site officiel et dans Noctra au même moment. Cette livraison corrige les choix et les attentes ; elle ne garantit pas la disponibilité de tous les médias ni zéro coupure.
