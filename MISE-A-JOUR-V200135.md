# Noctra 200.0.135 — session LiveWatch de l'ancien site

Cette version contient aussi toutes les corrections des 200.0.133 et 200.0.134 (voir `MISE-A-JOUR-V200133.md` et `MISE-A-JOUR-V200134.md`).

## Symptôme
Dans Noctra, les chaînes LiveWatch affichent « Chaîne introuvable » et les serveurs directs (« VIP · CABLE »…) échouent. La même chaîne fonctionne quand on l'ouvre directement dans un navigateur sur livewatch.icu.

## Cause probable
Le compte LiveWatch VIP enregistré dans Noctra a été connecté sur l'ancien site (livewatch.top). Son jeton de session a été délivré par l'ancien serveur de comptes. Si le nouveau site utilise un autre serveur de comptes, il refuse ce jeton : Noctra se croit connecté, mais le site ne reconnaît pas la session.

## Correction
- Noctra lit l'émetteur du jeton de session (champ `iss`) et le compare au serveur de comptes annoncé par livewatch.icu.
- S'ils diffèrent, la session n'est plus utilisée : la page TV indique que la session vient de l'ancien site et propose « Reconnecter le compte LiveWatch ».
- Il suffit de saisir à nouveau l'e-mail et le mot de passe LiveWatch dans TV en direct › Accès TV, même si le compte apparaît « connecté ».
- Si le site ne peut pas être joint, la session n'est pas remise en cause (aucune déconnexion à tort).

## Diagnostic
`/api/tv/livewatch/diagnostics` (compte administrateur) indique `otherSite`, l'hôte qui a délivré la session (`sessionIssuer`) et celui du site (`siteAuthHost`).

## Validation
- Nouveau test `tests/v200135-livewatch-session-site.mjs` (`npm run test:v200135`, qui enchaîne les tests 134 à 108).
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé avec le vrai site (injoignable d'ici).
