# Noctra 200.0.130 — tous les serveurs de chaque source au clic sur une chaîne

Cette version contient aussi toutes les corrections de la 200.0.129 (voir `MISE-A-JOUR-V200129.md`).

## Symptôme
Au clic sur une chaîne de « Toutes les chaînes », tous les serveurs des sources n'apparaissaient pas : une seule ligne par source.

## Cause
Une source « automatique » (LiveWatch VIP, OHA, WiTV…) ne donne ses serveurs (Serveur 1, Serveur 2, VIP, lecteur officiel…) qu'une fois interrogée. Noctra ne l'interrogeait qu'au lancement : ses serveurs n'apparaissaient qu'ensuite, dans une seconde barre, et seulement pour la source lancée.

## Correction (comme sur Noctra TV)
- Au clic, toutes les sources « automatiques » de la chaîne sont interrogées en même temps. Chacune est remplacée dans la liste par **tous ses serveurs**, préfixés du nom de la source : « LiveWatch · VIP · Serveur 2 », « OHA · Serveur 3 »…
- La liste s'ouvre sans attendre plus de 2,5 s. Une source plus lente est ajoutée à son arrivée, et ses serveurs sont testés à leur tour.
- Tous ces serveurs sont testés (12 au plus, 6 à la fois) et classés ensemble : vérifiés en ligne et rapides d'abord, pages web ensuite, secours manuel en dernier.
- Un même flux proposé par deux sources n'apparaît qu'une fois.
- Le **secours manuel** (lecteur public avec publicités) reste proposé mais n'est jamais lancé automatiquement, ni en relais.
- Le serveur lancé est exactement celui de la liste. Les autres serveurs de sa source restent ses secours internes (reconnexion).
- La seconde barre de serveurs disparaît : tout est dans la liste « Serveurs ».

## Validation
- Nouveau test `tests/v200130-tv-all-servers.mjs` (`npm run test:v200130`, qui enchaîne les tests 129 à 108).
- Banc d'essai Chromium avec le vrai code : TF1 issue de 5 sources affiche 8 serveurs. On y voit les 4 de la source automatique (dont son secours manuel), puis ceux d'une source répondant après 4 s, ajoutés et testés à leur arrivée. Le serveur vérifié le mieux classé démarre.
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé sur le vrai serveur (sources TV injoignables d'ici).
