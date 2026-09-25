# Noctra v63

## LiveWatch VIP partagé

- Ajout d’un bloc de connexion LiveWatch VIP visible uniquement par les administrateurs Noctra.
- Authentification auprès du service utilisé officiellement par LiveWatch, puis vérification du profil `role` / `is_vip` avant activation.
- Le mot de passe n’est jamais écrit sur le disque : seule la session renouvelable est conservée.
- Stockage dans `runtime/livewatch-session.json` avec permissions `0600` sur les systèmes compatibles.
- Rafraîchissement automatique du jeton avant son expiration, avec verrou partagé pour éviter plusieurs renouvellements simultanés.
- Déconnexion administrateur supprimant immédiatement la session locale.

## Accès pour les membres

- La session LiveWatch est globale à l’instance Noctra et n’est jamais envoyée aux navigateurs.
- Tous les comptes Jellyfin authentifiés bénéficient du VIP, tandis que les routes de connexion et de suppression restent protégées par le rôle administrateur.
- Le statut présenté aux membres contient uniquement l’état actif/inactif ; l’adresse email masquée reste réservée à l’administrateur.
- En l’absence de session VIP, les lecteurs publics LiveWatch de la v62 restent disponibles.

## Lecture TV

- Conversion automatique des lecteurs LiveWatch, DaddyTV, NorthTV et FrameTV reconnus en flux natifs Noctra lorsque le VIP est actif.
- Résolution côté serveur avec en-tête Bearer et marqueur VIP, puis proxy HLS Noctra sans exposition du jeton.
- Validation stricte des identifiants, types de lecteurs, hôtes et formats de flux renvoyés.
- L’en-tête d’autorisation LiveWatch n’est jamais transmis aux hébergeurs HLS tiers.
- Les playlists imbriquées et leurs segments héritent uniquement des en-têtes nécessaires.

## Interface

- Carte VIP dorée lorsque le partage est actif, avec état compréhensible pour tous les membres.
- Formulaire responsive PC, tablette et mobile pour l’administrateur.
- Action de déconnexion accompagnée d’une confirmation.

## Version et cache

- Version serveur et desktop : `63.0.0`.
- Cache PWA : `noctra-shell-v63`.
- Ressources client rechargées avec le marqueur `v=63`.
