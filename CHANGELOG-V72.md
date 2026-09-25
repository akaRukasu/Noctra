# Noctra v72

## TV — LiveWatch VIP Premium

- Le VIP Premium redevient le **chemin de lecture prioritaire**. La v71 démarrait volontairement l’iframe publique LiveWatch en premier ; cette iframe est sur un autre domaine et ne reçoit pas la session VIP conservée côté serveur Noctra, ce qui réintroduisait la demande de publicités.
- Le lecteur public LiveWatch est maintenant uniquement un **secours explicite** si le chemin VIP authentifié n’aboutit pas.
- Le résolveur VIP accepte les réponses JSON imbriquées et les réponses contenant directement une URL de flux.
- Les cookies éventuellement émis par le résolveur LiveWatch sont conservés et relayés avec la playlist HLS et ses segments, en plus du jeton d’authentification lorsqu’il est requis par LiveWatch.
- La validation du chemin VIP reste stricte : playlist maître → playlist média → ressource vidéo. Une page HTML HTTP 200 ne peut donc pas être prise pour un flux valide.
- Si le chemin VIP échoue, l’interface indique désormais clairement **« VIP non transmis · secours public »** au lieu de laisser croire que les avantages Premium sont actifs.

## TV — OHA

- Les requêtes catalogue/résolution incluent désormais `clientVersion: 3.0.2`, tout en restant sur les endpoints publics historiques de la source.
- Noctra essaie les deux domaines publics connus `oha.to` puis `oha.cx` avant de conclure à une panne du fournisseur.
- Les HTTP 501/451 sont distingués d’une panne du lecteur Noctra et remontés comme indisponibilité amont.
- Le catalogue progressif et les références stateless restent conservés.
- Aucun mécanisme de signature ou de protection du fournisseur n’est contourné. Si OHA refuse son API publique ou si son propre lecteur ne reçoit plus de média, Noctra affiche maintenant cette panne proprement au lieu de rester sur un lecteur gris indéfiniment.

## TV — WiTV

- Aucun changement du chemin de lecture WiTV : la logique v71 déjà stable est conservée afin d’éviter une nouvelle régression.

## Dock / interface

- Le dock statique de la v71 est conservé sans animation de déplacement au survol.

## Tests

- `npm run check` : syntaxe serveur + shell.
- `npm test` : intégrité statique, responsive, grilles, Jellyseerr, pont LiveWatch VIP et résolveurs WiTV/OHA.
- Nouveau test de priorité VIP LiveWatch et de relayage des cookies de session vers le proxy HLS.
- Nouveau test de compatibilité OHA `oha.to` / `oha.cx`, `clientVersion` et classification HTTP 501.
- Smoke test serveur avec `BASE_URL=/noctra` et `/noctra/health` en version `72.0.0`.

## Limite amont constatée le 8 août 2026

Les pages publiques OHA visibles depuis l’extérieur signalent actuellement `HTTP 501 on catalog`, et plusieurs pages de lecture OHA indiquent que le média ne peut pas être chargé. La v72 corrige les régressions Noctra et les chemins de secours, mais elle ne peut pas fabriquer un flux si le fournisseur OHA lui-même ne délivre aucun média.
