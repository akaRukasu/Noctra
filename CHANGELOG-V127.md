# Noctra v127

## Demandes et Discovery

- Affichage immédiat de la structure, du quota, des onglets et de la recherche pendant le calcul des suggestions.
- Cartes TMDB allégées avec images responsives, priorité explicite du meilleur match et rendu différé des sections hors écran.
- Rails mobiles bornés à la largeur du panneau, sans débordement horizontal du contenu principal.
- États Prowlarr plus lisibles et cartes harmonisées sur mobile et desktop.

## Fiche média

- Métadonnées et disponibilité Prowlarr lancées en parallèle sans modifier la réponse fonctionnelle.
- Cache client court pour les fiches récemment ouvertes.
- Squelette contextualisé avec titre et visuel pendant le chargement.
- Zone d'actions indépendante du synopsis pour conserver des boutons complets à 320 px.
- Grilles dédiées aux formats desktop, tablette, 390 px et 320 px.

## Compatibilité

- Aucun changement des routes de demande, des commandes Sonarr/Radarr, des liens externes ou du lecteur.
- Cache PWA renouvelé en `noctra-shell-v127`.
