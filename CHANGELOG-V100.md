# Noctra v100 — Workspaces, Multiview & Discovery Live

## TV / outils

- Suppression du numéro de version dans le bandeau visible `NOCTRA · TV EN DIRECT`.
- Bouton Outils TV monté directement sur la surface du lecteur, avec gestion directe `pointerdown`/`click` en capture pour éviter les clics absorbés par une vidéo/iframe.
- Réduction du travail du MutationObserver TV : il ne remonte plus constamment les extras si ceux-ci sont déjà présents.
- Le fullscreen déclenché par Noctra masque désormais le badge `NOCTRA LIVE`, le HUD d’état et le bouton Outils, comme le fullscreen natif du lecteur.

## Multiview

- De 2 à 25 flux, grille dynamique jusqu’à 5 × 5.
- Nouveau plein écran du mur Multiview complet, avec fallback WebKit/iOS.
- Multiview présenté comme un workspace quasi plein écran ; le dock Noctra reste au premier plan hors fullscreen.
- Correction de la grande zone vide en mode 2 flux : les cases remplissent maintenant réellement la scène disponible sur desktop/tablette.
- Le lecteur TV principal est suspendu pendant le Multiview afin d’éviter un troisième téléchargement caché avec 2 cases (ou un flux de plus avec N cases). Il n’est pas détruit et reprend ensuite sur le même flux.
- HLS.js secondaire : low-latency désactivée, buffers dynamiques selon le nombre de flux, prébuffer avant lecture, timeouts plus tolérants et reprise du même flux uniquement.
- `Auto stable` réduit automatiquement le plafond de qualité après des stalls répétés.
- L’autoplay du markup ne peut plus court-circuiter le prébuffer HLS.js : la lecture commence explicitement lorsque la marge est suffisante.
- Démarrage des flux échelonné afin de limiter les pics réseau/CPU.
- Aucun changement automatique de fournisseur ou de serveur n’est ajouté.

## Workspaces / fluidité

- TV, Demandes, Discovery, Téléchargements, Automatisation, Fichiers et panneaux larges utilisent un layout de workspace quasi plein écran sur desktop.
- Dock au premier plan au-dessus des workspaces et du Multiview.
- Conservation de la virtualisation TV, du `content-visibility`, de l’isolation layout/paint et des optimisations DOM des versions précédentes.

## Discovery / Demandes

- Nouveau bouton `Torrents live` sur les suggestions.
- Recherche Prowlarr à la demande, sans obligation de créer une demande Jellyseerr.
- Affichage jusqu’à 24 releases actuelles avec tracker, seeders, taille, âge et protocole.
- Actualisation manuelle et auto-actualisation toutes les 45 secondes tant que la fenêtre est ouverte.
- Le clic `Torrents live` force une vérification fraîche ; les badges de disponibilité habituels continuent à profiter du cache pour préserver les performances.
- Une disponibilité Prowlarr déjà vérifiée devient ensuite un signal léger du ranking personnalisé (sans nouvelle requête réseau pendant le calcul des suggestions).
- Prise en charge de `PROWLARR_INTERNAL_URL` ou `PROWLARR_URL` pour cette vérification.

## Sécurité / packaging

- Édition Server Safe : aucun `.exe`, `.dll`, `.vbs`, `.bat`, `.cmd` ou `.ps1`.
- Version client/serveur/PWA : `101.0.0` / `noctra-shell-v101`.
