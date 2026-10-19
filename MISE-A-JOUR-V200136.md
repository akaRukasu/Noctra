# Noctra 200.0.136 — compte LiveWatch VIP dans « Accès TV »

Cette version contient aussi la 200.0.135 (voir `MISE-A-JOUR-V200135.md`).

## Symptôme
Impossible de reconnecter le compte LiveWatch VIP, ou même de le déconnecter de Noctra. Le formulaire LiveWatch n'apparaissait que sur une source LiveWatch, et seulement quand la session était refusée. Une session qui paraissait « connectée » n'avait aucun bouton.

## Correction
- **TV en direct › Accès TV** affiche maintenant une carte **LiveWatch VIP** (compte administrateur) avec :
  - l'état du compte (connecté, refusé par LiveWatch, aucun compte, ou statut indisponible) ;
  - l'e-mail et le mot de passe LiveWatch, et le bouton « Reconnecter le compte » (ou « Connecter le compte ») ;
  - le bouton **« Se déconnecter »**, même quand le compte paraît connecté ou que son statut ne peut pas être lu.
- Sur une source LiveWatch, le statut « Connecté » a un bouton **« Gérer le compte »** qui ouvre cette carte.
- Le statut LiveWatch est chargé en parallèle : Movix et Northlive restent utilisables s'il tarde.

## Validation
- Nouveau test `tests/v200136-livewatch-account-access.mjs` (`npm run test:v200136`, qui enchaîne les tests 135 à 108).
- Tous les tests qui réussissaient avant réussissent encore.
