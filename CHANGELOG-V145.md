# Noctra V145

## TV en direct

- Démarre le premier segment desktop au niveau le plus léger, puis laisse l’ABR augmenter automatiquement la qualité.
- Maintient la lecture à vitesse réelle `1×` et retire le rattrapage accéléré à `1,08×`.
- Rapproche le profil desktop du comportement natif iOS avec une tête de direct à un segment et un tampon plus court.
- Laisse HLS.js gérer les attentes brèves ; Noctra ne rejoint automatiquement la tête du direct qu’après un blocage prolongé avec plus de 24 secondes de retard.
- Précharge HLS.js en parallèle du résolveur distant pour réduire le délai du premier direct de la session.

## Diagnostic

- Mesure localement la résolution, le manifeste, le premier segment, les métadonnées, l’état `canplay` et la première image.
- Affiche les durées dans le panneau de diagnostic TV sans conserver d’URL, de cookie, de jeton ou d’en-tête d’autorisation.
- Conserve les chemins natifs iPhone/iPad et le profil mobile existant.

## Validation

- Ajoute des contrôles dédiés au profil desktop, à la stabilité `1×`, au seuil de reprise et à la confidentialité du diagnostic.
