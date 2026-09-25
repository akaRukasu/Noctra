# Noctra 200.0.78 — TV et sources

- Démarrage HLS : réserve initiale de 4 à 6 secondes de média sur une connexion normale, 6 à 8 secondes en réseau faible, adaptée à la fenêtre réellement disponible. Il s'agit de secondes de vidéo en mémoire, pas d'un délai de lancement garanti. La réserve de continuité pendant la lecture reste distincte.
- OHA / Kool : ajout des adresses 178.83.5.50 et vavoo.top ; essais de miroirs échelonnés, délai total borné, annulation des requêtes perdantes et mémorisation temporaire du miroir qui a répondu.
- Streamed : résolution des lecteurs seulement au clic, conservation des variantes et miroir PK/ST. L'ouverture du catalogue ne déclenche plus une requête par lecteur de chaque événement.
- Volkamax : BZH-Sport prioritaire, ancien domaine disponible en secours.
- Movix : entrée « Tous les bouquets » issue du manifeste, y compris les familles non présentes dans les raccourcis historiques. IPTV VIP conserve son accès configuré.
- Sports : DaddyLive et BrigitteTV ajoutés. DaddyLive utilise ses pages de lecture publiées. BrigitteTV tente les liens d'événements publiés et propose le portail si le programme ne peut pas être analysé.
- Mes sources : Xtemus ajouté comme portail, sans prétendre convertir son interface web en playlist M3U. Accès externe disponible.
- Sources : sélecteur repliable, recherche des fournisseurs, grille adaptable, focus clavier. Une iframe chargée n'est pas annoncée comme une lecture vérifiée pour les nouvelles intégrations et Streamed.

## Validation

`npm run test:v200078` : sept suites ciblées (démarrage, reprises, transport, frontières des fournisseurs, miroirs, catalogues, accès et authentification Jellyfin).

`npm run check` : validation de syntaxe du serveur et du client.

`npm run audit:tv` : contrôle HTTP à lancer depuis l'hôte Noctra ; ne certifie pas la lecture vidéo.

Lire `VERIFICATION-TV-V200078.md` pour les observations et les limites des essais distants.
