# Vérification 200.0.107 — révision interface 107g

## Corrections
- Migration du catalogue, bouquets, résolveurs et vérification VIP Movix vers api.movix.college, avec référent movix.college.
- Menu des sources superposé sur ordinateur : ne dilate plus toute la barre. Un seul défilement interne, actions latérales accessibles, fermeture par Échap avec restitution du focus.
- Lignes virtualisées TV de hauteur constante, titres limités, calcul du pas conservant les fractions de pixel. Désactivation en disposition compacte et recalcul lors du redimensionnement.
- Correctif ciblé pour Shaka 5.2.10 : son itérateur de SegmentIndex pouvait renvoyer null après éviction des segments. L’actualisation HLS setProgramDateTimeRegionsFromIndex_ levait alors une TypeError en boucle. Un index vide produit désormais un itérateur terminé. Chargement commun à la lecture simple et au multiview, sans changement automatique de moteur.
- Diagnostic : classe d’exception autorisée uniquement, regroupement des erreurs identiques répétées, export des 90 derniers événements au lieu de 35. L’affichage reste limité à 35. Aucun message brut, URL ou stack inclus.

## Preuves et tests
- Blocage reproduit sur Movix IPTV VIP / FRANCE HEVC H265 / CANAL + DOCS FHD, après démarrage réel. Exception observée : null.next dans TD, fonction compilée de setProgramDateTimeRegionsFromIndex_.
- Test exécuté sur le vrai fichier Shaka embarqué : index vide échoue avant correction ; index vide/évincé, index non vide et installation répétée passent après correction.
- Suites réussies : tv-shaka-empty-index, tv-shaka, tv-shaka-multiview, tv-virtual-scroll, tv-movix-domain, tv-mpegts, tv-mobile-idle, v200107-resume-user-dock. Vérifications syntaxiques JS réussies.
- Navigateur : barre ouverte de 92 px, menu séparé des actions ; Échap referme le menu ; fin du catalogue LiveWatch accessible (ZYLO SCREAMIN) ; mode tablette 1100 px et mobile 390 px sans virtualisation ; menu mobile dans la largeur disponible.
- Migration vérifiée en ligne : Vavoo 17 bouquets / France 897 chaînes, Northlive 11 bouquets / Sport 85 chaînes, IPTV VIP 236 bouquets / HEVC 14 chaînes.

## Limites constatées
- Vavoo 6TER .c : le fournisseur retourne un domaine vidéo non résolu (ENOTFOUND). Catalogue accessible, lecture non rétablie sur cet exemple.
- Northlive BEIN SPORTS 1 FHD : résolution fournisseur HTTP 500. Catalogue accessible, lecture non rétablie sur cet exemple.
- IPTV VIP CANAL + DOCS FHD : lecture réelle et plantage reproduits avant correction. Après correction, démarrage en 10,25 secondes, réserve montée à 40,45 secondes ; aucune répétition de TypeError dans le journal de cet essai. Des délais de réponse du manifeste puis une réserve vide ont encore déclenché une reconnexion. La correction de l’exception est vérifiée par test reproductible sur le moteur réel ; une diffusion prolongée sans interruption n’est pas certifiée.
- Rapport nocturne envoyé : fin de session avec réserve 51,28 s, état prêt 4, zéro image perdue sur 69 397. Journal limité aux derniers événements, incluant des remises en mémoire et un HTTP 503 ; il ne prouve pas une nuit sans interruption.
- Aucun réglage général de réserve/ABR ni choix manuel de moteur/serveur modifié.

## Livraison
Version client et serveur maintenue à 200.0.107. Cache des fichiers shell et finition passé à 200.107g. Sauvegarde distante préalable, empreintes vérifiées et santé serveur OK après publication.
