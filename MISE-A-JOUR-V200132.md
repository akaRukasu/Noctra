# Noctra 200.0.132 — LiveWatch sur livewatch.icu, Alternative mise à jour

Cette version contient aussi toutes les corrections de la 200.0.131 (voir `MISE-A-JOUR-V200131.md`).

## LiveWatch et ses dérivés
LiveWatch a quitté `livewatch.top` pour `https://livewatch.icu/`. Toutes les sources LiveWatch utilisent le nouveau domaine : LiveWatch, NorthTV, FrameTV, Daddy TV, Sports, Football Live, BossTV, JackTV, Matchs du jour.
- Le domaine est défini à un seul endroit. Au prochain changement, il suffira de régler `LIVEWATCH_ORIGIN=https://nouveau-domaine` dans le `.env` du serveur, sans nouvelle version.
- L'ancien domaine reste reconnu. Un lien `livewatch.top` encore en mémoire, dans un cache ou renvoyé par l'API est réécrit vers `livewatch.icu` avant toute requête, côté serveur comme dans le navigateur.
- Le catalogue LiveWatch gardé sur le disque du serveur, enregistré avec l'ancien domaine, est ignoré et téléchargé à nouveau.
- La session VIP (connexion Supabase) ne change pas.

## Alternative (page Haloule, mise à jour du 10/10/26)
Noctra relit la page Haloule lui-même (toutes les 5 minutes) : les nouvelles adresses de toutes les chaînes sont reprises automatiquement. Les chaînes nouvellement publiées sont maintenant acceptées :
- L'Equipe TV ;
- TF1 ;
- ESPN FR by DISNEY, avec ou sans « + » dans le lien.

## Validation
- Nouveau test `tests/v200132-livewatch-domain.mjs` (`npm run test:v200132`, qui enchaîne les tests 131 à 108) :
  - plus aucune adresse `livewatch.top` dans le serveur ;
  - réécriture de l'ancien domaine ;
  - domaine réglable par `LIVEWATCH_ORIGIN` ;
  - liste des chaînes Haloule acceptées.
- Le test LiveWatch VIP couvre aussi le nouveau domaine.
- Tous les tests qui réussissaient avant réussissent encore.
- **Non testé en réel** : `livewatch.icu` et la page Haloule ne sont pas joignables depuis l'environnement de développement. L'API LiveWatch est supposée garder les mêmes chemins (`/api/v1/public/…`).
