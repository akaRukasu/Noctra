# Noctra Media Client v33

## Mobile

- les corrections iPhone ne dépendent plus de la classe Jellyfin `layout-mobile`, absente dans certaines PWA iOS ;
- le contenu du tiroir commence sous la barre d’état même lorsque Safari renvoie temporairement une zone sûre nulle ;
- le premier titre de l’accueil est repoussé sous l’en-tête fixe ;
- le dock disparaît pendant l’ouverture du tiroir ;
- le bouton Retour flottant en double est masqué hors lecteur ;
- toutes les variantes connues de l’index alphabétique Jellyfin sont retirées sur téléphone ;
- la largeur de la médiathèque est récupérée après suppression de cet index ;
- les carrousels et dimensions d’affiches de la v32 sont conservés.

## Écrans ultralarges

- détection automatique d’un viewport d’au moins 1800 px et d’un ratio supérieur ou égal à 2,4 ;
- interface compacte dédiée aux écrans 32:9 et similaires ;
- affiches, titres, espacements, dock et ombres réduits sans modifier un écran PC classique ;
- davantage de cartes visibles sur chaque ligne ;
- grille des médiathèques recalculée avec une largeur minimale plus faible dans ce profil ;
- `content-visibility` désactivé sur l’accueil ultralarge afin que la hauteur complète reste immédiatement défilable.

## Molette PC

- suppression de la sélection automatique d’une simple `.mainAnimatedPage` non défilable ;
- priorité au véritable ancêtre `.scrollY` ou `overflow-y: auto/scroll` ;
- aucun `preventDefault()` lorsqu’aucun conteneur vertical valide n’est trouvé ;
- repli natif du navigateur toujours disponible ;
- inertie temporelle portée à 105 ms, indépendante du taux de rafraîchissement ;
- prise en charge renforcée des petites impulsions de molette haute résolution ;
- sélection du scroller actif exposée dans `window.__noctraSmoothWheel` pour faciliter un diagnostic éventuel.

## Version

- serveur `33.0.0` ;
- cache PWA `noctra-shell-v33` ;
- ressources navigateur rechargées avec `?v=33`.
