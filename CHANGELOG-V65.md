# Noctra v65

## Demandes Jellyseerr

- Accepte l’identifiant de serveur `0`, utilisé notamment par la première instance Radarr ou Sonarr.
- Attend que le panneau de confirmation soit réellement rendu avant d’injecter les choix de serveur, profil qualité et dossier.
- Conserve le remplacement automatique d’un ancien profil supprimé par un profil actuellement disponible.

## TV

- Le catalogue LiveWatch n’attend plus le téléchargement facultatif des logos IPTV : l’interface s’ouvre immédiatement et les logos enrichis sont mis en cache en arrière-plan.
- Une panne du fournisseur sélectionné ne masque plus WiTV, OHA et les sources personnelles.
- Ajout d’un état ergonomique pour une source vide, avec changement de source et bouton de nouvelle tentative.
- Nouvelle couche responsive dédiée aux écrans de panne et catalogues vides.

## Déploiement

- Version serveur et clients : `65.0.0`.
- Cache PWA : `noctra-shell-v65`.
- La session LiveWatch VIP demeure dans `runtime/livewatch-session.json`, hors de l’archive de mise à jour.
