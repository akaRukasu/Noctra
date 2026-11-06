# Noctra 200.0.172 — migration Movix vers movix.dog

Cette archive reprend intégralement la version corrigée 200.0.171. Le correctif cible le connecteur serveur Movix et les identifiants de version.

Le site actuel est https://movix.dog/live-tv. Son application utilise https://api.movix.dog. L’ancienne adresse api.movix.college ne se résout plus depuis le poste de vérification.

Modifications :
- API des catalogues, bouquets, résolveurs et vérification VIP : `https://api.movix.dog`.
- Référent des requêtes et des flux sans référent spécifique : `https://movix.dog/`.
- En-tête `User-Agent: VAVOO/2.6` pour les flux Vavoo/Sunshine sans agent explicite. Les agents fournis par le fournisseur restent prioritaires ; le relais conserve cet en-tête dans les sous-playlists et segments.
- Conservation des identifiants de sources, clés existantes, en-têtes spécifiques des lecteurs et formats HLS/MPEG-TS.
- Version serveur et cache web portés en 200.0.172.

Pour mettre à jour : utiliser le contenu de cette archive dans l’installation serveur existante en préservant `.env`, les données de `runtime` et les fichiers personnels, puis redémarrer le processus Noctra. Pour une intervention minimale, remplacer `lib/tv-additional-providers.mjs` par le fichier fourni et redémarrer suffit à appliquer la migration des adresses ; les autres fichiers actualisent le numéro de version et les tests.

Installer le client Windows ne remplace pas les fichiers du serveur. Le client 0.5.2 reste compatible avec ce correctif.

Vérifications : tests `tv-movix-domain.mjs`, `tv-mpegts.mjs`, `v200051-roulette-providers.mjs`, et contrôles de syntaxe serveur/web. Sur la nouvelle API réelle : manifeste JSON de 58 bouquets, 17 bouquets Vavoo et 11 Northlive, catalogue France Vavoo de 964 entrées et Sport Northlive de 80 ; résolution du flux Northlive contrôlé vers un manifeste HLS HTTP 200. Ce dernier contrôle de manifeste ne certifie pas à lui seul un décodage vidéo.

Le refus 403 de TF1 FHD .b a été reproduit sans cet en-tête, puis corrigé avec le même en-tête que le lecteur Movix. Le flux réel a ensuite été décodé par mpv en 720p, avec démarrage et progression vidéo constatés.

Limites : 13 EME RUE HD .s a encore renvoyé HTTP 403 « Unavailable 1 » avec le bon en-tête. Movix ne propose pas d’autre variante ni de proxy de secours pour cette entrée au moment du contrôle. Ce flux reste signalé indisponible. IPTV VIP n’a pas été retesté, conformément à son indisponibilité signalée. Les autres fournisseurs sont conservés.


Contrôle complémentaire : le test historique v200052-navigation échoue sur une attente devenue obsolète concernant l’absence de FCTV33, également en échec dans la copie intacte de 200.0.171. Le connecteur de ce correctif conserve FCTV33 et ses autres fournisseurs ; ce test ancien n’a pas été modifié pour masquer cet échec.
