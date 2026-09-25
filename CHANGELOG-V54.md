# Noctra v54

## TV — LiveWatch FR · US

- Les quatre catalogues TV LiveWatch (principal, DaddyTV, NorthTV, FrameTV) sont maintenant fusionnés dans une seule source `LiveWatch FR · US`.
- Filtrage côté serveur pour conserver en priorité les chaînes de France, Belgique, Suisse, Canada/Québec, Luxembourg, Monaco et États-Unis, ainsi que les entrées explicitement identifiées comme françaises/américaines.
- Déduplication des chaînes portant le même nom entre plusieurs catalogues.
- Les sources Sports / Football / BossTV / JackTV / Matchs du jour restent séparées.

## TV — WiTV

- Les cartes WiTV ne chargent plus toute la page du site dans le lecteur Noctra.
- Au clic, Noctra récupère la page publique de la chaîne et détecte uniquement les balises `iframe` publiquement exposées par cette page.
- Le meilleur lecteur iframe est chargé directement dans la zone vidéo.
- Si plusieurs lecteurs sont présents, des boutons `Serveur 1`, `Serveur 2`, etc. permettent de basculer entre eux.
- Le bouton `Ouvrir le lecteur` conserve la page WiTV originale comme solution de secours.
- Aucun flux HLS caché, token privé ou mécanisme interne du fournisseur n'est extrait.

## TV — OHA

- Le sous-menu Portails conserve OHA en mode navigateur intégré.
- Suppression du panneau d'informations sous le lecteur pour libérer de la hauteur.
- Nouvelle barre compacte avec `Recharger` et `Plein écran`.
- Le portail occupe davantage de surface sur PC, tablette et mobile.
- Noctra ne contourne pas les restrictions iframe/CSP du site et ne reproduit pas les mécanismes privés de VYPN.

## Responsive

- Boutons de sélection des serveurs WiTV adaptés au tactile.
- Barre OHA compacte en desktop, empilée proprement sur mobile.
- Hauteur du portail ajustée suivant la taille de l'écran.

## Technique

- Nouvelle route `/api/tv/resolve/:token` pour analyser une page TV autorisée et retourner ses iframes publiques.
- Cache LiveWatch FR/US de cinq minutes.
- Cache WiTV conservé.
- Version serveur / PWA : `54.0.0`.
