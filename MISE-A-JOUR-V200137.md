# Noctra 200.0.137 — LiveWatch relayé : comptes, requêtes refusées, diagnostic ; bascule de serveur patiente

Cette version contient aussi les 200.0.135 et 200.0.136.

## Symptômes
- LiveWatch et ses dérivés : « Chaîne introuvable », dans le lecteur VIP comme dans le lecteur public avec publicités, même après avoir reconnecté le compte. Le lien direct fonctionne dans le navigateur.
- Chaînes réunies : sur un chargement long, Noctra passe trop vite au serveur suivant.

## LiveWatch
Le site lui-même n'est pas joignable d'ici. Ces corrections couvrent les causes probables, et le diagnostic dira laquelle est la bonne.
- **Serveur de comptes.** Noctra cherchait le serveur de comptes du site sous la seule forme `xxx.supabase.co`. Si livewatch.icu sert ses comptes depuis son propre domaine, Noctra retombait sur l'ancien serveur. La session, même reconnectée, était alors refusée par le site, d'où « Chaîne introuvable ». Désormais :
  - Noctra retient l'adresse écrite juste avant la clé publique dans le code du site, puis celle déduite de la clé elle-même ;
  - chaque paire adresse/clé est vérifiée auprès du serveur de comptes avant d'être retenue.
- **Ancienne session (200.0.135).** Le message « session de l'ancien site » n'est plus affiché quand Noctra n'a pas pu lire la configuration du site.
- **Référent masqué.** Le lecteur LiveWatch est ouvert sans référent, comme un lien direct. Le lecteur relayé ne voit plus non plus l'adresse de Noctra. Le nouveau site peut filtrer les sites qui l'intègrent.
- **Requêtes refusées signalées.** Le lecteur relayé signale les requêtes refusées par le site (hôte, chemin, code HTTP) et l'écran « Chaîne introuvable ». Le statut du lecteur les affiche, puis Noctra passe au lecteur public.
- **« Tester LiveWatch »** dans TV en direct › Accès TV affiche en clair :
  - le serveur de comptes utilisé et d'où il vient ;
  - qui a émis la session ;
  - le résultat du lecteur de test et du flux direct ;
  - les hôtes du site ;
  - les dernières requêtes refusées dans le lecteur relayé.

## Bascule de serveur (chaînes réunies)
- Premier contrôle à 45 s au lieu de 35 s.
- Tant que la vidéo continue d'arriver, Noctra patiente 15 s de plus, jusqu'à 2 minutes au total.
- Après une erreur passagère, le fournisseur dispose de 8 s pour se reprendre avant le changement de serveur (2,5 s avant), et de 12 s si la lecture avait démarré (6 s avant).

## Validation
- Nouveau test `tests/v200137-livewatch-relay-switch.mjs` (`npm run test:v200137`, qui enchaîne les tests 136 à 108).
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé avec le vrai site (injoignable d'ici).
