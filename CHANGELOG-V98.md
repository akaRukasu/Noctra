# Noctra v98 — Cinema & Multiview 2–25

## TV

- Cœur de lecture TV conservé : aucune modification des fonctions critiques v94 restaurées en v97.
- Multiview activable dès 2 chaînes, jusqu’à 25 chaînes sélectionnées.
- Grille dynamique desktop : 2 colonnes pour 2–4 flux, puis 3×3, 4×4 et jusqu’à 5×5 selon le nombre de chaînes.
- Mobile portrait : grille plus lisible et scrollable ; paysage : grille dynamique jusqu’à 5 colonnes.
- Démarrage des flux Multiview échelonné pour éviter une rafale de 25 connexions dans la même frame.
- Compteur de sélection visible sur le bouton d’outils et message explicite dès que 2 chaînes sont prêtes.
- Bouton pour vider la sélection Multiview.
- Mode Cinéma réécrit comme un toggle déterministe : normal ↔ grand lecteur. Il ne réduit plus le lecteur et ne masque plus le navigateur de chaînes sur mobile.
- Après activation/désactivation Cinéma, le menu se ferme proprement pour éviter une surcouche résiduelle au-dessus du lecteur.
- Mode Cinéma purement CSS : aucun arrêt, redémarrage ou changement du flux principal.

## Compatibilité

- LiveWatch, OHA et WiTV utilisent toujours le pipeline de lecture restauré/validé précédemment.
- Multiview accepte uniquement les options HLS/directes et ne modifie jamais le lecteur TV principal.
