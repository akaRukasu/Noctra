# Noctra v124

## TV — stabilité sur connexion faible

- Ajoute un profil réseau adaptatif au lecteur TV.
- Sur iPhone/iPad, Noctra utilise volontairement un profil plus conservateur car Safari iOS n’expose généralement pas l’état Wi‑Fi/4G via `navigator.connection`.
- Sur connexion faible : faible latence HLS désactivée, buffer porté jusqu’à 90 s, timeouts manifest/segments allongés, davantage de reprises réseau et démarrage ABR sur un niveau prudent avant remontée automatique de qualité.
- Le resolver LiveWatch Premium attend désormais jusqu’à 16 s la résolution du direct au lieu de l’abandonner trop vite.
- Une iframe LiveWatch lente n’est plus déclarée en erreur après 12 s : Noctra conserve le chargement et tolère 90 à 120 s sur les profils faibles/très faibles.
- L’ordre reste strict : VIP Premium direct → lecteur VIP officiel → lecteur public uniquement en secours manuel.
- OHA et WiTV ne sont pas modifiés dans leur logique de lecture.

## Téléchargements — suppression iOS

- Les boutons `Torrent uniquement` et `Torrent + fichiers` sont désormais liés directement à leur action au lieu de dépendre d’un événement délégué pouvant être perturbé par le polling qBittorrent.
- Ajoute `touch-action: manipulation` et force les événements pointeur sur la boîte de confirmation.

## Cache / version

- Version client/serveur : 124.0.0.
- Service worker et ressources PWA : cache-buster v124.
