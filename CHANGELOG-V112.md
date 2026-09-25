# Noctra Media Client — Changelog V112

## LiveWatch sur iPhone / iPad
- Corrige l'arrêt d'un direct LiveWatch qui avait déjà commencé puis tombait sur « Compatibilité iOS · essai du moteur HLS natif… ».
- Après une erreur HLS fatale sur un direct LiveWatch déjà en lecture, Noctra renouvelle **une seule fois le même direct Premium** auprès du resolver LiveWatch.
- Le cache court du resolver est invalidé uniquement pour cette reprise explicite afin d'obtenir une URL CDN/signée fraîche si nécessaire.
- Aucun changement automatique de chaîne, de serveur ou de fournisseur n'est effectué.
- Si ce renouvellement échoue, WebKit natif reste le dernier secours sur la même source.

## Plein écran TV iOS
- Le bouton plein écran devient réellement basculant lorsque le fallback viewport Noctra est actif.
- Sur iPhone/iPad, Noctra tente toujours le fullscreen vidéo natif en premier.
- Certaines versions de WebKit acceptent `webkitEnterFullscreen()` sans ouvrir réellement le plein écran : v112 vérifie maintenant le résultat et active automatiquement le plein écran viewport Noctra si l'appel natif n'a rien fait.
- Le dock est masqué pendant ce fallback afin de ne jamais intercepter les gestes au-dessus du lecteur.

## Préservation
- Responsive Demandes/fiches média v111 conservé.
- Compteur `Torrents : N` et logique de demande v110 conservés.
- WiTV, OHA, Multiview et mode Cinéma ne changent pas de serveur automatiquement.
- Archive Server Safe : aucun composant Windows exécutable ajouté.
