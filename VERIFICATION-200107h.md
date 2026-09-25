# Vérification 200.0.107 — révision interface 107h « Aurora »

## Refonte graphique
Nouvelle identité visuelle complète, apportée par une couche dédiée chargée en dernier (`public/noctra-aurora.css` + `public/noctra-aurora.js`). Les arrondis existants sont conservés, voire accentués. Aucune règle de mise en page structurante, aucun moteur de lecture ni aucune logique du shell n'est modifié.

- **Fond « aurore »** : nébuleuse violet / magenta / cyan / turquoise et poussière d'étoiles fixes derrière toute l'interface (accueil, panneaux, pages Jellyfin, connexion). Sur desktop performant, l'aurore dérive très lentement.
- **Dégradé signature** lilas → rose → azur sur les titres, les sur-titres, les boutons principaux (reflet qui glisse au survol), les barres de progression et les compteurs.
- **Dock** : verre sombre avec liseré dégradé et halo, bouton actif en pastille lumineuse. Il reste entièrement statique (ni translation ni animation).
- **Accueil** : titre « À l'affiche chez vous. » en dégradé animé, affiche entourée d'un liseré lumineux et d'un **anneau de lumière en rotation** (desktop), halo ambiant sous la carte, pastille « Continuer à regarder » en verre avec point pulsant.
- **Cartes média** : halo coloré et **reflet qui suit le pointeur** au survol (desktop), texte secondaire adouci.
- **Panneaux** (Médiathèques, Demandes, TV, Téléchargements, Roulette, Automatisation) : chaque univers garde sa teinte, désormais déclinée en dégradé à trois couleurs sur le titre, le liseré d'en-tête, le bouton de fermeture (anneau conique qui pivote au survol), les onglets actifs et les blocs d'introduction. Entrée en fondu montant à l'ouverture.
- **Médiathèques** : cartes à liseré lumineux, légende en verre dépoli, élévation et reflet au survol, apparition échelonnée.
- **TV** : contours dégradés turquoise/violet autour de la navigation, du lecteur et de la liste. La chaîne active est mise en lumière. **Rien n'est posé sur la vidéo.**
- **Menu « Plus » (mobile)** : feuille en verre à liseré dégradé, icônes lumineuses et apparition échelonnée des tuiles.
- **Pages Jellyfin natives** (choix du serveur, connexion, formulaires) : titres en dégradé, boutons principaux en dégradé, champs en verre avec halo au focus.
- Barres de défilement fines et teintées, sélection de texte violette, focus clavier plus visible.

## Garde-fous de performance et de lecture
- Aucun flou, filtre ni calque animé au-dessus d'une vidéo. L'aurore est coupée en lecture (`noctra-playing`, `noctra-video-route`) et figée derrière le lecteur TV.
- Les animations continues (dérive de l'aurore, anneau de l'affiche, point pulsant, reflet du titre) sont réservées à `noctra-performance-desktop`. Elles sont suspendues onglet masqué, panneau ouvert (pour l'anneau) et désactivées avec `prefers-reduced-motion`.
- Le mobile et la tablette gardent un rendu statique : mêmes couleurs et mêmes dégradés, sans animation continue.
- Le script `noctra-aurora.js` utilise un seul écouteur `pointermove` passif, limité à une mise à jour par image, et reste inactif sur écran tactile, en lecture et en mouvement réduit. Il ne fait ni appel réseau ni accès aux données.

## Désactivation
Retirer `data-noctra-skin="aurora"` de la balise `<html>` dans `public/client/index.html` : toutes les règles Aurora sont conditionnées par cet attribut et l'interface 107g réapparaît à l'identique.

## Preuves et tests
- Nouveau test `tests/v200107h-aurora.mjs` (`npm run test:v200107h`). Il vérifie l'ordre de chargement, que chaque sélecteur est limité à l'habillage Aurora, qu'aucune règle ne cible `video`/`iframe`/`canvas` et que les animations continues sont bien gardées. Il contrôle aussi le dock statique et le script passif.
- `npm run check` et `npm run test:v200107` réussis.
- Même liste de tests réussis avant et après la refonte.
- Rendu contrôlé dans Chromium à 1440 × 900 et 390 × 844 : accueil, Médiathèques, Demandes, TV, Téléchargements, Roulette, menu « Plus » et page native de choix du serveur servie par `server.mjs`. Aucune erreur JavaScript.

## Livraison
Version client et serveur maintenue à 200.0.107. Cache de la couche Aurora : `200.107h`. Recharger avec Ctrl+F5 après mise à jour.
