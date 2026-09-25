# Noctra 200.107b — finition graphique et microcoupures

Base : fichiers public/lib/tests/server/package récupérés sur le serveur en 200.0.107 le 22 septembre 2026. Corrections de reprise par utilisateur conservées. Aucun changement serveur nécessaire.

Graphisme : couche CSS dédiée pour surfaces, hiérarchie des textes, cartes d’accueil, actions, sélection de chaîne, zapping et menu de préférences. Effets sans animation permanente. Liste de zapping en une colonne aux tailles intermédiaires. Focus clavier visible et réduction des mouvements respectée.

TV : adaptation Shaka partagée entre lecteur simple et chaque tuile multiview. Deux pénuries de tampon de 250 ms ou plus dans 90 s augmentent la réserve de reprise, plafonnée à 12 s. Les événements inférieurs à 250 ms, démarrage, pauses et recherches dans la vidéo ne sont pas comptés. Le réglage change après la reprise, jamais pendant la coupure en cours. Objectifs de démarrage inchangés (3 s simple, 4 s multiview). Aucun changement automatique de moteur ajouté. Cette mesure peut allonger une reprise ultérieure pour éviter les arrêts répétés ; elle ne répare pas un serveur de diffusion indisponible.

Contrôles : syntaxe du shell ; tv-shaka, tv-shaka-multiview, tv-shaka-microstalls, tv-server-choice, tv-mobile-idle, v200107-resume-user-dock passent. Fixtures navigateur des menus : 10 cas réussis (2 pages × 320×568, 390×844, 430×932, 744×1133 et 740×390). Aperçu TV bureau/mobile inspecté. Lecture HLS réelle avec le moteur local Shaka 5.2.10 sur le média de démonstration public Angel One : progression vidéo, readyState 4, zéro frame perdue et aucune erreur pendant l’observation courte. Ce test VOD ne mesure pas la stabilité des fournisseurs live. Pas de session fournisseur authentifiée disponible ni de test iPhone physique pour cette livraison.

Documentation de configuration consultée : https://shaka-project.github.io/shaka-player/docs/api/tutorial-network-and-buffering-config.html
