# Noctra 200.0.114 — fluidité, fiches films et séries, transitions

## Fluidité
- **Lumière ambiante de l'accueil** : le flou est désormais calculé sur une image quatre fois plus petite, puis agrandie. Le rendu est le même, avec 16 fois moins de pixels à traiter à chaque changement d'affiche.
- **Écrans tactiles** : il n'y a plus de flou d'arrière-plan pendant le défilement (légendes des médiathèques, pastille de l'affiche), et les grandes ombres sont allégées.
- **Rangées de l'accueil isolées** : quand une rangée se met à jour, le navigateur ne recalcule plus toute la page.

## Médiathèques sur mobile
Les noms longs comme « Films d'animation » tiennent désormais dans l'encart :
- le titre est plus petit sur les petits écrans et peut passer sur deux lignes, sans couper un mot en plein milieu ;
- le libellé « Explorer » laisse sa place au titre, seule la flèche reste ;
- les marges intérieures sont réduites.

## Fiches films et séries
L'apparence change, la mise en page d'origine est conservée.
- **Arrière-plan cinéma** : fondu progressif vers la page, vignettage et légère teinte Aurora.
- **Affiche** : coins arrondis, liseré lumineux et ombre portée profonde.
- **Informations en pastilles** : année, durée, heure de fin… La note est en or, la note critique en vert, la classification en rose.
- **Boutons d'action** : en verre, avec un halo et une légère élévation au survol. Le bouton « Lecture » est en dégradé Aurora.
- **Accroche** : en dégradé, avec la police de titre Sora.
- **Résumé** : dans un encart en verre, avec un liseré d'accent.
- **Réalisateur, genres, etc.** : libellés en petites capitales espacées.
- **Partie basse** (saisons, épisodes, distribution) : un panneau en verre arrondi remplace le bloc plein. Les titres de section ont une barre lumineuse.
- **Épisodes** : lignes en verre, vignettes arrondies et halo au survol.
- **Distribution** : portraits ronds.

## Transitions
- **Changement de page** : chaque page Jellyfin (fiche, médiathèque, recherche…) apparaît en fondu avec un léger glissement.
- **Ouverture d'une fiche** : l'arrière-plan se dévoile, puis l'affiche arrive avec une légère perspective, suivie en cascade du titre, des informations, des boutons et du résumé.
- Ces animations ne se jouent qu'une fois par affichage. Elles sont coupées pendant la lecture, sur les pages vidéo et quand « réduire les animations » est activé. Le dock et la vidéo ne sont pas concernés.

## Validation
- Nouveau test `tests/v200114-detail-fluidity.mjs` (`npm run test:v200114`, qui inclut les versions 108 à 113).
- Rendu vérifié sur une maquette de fiche construite avec le vrai gabarit Jellyfin et toutes les feuilles de style Noctra, ainsi que sur les médiathèques à 390 et 360 px de large.
- Tous les tests qui passaient avant passent encore.
