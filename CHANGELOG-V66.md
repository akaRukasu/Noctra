# Noctra v66

## Correctif critique TV

- Corrige la collision entre `data-tv-mobile-view` sur le shell et sur les boutons de vue. Dans la v65, cette collision interceptait tous les clics à l’intérieur d’un catalogue déjà affiché.
- Les chaînes, fournisseurs, onglets Sports, recherche, zapping, serveurs, plein écran et actions LiveWatch redeviennent cliquables.
- Ajout d’un numéro de séquence empêchant une réponse distante tardive de remplacer la source ouverte entre-temps.

## Refonte des sous-menus

- Navigation TV persistante à deux niveaux : univers puis fournisseurs.
- États cohérents pour le chargement, les catalogues vides et les erreurs de fournisseur.
- Refonte responsive complète des cartes, filtres, lecteur, formulaires et panneaux LiveWatch sur PC, tablette et mobile.

## Logos et lecture

- Références de logos stables et stateless, valables après un redémarrage du serveur.
- Cache local des images valides dans `runtime/tv-logo-cache` et cache navigateur étendu.
- Bascule contrôlée entre logo principal, logo secondaire et monogramme local.
- Enrichissement iptv-org court au premier affichage puis actualisation visuelle en arrière-plan.
- HLS.js 1.6.16 livré localement dans `public/vendor/` et ajouté au cache PWA.

## Déploiement

- Version serveur et clients : `66.0.0`.
- Cache PWA : `noctra-shell-v66`.
- La session LiveWatch VIP existante reste dans `runtime/livewatch-session.json`, hors de l’archive.
