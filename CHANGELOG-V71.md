# Noctra v71 — TV résiliente et dock statique

## Dock

- Suppression des animations de déplacement/transition au survol sur PC.
- Le survol conserve seulement un retour visuel statique ; aucun bouton ni logo ne se décale.
- Conservation de la capsule unique et du logo sans double bulle introduits en v70.

## LiveWatch

- Le lecteur `embed_url` officiel est de nouveau le chemin de lecture par défaut, conformément à l'API publique LiveWatch.
- Le pont VIP ne remplace plus automatiquement une iframe qui vient de charger.
- Lorsque le compte VIP partagé est actif, deux choix sont proposés : **Lecteur officiel** et **VIP Premium**.
- Le choix VIP utilise toujours le résolveur serveur et la validation HLS complète, mais seulement à la demande.
- Le résolveur générique accepte désormais directement une réponse `{ streamUrl }`, nécessaire au serveur VIP LiveWatch.

## OHA

- Domaine intégré actualisé vers `https://oha.to/live`, tout en gardant la compatibilité avec l'ancien domaine `oha.cx`.
- Le domaine effectif après redirection est conservé pour les appels de résolution et le lecteur de secours.
- Les références des chaînes OHA sont maintenant **stateless** : elles ne dépendent plus de la `Map` mémoire du processus Node.
- Une chaîne ne devient donc plus inutilisable après un redémarrage/rechargement du serveur avec le message « Cette chaîne OHA a expiré ».
- Le lecteur natif multi-serveurs et le fallback web restent disponibles.

## WiTV

- Les références de pages et de lecteurs WiTV sont maintenant stateless et survivent aux redémarrages du processus.
- Le lecteur WiTV officiel préparé côté Noctra est privilégié à la place d'un HLS direct dépendant du CORS/CDN du moment.
- Les autres serveurs détectés sur la page WiTV restent disponibles dans le sélecteur.

## Résilience générale TV

- Les erreurs HTTP de l'API transportent désormais leur statut côté client.
- Si une ancienne référence de lecteur renvoie encore `410`, Noctra rafraîchit automatiquement le catalogue et retente la même chaîne une fois.
- `BASE_URL=/noctra` reste pris en charge sans double préfixage.

## Version

- Serveur / shell / manifeste : `71.0.0`.
- Cache PWA : `noctra-shell-v71`.
