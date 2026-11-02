# Noctra 200.0.165 / 200.0.166 — « Cannot allocate Wasm memory » corrigé, serveurs TV refusés expliqués

## 200.0.166 — serveurs TV en erreur (401 / 403)

Les serveurs Vavoo (403), LiveWatch VIP et NorthTV VIP (401) n'affichaient que « accès refusé ». Le serveur Noctra précise maintenant la cause, et les applis iOS 2.18.10 et Android 1.9.15 l'affichent dans la liste des serveurs :
- « Movix refuse ce flux au serveur Noctra (403) : refus du fournisseur » : le fournisseur refuse la seedbox. Ce n'est pas une panne de Noctra : essayez un autre serveur.
- Pour LiveWatch VIP : le message de Noctra (aucun compte VIP connecté, session de l'ancien site à reconnecter…). Il se règle dans TV en direct › Accès TV.

Le diagnostic de l'updater PC indique si le compte LiveWatch VIP et les accès Movix / Northlive sont enregistrés (présence seulement, aucune clé affichée), et si la seedbox joint Movix, LiveWatch et Northlive.


Serveur seulement : les applis (Noctra TV 1.1.61, Android 1.9.14, iOS 2.18.9) ne changent pas. Toutes les nouveautés de [200.0.164](MISE-A-JOUR-V200164.md) sont incluses.

## Le problème

Le diagnostic affichait :

```
Noctra : connexion Jellyfin impossible. TypeError WebAssembly.Instance(): Out of memory: Cannot allocate Wasm memory for new instance
```

Les requêtes de Node.js (`fetch`) passent par un analyseur HTTP écrit en WebAssembly. Par défaut, V8 réserve une très grande zone de mémoire virtuelle pour chaque instance WebAssembly. La mémoire virtuelle du service Ultra.cc est limitée, donc cette réservation échoue. Noctra ne joint alors plus Jellyfin et toutes les pages affichent « fetch failed ».

Le réglage `NODE_OPTIONS=--disable-wasm-trap-handler` corrige le problème, mais il se trouvait dans le service lui-même. La réparation de l'updater PC recréait le service avec `install-ultra.sh` de la version déjà installée sur le serveur. Celle de la 200.0.162 n'avait pas encore ce réglage, d'où sa disparition.

## La correction

1. **Noctra se relance seul avec le réglage** s'il manque (`lib/wasm-memory-guard.mjs`, chargé en premier par `server.mjs`). Cela ne dépend plus de la configuration du service. L'arrêt du service arrête bien Noctra. Avec une version de Node.js qui ne connaît pas ce réglage, le lancement reste normal.
2. **La mise à jour (`noctra-update`) et l'updater PC (mise à jour et réparation) ajoutent le réglage au service** :
   - dans un fichier complémentaire `~/.config/systemd/user/noctra.service.d/noctra-memoire-wasm.conf`, sans réécrire le service ;
   - si le service a déjà un `NODE_OPTIONS`, le réglage y est ajouté et une copie est gardée (`.avant-wasm`).
3. **Le diagnostic** indique si le réglage est présent. Si l'erreur apparaît dans les derniers messages, il la signale avec la marche à suivre.

## Vérifié ici

Test `tests/v200165-wasm-memory-guard.mjs`. La mémoire virtuelle est limitée à 10 Go avec `ulimit -v`, et un Jellyfin est simulé. Le test vérifie que :
- sans la garde, l'erreur « Cannot allocate Wasm memory » est reproduite ;
- avec la garde, la session Jellyfin est validée par le vrai serveur Noctra ;
- `SIGTERM` arrête le lanceur et Noctra ;
- l'ajout au service fonctionne dans trois cas : service simple, `NODE_OPTIONS` déjà présent, réglage déjà là. Un deuxième passage ne change rien.

Pas vérifié sur la seedbox elle-même : elle n'est pas joignable depuis cet environnement.

## Mise à jour (données gardées)

- **Le plus simple** : mettre `noctra-media-client-v200.0.165.zip` dans Téléchargements, puis lancer `LANCER-MISE-A-JOUR-NOCTRA-V8.cmd` (nouvel updater). `.env`, `runtime/`, comptes, historique et médias sont gardés, et une sauvegarde complète est faite avant le remplacement.
- **Sans mettre à jour** : `REPARER-NOCTRA-V8.cmd` (nouvel updater) ajoute le réglage au service et redémarre Noctra.
- **À la main**, sur la seedbox :
  ```
  mkdir -p ~/.config/systemd/user/noctra.service.d
  printf '[Service]\nEnvironment=NODE_OPTIONS=--disable-wasm-trap-handler\n' > ~/.config/systemd/user/noctra.service.d/noctra-memoire-wasm.conf
  systemctl --user daemon-reload && systemctl --user restart noctra.service
  ```
