# Noctra v67

## TV et dock

- Dock replacé au-dessus du panneau et harmonisé dans une capsule unique, avec dimensions cohérentes pour les rôles administrateur et utilisateur.
- Bandeau supérieur de la TV intégré au panneau au lieu d'apparaître comme une carte flottante séparée.
- Onglets Chaînes / Sports / Mes sources et sélecteur de fournisseurs compactés pour améliorer la lecture sur PC, tablette et mobile.

## OHA

- Correction du chemin du résolveur OHA lorsque Noctra est publié sous un `BASE_URL` comme `/noctra`.
- Le client évite désormais tout double préfixage d'une URL déjà publique.
- Le 404 HTML qui remontait sous la forme « Réponse API non JSON (404) » lors du lancement d'une chaîne OHA est ainsi supprimé.

## LiveWatch VIP

- Séquençage des lectures afin qu'une ancienne résolution ne puisse plus interrompre la chaîne sélectionnée ensuite.
- Les interruptions normales de `video.play()` causées par un changement de chaîne ou un `pause()` ne sont plus affichées comme des erreurs utilisateur.
- Extraction des URL de flux rendue plus tolérante aux structures JSON imbriquées et aux différents noms de champs utilisés côté LiveWatch.
- Prise en charge élargie des chemins de proxy LiveWatch officiels reconnus par le pont VIP.
- Nouveau bouton administrateur **Tester le VIP** : contrôle la session, la résolution LiveWatch/FrameTV et l'accessibilité du flux sans afficher le jeton ni l'URL privée.

## Stabilité

- WiTV conserve le résolveur natif de la v66 qui fonctionne déjà correctement.
- Version serveur/client : `67.0.0`.
- Cache PWA : `noctra-shell-v67`.
