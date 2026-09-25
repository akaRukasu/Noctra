# Noctra 200.0.75

Corrections :
- Multiview : grille ajustée à la hauteur disponible sur PC/tablette/paysage ; défilement lisible sur mobile portrait. Lecteurs et connexions conservés.
- Mode cinéma : navigation superposée supprimée ; largeur contrainte sur tablette.
- Carrousels : correction de la duplication des premières affiches lorsque Jellyfin finit son rendu pendant la requête suivante.
- Médiathèques : images entières avec proportions conservées, informations sous l’image.
- Automatisation : navigation secondaire compacte, boutons adaptés au tactile.
- Utilisateurs : bouton de création libellé et aligné avec le titre.
- Analyse : conservation de la barre de progression entre les relevés, pour éviter sa reconstruction à chaque rafraîchissement. La durée du scan serveur reste inchangée.

Vérifications : tests de régression test:v200075 réussis. Mise en page locale avec les styles livrés vérifiée en 390×844, 820×1180, 844×390 et 1920×1080 ; Multiview à 4, 9 et 25 cases. Défaut de duplication reproduit sur l’accueil réel Chrome, correction couverte par un test de rendu tardif. Pas de test sur iPhone physique ; pas de test d’endurance de 25 flux simultanés.

Diagnostic TV détaillé dans DIAGNOSTIC-TV-V200075.md. Réception conservée après diagnostic, sans modification spéculative des réglages.

Archive à installer selon la procédure habituelle en conservant votre configuration et vos données. Aucun déploiement distant effectué par cet assistant.
