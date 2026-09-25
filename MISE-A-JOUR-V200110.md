# Noctra 200.0.110 — démarrage TV plus rapide, relais partagé, dock corrigé

## Ce que montrait le diagnostic (LiveWatch · VIP · BASIC · BEIN SPORTS 1, 200.0.108)
- **Démarrage à 48,5 s.** Le premier segment a mis 20,7 s, puis un deuxième 19 s de plus avant la première image. Pour connaître le type d'un segment, Shaka interroge d'abord le relais par une requête `HEAD`. Noctra ne répondait pas à cette méthode, donc Shaka téléchargeait le **segment entier en GET uniquement pour lire son type**, puis le téléchargeait à nouveau.
- **Débit juste suffisant** (~2 Mbit/s estimés) : chaque segment se télécharge presque aussi lentement qu'il se lit. Quand le lecteur demandait un segment que la seedbox était déjà en train de précharger, ce préchargement était abandonné et le segment repris de zéro chez le fournisseur. Le temps perdu vidait la réserve, jusqu'à l'arrêt observé à 201 s.
- **Coupures de 10 s** (`code 7001`, `timedOut`) : en 108, le délai sans octet était passé à 10 s, trop court quand le relais attendait encore le fournisseur.
- **Dock** : le bouton Accueil restait marqué comme actif après une navigation Jellyfin, et restait allumé sous les panneaux (TV, etc.).

## Corrections
- **Réponse `HEAD`** sur `/api/tv/stream/…` : le type du segment (`video/mp2t`, `video/mp4`…) est annoncé tout de suite, sans aucune requête au fournisseur. Shaka ne retélécharge plus le segment au démarrage. Si le type est inconnu, Noctra répond 405 et Shaka reprend son comportement d'avant.
- **Relais partagé en direct** : un lecteur qui demande un segment en cours de préchargement reçoit immédiatement les octets déjà arrivés, puis la suite au fil de l'eau. Le fournisseur n'est plus sollicité deux fois. Dès qu'un lecteur est rattaché à un préchargement, celui-ci n'est plus coupé par son délai spéculatif. Une page d'erreur HTML n'est jamais transmise.
- **Shaka** : 15 s sans octet avant de relancer un segment (au lieu de 10 s en 108) et 12 s pour établir la connexion. La limite de 45 s pour les gros segments qui progressent est conservée. Le mode séquence, les délais du manifeste et l'ABR prudent de la 108 restent en place.
- **Dock** : l'état du bouton Accueil est recalculé à chaque changement de page. Il n'est actif que sur l'accueil et s'éteint dès qu'un panneau s'ouvre. Cette correction vient s'ajouter au style déjà corrigé en 108b.

## Validation
- Nouveau test `tests/v200110-relay-head-dock.mjs` (`npm run test:v200110`, qui inclut les tests 109 et 108). Il couvre sept cas :
  - un seul téléchargement chez le fournisseur quand un lecteur rejoint un préchargement ;
  - un segment complet transmis au-delà du délai spéculatif ;
  - le repli normal quand il n'y a pas de préchargement ou que le fournisseur ne répond pas ;
  - une page HTML jamais transmise ;
  - `HEAD` : 200 avec le bon type, 405 si le type est inconnu, 410 si le lien a expiré, sans corps de réponse ;
  - le relais qui sert un segment prêt, rejoint un préchargement ou passe par le fournisseur ;
  - la synchronisation du bouton Accueil.
- Tous les tests qui réussissaient avant réussissent encore.

## À vérifier dans le prochain diagnostic
- Démarrage : environ 20 s de moins, car il n'y a plus de double téléchargement du premier segment.
- Moins d'événements `shaka-download-failed` avec `timedOut`.
- `shaka-buffering` plus rare, et `lastSegmentAgeMs` plus bas.
