# Noctra Media Client v82 — stabilisation TV

## Objectif

Correction ciblée de la partie TV à partir de la v81, en restaurant ce qui fonctionnait réellement sur LiveWatch v80 et en améliorant OHA sans réécrire WiTV.

## Dock utilisateur

- Suppression des derniers micro-effets souris du dock membre : aucune translation, échelle, rotation, filtre, transition ou pseudo-bulle au survol.
- Le dock mobile reste une barre sans logo, comme depuis la v81.

## Plein écran TV

- Le bouton plein écran utilise désormais en priorité l'API Fullscreen native sur le viewport du lecteur (`.noctra-tv-screen`).
- Sur iPhone/iPad avec vidéo native, `webkitEnterFullscreen()` reste prioritaire.
- La vidéo ou l'iframe occupe 100 % du viewport natif sans bordure ni rayon.
- Le pseudo-plein-écran n'est conservé qu'en dernier recours pour les iframes sur iOS qui ne peuvent pas entrer elles-mêmes en Fullscreen API.

## LiveWatch VIP

- Restauration du chemin **VIP Premium · direct** de la v80 en premier choix lorsqu'il est réellement résolu.
- Le lecteur officiel LiveWatch authentifié reste le second chemin Premium ; le lecteur public avec deux pubs reste manuel.
- Suppression du refresh forcé de session avant chaque zapping : la session n'est renouvelée que si nécessaire.
- Cache très court (45 s) du token direct pour accélérer un retour immédiat sur la même chaîne sans conserver durablement une URL éphémère.
- Catalogue LiveWatch toujours limité à `/api/v1/public/all` et aux embeds LiveWatch principaux.

## Logos TV

- Le rafraîchissement des logos LiveWatch est désormais lancé même si le catalogue contient déjà une URL de logo : une URL primaire cassée peut ainsi recevoir un vrai fallback.
- Déclenchement du rafraîchissement vers 500 ms au lieu d'attendre plusieurs secondes.
- Correspondance renforcée des noms : pays, variantes beIN/BE IN, mots « chaîne/TV », espaces et formes compactes.
- Les logos distants restent servis par le proxy/cache image Noctra et un logo secondaire puis un monogramme sont utilisés en repli.

## OHA (`oha.cx`)

- `https://oha.cx/live` reste la racine primaire.
- Le client OHA officiel reste dans le bridge Noctra afin de produire lui-même les signatures attendues par son service.
- Correction d’un blocage structurel du sandbox : les ressources OHA étaient appelées depuis une origine opaque et pouvaient perdre la session Noctra avant d’atteindre les routes `/api/tv/oha/*`. Le resolver crée maintenant un **jeton opaque aléatoire et éphémère**, limité au bridge de la chaîne ; les références stateless du catalogue ne peuvent pas activer ce bypass.
- Les scripts, sous-iframes, `fetch()` et XHR du client OHA peuvent donc atteindre le bridge sans dépendre des cookies de la PWA, tout en restant enfermés dans les seules routes OHA.
- Nouveau handoff média : Noctra inspecte également les réponses `fetch()` et XHR du résolveur OHA. Si un HLS/MPD/MP4 apparaît dans une réponse JSON ou texte avant même d'être affecté au `<video>`, il est envoyé au lecteur natif Noctra.
- Les médias détectés dans le DOM, sous-iframes ou requêtes réseau continuent également de remonter au lecteur parent.
- Cookies OHA, redirections officielles et signatures restent confinés aux hôtes OHA ; ils ne sont pas transmis aux CDN tiers.

## WiTV

- Le décodage/catalogue et le bridge WiTV serveur restent inchangés par rapport au chemin déjà fonctionnel.
- **Serveur 2 - HLS** devient le choix automatique lorsqu'il existe sur la chaîne.
- Si Serveur 2 HLS n'existe pas, Noctra choisit le premier HLS disponible, puis le premier lecteur disponible.

## Version / cache

- Version : `82.0.0`
- Cache PWA : `noctra-shell-v82`
- Partie TV : `NOCTRA · TV EN DIRECT · v82`

## Vérifications

- `npm run check`
- `npm test`
- tests dock utilisateur sans hover
- Fullscreen API natif
- LiveWatch VIP direct + bridge officiel
- logos LiveWatch
- OHA fetch/XHR/media handoff
- WiTV Serveur 2 HLS par défaut
- tests relancés après extraction du ZIP final
