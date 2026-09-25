# Noctra v200

## 200.0.48

- WiTV/OHA/StreamSports : la sonde HLS attend désormais des octets du média. Les segments vides, pages d'erreur et réponses HTTP 200 silencieuses ne sont plus retenus comme flux vérifiés. La sonde s'arrête après un préfixe court et conserve le master pour la qualité Auto.
- Si le segment sondé sort de la fenêtre live (404/410), un seul segment voisin récent est essayé dans la même échéance. Les cookies de chaque origine sont séparés entre master, variante et CDN média.
- Délais HLS distincts pour le premier octet et le transfert complet : reprise plus rapide d'un serveur muet, temps conservé pour un gros segment qui arrive sur un réseau lent. Reprises limitées des erreurs transitoires ; les refus, segments disparus et limitations HTTP ne sont pas réessayés en boucle.
- Surveillance de l'avancement vidéo après démarrage, même sans événement d'erreur. Une lecture figée renouvelle le serveur sélectionné ou tente les options automatiques existantes. Une pause volontaire ou un téléchargement qui progresse est respecté.
- Une mise en tampon automatique sans nouvelles données ne reste plus bloquée indéfiniment. Un refus d'autoplay conserve le média préparé pour le clic sur Lecture.
- Toutes les sources TV utilisent une échéance de connexion sans limite artificielle de durée du corps média. Les téléchargements amont sont annulés à la déconnexion du lecteur, même avant les premiers en-têtes ; une rupture transitoire de connexion GET peut être reprise une fois.
- L'annulation d'un ancien lecteur se propage au renouvellement API ; une réponse tardive ne peut pas remplacer la chaîne actuelle.
- Les secours externes WiTV et le lecteur web OHA restent manuels. Les profils de qualité Auto/manuelle et les réserves de lecture existantes sont conservés.
- Tests locaux et relais HTTP de test validés. Disponibilité et stabilité prolongée des fournisseurs réels non vérifiées dans cette session ; voir `TEST-NOTES-V200048.md`.

## 200.0.47

- WiTV : si le HLS n'est pas validé depuis le serveur Noctra, priorité au véritable lecteur officiel WiTV avec son origine, sans ouverture automatique de FSTV/LiveWatch. Les secours externes restent sélectionnables manuellement.
- WiTV : distingue l'échec de page, d'extraction et de validation HLS dans les diagnostics, avec statut HTTP mais sans URL média ni jeton. Une iframe distante chargée n'est plus annoncée comme une lecture prouvée ou un chargement perpétuel.
- OHA : un résolveur de serveur natif en échec ne renvoie plus le bridge web comme s'il s'agissait d'un résultat. Le lecteur officiel reste manuel lorsque la résolution initiale échoue.
- OHA/WiTV : délai de 36 secondes sans première image par tentative de lecture native ; essai des options automatiques restantes puis arrêt avec erreur explicite. Les reprises ne sont plus remises à zéro par un segment tamponné avant toute lecture effective.
- OHA : le secours web ne revient pas vers une option déjà échouée ; attente du lecteur officiel bornée et protection du temporisateur contre un changement de page.
- Aucun changement des réglages communs de qualité ou de tampon, ni des parcours LiveWatch/FrameTV/StreamSports.
- Observation en navigateur : le lecteur officiel WiTV Canal+ Foot a atteint readyState 4 avec progression du média ; la variante française BEIN SPORTS 1 .b sur Kool a affiché une erreur média sur le site lui-même. Ce constat n'est pas une validation de toutes les chaînes ni de l'installation utilisateur.

## 200.0.46

- WiTV rend le premier HLS vérifié sans attendre les autres lecteurs ni les recherches FSTV/LiveWatch. Les sondes perdantes sont annulées ; chaque lecteur a une échéance totale de 24 secondes.
- Les autres HLS WiTV et les secours externes restent sélectionnables mais sont résolus à la demande. Les HLS WiTV passent avant les secours d'autres fournisseurs ; les iframes officielles restent un choix manuel.
- Le renouvellement mémorise l'URL exacte du lecteur WiTV sélectionné, sans relancer une sélection susceptible de basculer sur un autre serveur. Les secours LiveWatch sont identifiés comme tels, et non « Secours WiTV ».
- Le renouvellement WiTV conserve aussi les autres lecteurs et secours dans le sélecteur, au lieu de remplacer la liste par le seul lecteur renouvelé.
- OHA/Kool essaie ses miroirs en parallèle décalé, avec une avance de 650 ms pour la racine configurée et annulation des sondes perdantes. Une racine bloquée n'impose plus son attente à chaque miroir.
- OHA et WiTV valident un segment récent plutôt que le premier segment parfois expiré de la fenêtre live. Une variante légère sert à la sonde ; le master et la qualité Auto/manuelle de lecture sont conservés.
- Aucun changement des réglages communs de tampon, de reconnexion ou de qualité, ni des parcours LiveWatch/FrameTV/StreamSports qui fonctionnent déjà.
- Tests exécutables ajoutés pour la concurrence, le choix exact du lecteur, les secours différés et les segments récents. Les mesures sur flux réels restent à effectuer.

## 200.0.45

- OHA/Kool : conserve le type HLS des sous-playlists même lorsque leurs URLs n'ont pas d'extension et que leur MIME est générique ; transmet l'Origin média nécessaire aux segments.
- Rejette les pages HTML/JSON renvoyées à la place d'une playlist ; borne aussi la lecture du corps des manifests pour éviter une attente infinie après les headers.
- Le relais média tente une seule reprise des HTTP 502/503/504 avant envoi des octets, sans relancer les refus d'accès ni les 429 et sans couper artificiellement les segments longs.
- StreamSports99 rend le premier serveur vérifié sans attendre les autres. Les sources restantes sont résolues à la demande ; les sondes concurrentes sont annulées.
- La reconnexion OHA/StreamSports conserve le résolveur du serveur sélectionné et ne stoppe plus préventivement le chargement de la vidéo en cours.
- FrameTV essaie ses secours après épuisement des reprises, avant une nouvelle résolution du serveur défaillant. FrameTV/StreamSports changent de source si les coupures persistent malgré la réserve reconstruite.
- En mode Auto uniquement, baisse préventive de qualité si les segments arrivent trop lentement et que le tampon devient faible. Aucune pause ou avance forcée pour cette adaptation.
- Distingue une playlist invalide d'un incident réseau ; limite les répétitions avant la première image et protège les callbacks des anciens lecteurs.

## 200.0.44

- Corrige une erreur de syntaxe du script OHA/Kool généré dans le navigateur (échappements perdus dans le template), non détectable par le seul contrôle du serveur.
- Réserve les routes aux identifiants des chaînes : les IDs EPG/tokens imbriqués ne peuvent plus créer de fausses routes ; l'embed garde l'ID du serveur sélectionné.
- Préserve les URL blob du lecteur et évite de ré-encapsuler les URL déjà proxifiées ; seuls les manifests/vidéos complets sont transmis au lecteur natif, jamais les segments isolés.
- Supprime l'attente des sondes HTML avant une lecture native, borne les essais OHA et annule les sondes concurrentes inutiles dès qu'un flux est prêt.
- Adapte le seuil de démarrage à la fenêtre réelle de la playlist (cible normale 8–10 s, réseau faible 12 s), sans diminuer la capacité de tampon pendant la lecture.
- Ne compte qu'une interruption par épisode waiting/playing : les notifications doublées HLS/vidéo ne déclenchent plus une longue remise en tampon à tort.
- Annule les anciens temporisateurs de démarrage et de remise en tampon au changement de lecteur.
- Ajoute des tests exécutant le script injecté, la résolution sans sondes HTML, les routes, l'annulation et les épisodes de blocage.

## 200.0.43

- Corrige le mode cinéma : les clics dans l’image ou dans le panneau ne le ferment plus ; seul son bouton dédié le bascule.
- Déplace la commande Cinéma dans la barre du lecteur, entre Picture in Picture et Plein écran, avec un état actif visible.
- Reconstruit les routes OHA/Kool depuis l’identifiant `ids.id` réellement publié, garde la route `/watch?live=…` dans le bridge et élimine les anciennes routes croisées `oha.cx`.
- Sépare les chaînes internationales StreamSports99 Live TV des événements sportifs et expose le catalogue par pays dans l’univers Chaînes.
- Ajoute au FrameTV sélectionné des secours froids LiveWatch/NorthTV et essaie les variantes HLS avant l’embed officiel lorsqu’aucune première image n’arrive.
- Restaure le PlayerJS WiTV officiel comme repli lorsque son HLS tourne entre l’extraction et la validation.
- Ajoute des reprises HLS progressives avec temporisation exponentielle et des délais de retry bornés afin de réduire les coupures sans boucler agressivement sur un CDN en panne.

## 200.0.42

- Regroupe les versions BASIC, CABLE, SAT, HD et secours d’une même chaîne LiveWatch dans une seule entrée, puis les expose comme serveurs distincts sous le lecteur.
- Conserve les variantes officielles des univers LiveWatch dérivés dans le même sélecteur, sans mélanger leurs identifiants ni leurs lecteurs Premium.
- Attend 45 à 55 secondes avant une bascule automatique de serveur et reconstruit une réserve adaptative allant jusqu’à 28 secondes sur les sources irrégulières.
- Corrige la route initiale du bridge OHA/Kool vers `/live`, récupère automatiquement une SPA tombée sur « NOT FOUND » et attend 35 secondes de blocage soutenu avant de changer de serveur.
- WiTV renouvelle sans cache la page PlayerJS, accorde jusqu’à 18 secondes au premier segment et ne déclare son lecteur bloqué qu’après 38 secondes sans lecture.
- StreamSports99 conserve le même serveur pendant les ralentissements ordinaires et attend 20 secondes avant une relance contrôlée du chargeur HLS.

## 200.0.41

- Ajoute les 414 chaînes de la rubrique StreamSports99 Live TV via l’API publique courante, avec classement par pays et résolution HLS au clic.
- Valide chaque lecteur StreamSports99 jusqu’au premier segment et masque les serveurs qui répondent sans média exploitable.
- Écarte les identifiants LiveWatch périmés, regroupe les doublons BASIC/CABLE/SAT et sonde plus longtemps les variantes actuelles avant le lecteur web.
- Donne à OHA/Kool le temps réel nécessaire pour résoudre ses serveurs, teste le média plutôt que la seule playlist et utilise `/live` au lieu des deep-links SPA cassés.
- WiTV ne considère plus une page PlayerJS 200 comme un flux valide : un direct vérifié FSTV/LiveWatch est prioritaire et le lecteur WiTV reste un secours manuel.
- Étend la réserve adaptative et les reprises sur LiveWatch, NorthTV, FrameTV, OHA, WiTV et StreamSports99 sans classer une connexion rapide en profil faible.

## 200.0.40

- StreamSports99 transforme les pages `/live-tv/...` en lecteurs HLS natifs Noctra et renouvelle leur URL signée à chaque démarrage ou reconnexion.
- Les événements StreamSports99 reconnaissent également les champs actuels `event` et `eventIMG` de l’API CDN Live TV.
- LiveWatch, NorthTV et FrameTV recherchent automatiquement la même chaîne dans les deux familles sœurs lorsqu’un flux publié n’atteint aucun segment vidéo.
- Le secours inter-familles est ordonné tôt, validé jusqu’au premier segment et n’altère pas le direct sélectionné quand celui-ci fonctionne.
- Quand le direct choisi répond, aucune famille sœur n’est chargée ; en cas d’échec, trois secours sont sondés parallèlement dans une fenêtre de résolution étendue et bornée.
- Le profil prudent reconnaît aussi une connexion 3G explicite sur ordinateur ; les connexions normales conservent leurs délais, leur estimation ABR et leur démarrage adaptatif habituels.
- Les empreintes du shell, du thème, du runtime Jellyfin et des polices sont synchronisées en v40 afin d’empêcher tout mélange client/serveur après la mise à jour.

## 200.0.39

- LiveWatch teste toutes les variantes homonymes jusqu'au premier segment et remplace automatiquement une entrée SAT/CABLE morte par une variante saine.
- Les univers Sports, Football Live, BossTV, JackTV, DaddyTV, NorthTV et FrameTV utilisent désormais le bridge Premium au lieu de contourner le resolver VIP.
- FSTV résout chaque chaîne au clic et contourne proprement son relais de segments cassé (`host not allowed`) en relayant l'URL publique annoncée par la playlist.
- WiTV ne valide plus un simple master HLS : le chemin complet jusqu'au premier segment doit répondre avant d'être proposé au lecteur.
- FSTV et WiTV disposent d'un secours LiveWatch vérifié par nom lorsque leur CDN courant ne fournit aucun média lisible.
- Le repli automatique essaie tous les directs vérifiés avant le lecteur React et n'ouvre jamais automatiquement le lecteur public avec publicités.

## 200.0.38

- Répare LiveWatch VIP : vraie route React restaurée et identifiants opaques rafraîchis au clic.
- Remplace le lecteur FSTV iframe cassé par la résolution et la validation du HLS courant.
- Migre OHA vers Kool (`mediahubmx`) avec secours IP et ancien domaine.
- Donne la priorité au PlayerJS interne WiTV et rejette les iframes livehdtv obsolètes.
- Répare les catalogues W3U/Wiseplay (`stations`, groupes imbriqués, `embed:true`) dans Mes sources.
- Rend le nom d'une source personnelle facultatif ; l'adresse seule suffit et la suppression reste disponible.

## 200.0.33

- Correction de la boucle de surveillance des icones qui bloquait le lecteur et l'interface. Les mises a jour sont idempotentes et regroupees par image affichee.
- Retablissement des clics et des gestes sur le lecteur natif. Les menus audio, sous-titres et reglages restent au-dessus de la video.
- Reactivation du worker HLS : le blocage identifie venait de la boucle d'interface, pas du worker. Le traitement des segments ne monopolise plus l'interface.
- Actions des fiches film et serie rondes, centrees, sans glyphes superposes. Cibles tactiles de 44 px et ligne d'actions placee sous l'affiche sur mobile/tablette.
- Adaptation de la fiche lors du redimensionnement et du changement d'orientation. En-tete du lecteur sans commandes superposees.
- Tests reels sur un film et un episode, controles de lecture et de sortie, regression des icones dans le navigateur. Details dans TEST-NOTES-V20033.md.

## 200.0.32

- Le démultiplexage HLS vidéo s'exécute directement dans la page pour éviter le worker Jellyfin bloqué avant le premier segment ; les segments TS limitent suffisamment ce coût pour préserver la fluidité.

## 200.0.31

- Les transcodages Jellyfin destinés au navigateur utilisent des segments MPEG-TS valides, plus robustes que les fragments MP4 qui provoquaient une erreur de démultiplexage sur certains médias HEVC.
- Le profil reste en H.264/AAC à 12 Mb/s et conserve les reprises longues de la v200.0.29.

## 200.0.30

- Le lecteur films/séries reprend le moteur HLS officiel de Jellyfin pour analyser correctement ses fragments MP4, tout en conservant les délais et reprises ajoutés en v200.0.29.
- Le moteur TV n'est plus préchargé sur les fiches et le lecteur : l'interface charge moins de code et chaque usage conserve son moteur adapté.

## 200.0.29

- Les réponses temporaires des premiers segments Jellyfin ne ferment plus immédiatement le lecteur : HLS conserve la session et réessaie pendant la création du transcodage.
- Les délais de chargement des manifestes, niveaux et fragments sont adaptés au temps réel observé sur le serveur, avec plusieurs tentatives progressives avant d'afficher une erreur.

## 200.0.28

- Les films et séries utilisent le moteur HLS stable déjà éprouvé par le lecteur TV Noctra, chargé avant Jellyfin et conservé sous une référence indépendante.
- Le suivi de session, les commandes, les pistes audio et les sous-titres restent gérés par Jellyfin ; seul le moteur de transport vidéo est remplacé.

## 200.0.27

- Le moteur HLS réactivé reçoit lui aussi une nouvelle empreinte de fichier : l'ancienne variante exécutée sur le fil principal ne peut plus figer le lecteur.
- Les vidéos 1080p Jellyfin sont limitées à 12 Mb/s en AVC avec audio AAC pour accélérer l'amorçage tout en conservant une qualité élevée et compatible ordinateur/mobile.

## 200.0.26

- Le module vidéo corrigé reçoit un nouveau nom de fichier et le runtime Jellyfin est rechargé avec un identifiant de cache neuf : le navigateur ne peut plus conserver l'ancienne URL HEVC.
- Les commandes Vue, Trier et Filtrer des médiathèques utilisent désormais des icônes SVG visibles, comme les boutons de pagination déjà réparés.

## 200.0.25

- Le worker HLS est réactivé après le basculement AVC/H.264 : le décodage des segments ne bloque plus le fil principal ni les commandes du lecteur.
- La compatibilité vidéo repose désormais sur les deux conditions nécessaires : profil H.264 transmis par Jellyfin et traitement HLS hors de l'interface.

## 200.0.24

- Le module vidéo Jellyfin remplace désormais son URL HLS avant de la transmettre au lecteur : les profils HEVC/AV1 annoncés à tort par Chromium basculent réellement vers un flux AVC/H.264 décodable.
- Le cache PWA et toutes les ressources versionnées sont renouvelés afin qu'aucun ancien module du lecteur ne survive à la mise à jour.
- Les actions des fiches conservent leurs anciennes icônes fines, dans une barre compacte et centrée, sans glyphe carré résiduel sur ordinateur, tablette ou mobile.

## 200.0.23

- La lecture Jellyfin réagit désormais aux événements réels du média, même lorsque Jellyfin conserve l'URL de la fiche : le dock disparaît et la surface vidéo prend le viewport dès l'amorçage.
- Le démultiplexage HLS s'exécute directement dans la page et les manifestes Jellyfin incompatibles basculent réellement en AVC/H.264, au lieu de rester bloqués à zéro seconde sur un profil HEVC annoncé à tort par Chromium.
- La couleur de thème Jellyfin retrouve sa balise attendue, ce qui supprime l'erreur JavaScript qui interrompait une partie de l'initialisation du lecteur.
- Les actions des fiches film et série retrouvent une barre compacte, rectangulaire et centrée sur tous les écrans, sans le second glyphe carré sous les icônes.
- Les versions du client, du serveur, des ressources et du cache PWA sont de nouveau synchronisées.

## 200.0.22

- Le lecteur Jellyfin n'est plus soumis à des pauses artificielles lors de son amorçage : la vidéo démarre immédiatement et de façon fluide sur ordinateur et mobile sans écran noir.
- Les actions des fiches film et série sont parfaitement alignées et horizontales : bouton principal en pilule nette (icône et libellé sur la même ligne) et boutons secondaires circulaires bien proportionnés.
- Le calque d'OSD vidéo laisse passer les interactions sous-jacentes et ne masque plus l'affichage vidéo en arrière-plan.
- Les chevrons décoratifs sont retirés de tous les titres de carrousels sur l'accueil, tous types d'icônes et boutons confondus.

## 200.0.21

- Les actions des fiches film et série restent compactes, centrées sur la largeur utile du ruban et peuvent se réorganiser sans débordement sur téléphone, tablette, ordinateur et TV.
- Le lecteur Jellyfin n'attend plus la fin de sa transition d'opacité pour passer devant la fiche : la vidéo, les sous-titres et l'OSD occupent immédiatement le viewport, y compris sur mobile et après rotation.
- Les chevrons décoratifs sont retirés exclusivement des titres « Films, ajouts récents » et « Séries, ajouts récents », sur tous les breakpoints, sans toucher aux commandes droite/gauche des carrousels.

## 200.0.20

- Le lecteur Jellyfin reconnaît immédiatement la route `#/video` ou sa surface réellement rendue lorsque Jellyfin conserve l’URL de la fiche ; il passe au premier plan et conserve la vidéo ainsi que son OSD dans tout le viewport sur téléphone, tablette et ordinateur.
- Les actions des fiches film et série tiennent sur une seule rangée : action principale libellée, reprise visuellement distincte et boutons secondaires compacts.
- Le chargement de la liste des torrents reste centré dans son panneau plein écran, y compris avec les zones sûres des mobiles.
- Prowlarr réutilise les indexeurs connus lors d’un rafraîchissement lent, limite la vérification automatique aux deux indexeurs les plus rapides et ne transforme plus une réponse vide valide en erreur à cause d’un essai ultérieur trop lent.
- Les incidents temporaires des trackers deviennent un état de vérification à relancer, plus discret sur les cartes, tout en conservant l’accès au nouvel essai et les erreurs explicites dans la liste détaillée.

## 200.0.18

- Le plein écran des torrents masque désormais effectivement le dock mobile, y compris lorsque le panneau Demandes impose sa propre règle de visibilité prioritaire.
- Validation en ligne sur un écran de 390 × 844 : accueil sans chevrons parasites, panneau sans débordement et recherche Prowlarr réelle aboutie.

## 200.0.17

- Prowlarr utilise en priorité son accès interne puis le port local du serveur, avant l’adresse publique ; un proxy distant lent ne bloque plus toute la recherche.
- Les erreurs Prowlarr affichées dans Demandes sont courtes et compréhensibles, sans exposer les adresses techniques configurées.
- Les chevrons Jellyfin inutiles sont retirés des titres de carrousels sur mobile, tout en conservant le défilement tactile des rangées.
- Le détail des torrents devient un plein écran mobile indépendant : dock masqué, en-tête compact, titres longs repliés, statistiques alignées et boutons Télécharger sur toute la largeur.
- Les autres listes et panneaux Noctra reçoivent une protection supplémentaire contre les débordements de texte sur petit écran.

## 200.0.16

- Les trois indexeurs Prowlarr les plus rapides sont privilégiés pour les vérifications automatiques ; l’actualisation manuelle conserve la recherche exhaustive.
- Les délais et le cache d’erreur des trackers sont raccourcis, avec trois cartes vérifiées en parallèle et des ajouts qBittorrent protégés contre les attentes interminables.
- Les carrousels de l’accueil avancent d’une page visible complète et ne répètent plus leurs premières cartes sur plusieurs clics.
- Les résumés Radarr/Sonarr sont encore compactés et les icônes du lecteur disposent d’un secours SVG sur les appareils qui ne chargent pas la police Material Icons.

## 200.0.15

- Sonarr : changement d'onglet protégé contre les réponses concurrentes, indicateur de chargement explicite et préchauffage de l'aperçu pour les administrateurs.
- Catalogue Sonarr mutualisé côté serveur pendant les appels simultanés, cache porté à une minute et requêtes de réglages inutiles retirées de la vue d'ensemble.
- Le lecteur auxiliaire YouTube et musique, son bouton flottant et ses styles sont retirés.
- Gestion des utilisateurs revient comme neuvième action du dock administrateur, avec une grille stable sur mobile et tablette.
- Les boutons d'action des fiches film et série sont centrés sur toute la largeur du ruban, quelle que soit la mise en page Jellyfin active.
- Les bandeaux et tuiles d'informations Radarr/Sonarr sont plus compacts sur ordinateur, tablette et mobile.

## 200.0.14

- Sonarr : packs S01/Saison 1 reconnus meme sans indicateur fullSeason. Si aucune integrale n'est trouvee, les packs de toutes les saisons sont proposes ; deux filtres separent integrales et saisons, avec affichage progressif sans limite silencieuse a 100 resultats.
- Toutes les listes de recherche interactive sont triees par taille croissante ; tailles inconnues en dernier. Deduplication des packs presents dans plusieurs recherches et progression conservees.
- Lecteurs musique et YouTube dans un panneau independant, accessible aux membres et administrateurs sans modifier le dock. Chargement a la demande, mode compact, favoris locaux par utilisateur, arret au lancement d'un media Noctra.
- Lecteurs officiels Spotify, Apple Music, Deezer, SoundCloud et YouTube/YouTube Music ; acces aux catalogues officiels TIDAL, Amazon Music, Qobuz et Bandcamp. Acces complet et duree des extraits dependent de la plateforme et de l'abonnement.
- YouTube : connexion Google officielle dans un nouvel onglet, liens vers abonnements et playlists, lecteur standard et option de confidentialite renforcee. Aucun mot de passe Google ne passe par Noctra, aucune fausse indication de connexion ou promesse de blocage publicitaire dans l'iframe.
- Mediatheques mobiles : dossiers rectangulaires empiles sur une colonne, titres lisibles, defilement et zones sures conserves, y compris en paysage.
- Tests de liens autorises, packs et tri, recherche HTTP, roles et non-regression ; controles visuels des lecteurs et des mediatheques sur plusieurs formats.

## 200.0.13

- Reseed : validation de candidats par empreintes de pieces, recherche parmi davantage de fichiers de meme taille, alias et liens existants pris en compte sans recopier les medias.
- Verifications limitees a deux torrents simultanes, interrogation ciblee de qBittorrent et reprise individuelle seulement a 100 %. Les fichiers incomplets restent arretes ; les echecs sont memorises tant que les fichiers ne changent pas.
- Recherche interactive : requetes partagees, resultats progressifs, cache court, progression par saison et erreurs explicites au lieu de faux resultats vides.
- Demandes : telechargement d'une release depuis la liste des torrents, choix de destination et categorie, confirmation et protection contre les doubles ajouts.
- Prowlarr : ajout, modification et test des indexeurs. Les secrets existants restent masques et sont conserves si leur champ est laisse vide.
- Mediatheques : la fin de l'analyse exige une confirmation recente de Jellyfin, y compris pour une analyse lancee ailleurs.
- Discovery : lecture paginee du profil sans la jointure couteuse des personnes, prise en compte des contenus vus/favoris et retour explicite en cas d'indisponibilite. Plus de profil vide mis en cache apres un timeout.
- Icone visible sur Ajouter un .torrent ; fenetres de confirmation et formulaires adaptes aux mobiles et tablettes.
- Tests isoles des API, des droits administrateur, des secrets, de l'idempotence et de la securite du reseed ; controles visuels desktop, mobile et tablette.

## 200.0.12

- Explorateur : deux boutons distincts Sagas et Series, avec resultats et compteurs propres a chaque categorie.
- Fenetres Sagas, Series et Doublons en plein ecran sur mobile ; listes defilantes, actions fixes et marges des zones sures.
- Les chemins des fichiers conserves et des copies restent visibles. Les groupes de doublons ne compriment plus leurs lignes ; selection multiple sans suppression automatique.
- Sonarr : Integrales / toutes saisons est place au niveau de la serie, avant les onglets, et ne depend plus de la saison active.
- Audit des series : regroupement des dossiers partageant le meme identifiant et signalement des numerotations ambigues plutot que de faux manquants.
- Tablettes : dimensions stables du dock tactile et corrections de disposition des panneaux et commandes.
- Tests visuels sur petits telephones, tablette et ordinateur, pagination de listes longues et suite de non-regression.

## 200.0.11

- Tablettes : dock en bas, panneaux sans marge reservee au dock desktop, grilles a deux colonnes et vues TV Chaines/Lecteur. Les tablettes tactiles larges sont prises en compte jusqu'a 1366 px.
- Explorateur : bouton Sagas et series, inventaire pagine Jellyfin et verification de la presence des fichiers, puis comparaison aux collections TMDB et aux episodes Sonarr/TVDB ou TMDB.
- Fenetre avec progression, filtres par type/etat/titre et details des films ou episodes manquants. Les prochaines sorties, dates inconnues et fichiers inaccessibles restent distincts.
- Verification en lecture seule : aucune demande de telechargement, relocalisation ou suppression. Episodes speciaux exclus. Cache de metadonnees de 24 heures et concurrence limitee.
- Tests des identifiants, doubles episodes, sorties futures, erreurs partielles, pagination et profils tablette.

## 200.0.10

- Les recherches de torrents utilisent l'annee originale et les titres localises/originaux du meme identifiant TMDB. Une sortie francaise l'annee suivante ne masque plus les releases du film.
- Recherche Prowlarr en GET uniquement, avec repli sans filtre distant de categorie et controle local strict des titres, annees, bonus et homonymes.
- La verification forcee contourne reellement le cache serveur. Les resultats absents restent en cache deux minutes et une erreur ne s'affiche plus comme zero torrent.
- La liste detaillee conserve tous les resultats en cache, meme si le premier affichage n'en demandait que huit.
- Verification reelle : Lawrence d'Arabie retrouve 20 releases pertinentes, dont 8 sur C411 ; Les Evades 34 ; Le Parrain 32 au moment du test.
- Ajustements de la derniere rangee et des filtres sur tablette inclus depuis la 200.0.9.

## 200.0.9

- Explorer charge les recommandations par lots de 12, puis les pages suivantes au fil du defilement, avec deduplication et reprise manuelle en cas d'erreur.
- Les dernieres rangees sont equilibrees sur ordinateur et tablette. Le nombre de cartes initiales et les observations DOM sont limites pour alleger le rendu.
- La recherche de fichiers pour le reseed inclut les anciennes destinations autorisees et conserve les noms alternatifs des liens physiques.
- Les correspondances ambigues peuvent etre confirmees par plusieurs empreintes SHA-1 de pieces completes. La verification integrale qBittorrent reste obligatoire avant reprise.
- Les annexes deja presentes peuvent etre rattachees. Les destinations existantes ne sont jamais ecrasees et un fichier incomplet, meme d'un octet, n'est pas relance.

## Versions precedentes

- Les boutons historiques des fiches média sont rétablis, circulaires et centrés sur la largeur réelle de la fiche.
- L’ajout manuel de fichiers `.torrent` accepte une destination qBittorrent connue, résiste aux réponses HTML temporaires du proxy et reconnaît une relance par info-hash sans créer de doublon.
- Sonarr recherche désormais les packs de saison complète et les intégrales multi-saisons, en affichant l’indexeur et en donnant la priorité aux packs complets.
- La relocalisation inspecte aussi les torrents incomplets déjà arrêtés, ignore les petites annexes absentes et n’associe un média que sur une taille exacte et un titre cohérent.
- Les torrents déjà confirmés à 100 % mais arrêtés peuvent être remis en partage par la même opération, sans lancer de téléchargement.
- La page Téléchargements retente les lectures API remplacées temporairement par du HTML et conserve le dernier état valide.
- Les rafraîchissements de l’accueil sont regroupés sur desktop et les flous coûteux des surfaces principales sont désactivés pour limiter les ralentissements.
- Les caches client et PWA passent à la révision `200.8`.
- La relocalisation qBittorrent utilise aussi la route API principale, compatible avec les reverse proxies qui renvoient la page HTML pour les sous-routes.
- L’updater aligne désormais l’unité systemd sur le Node.js récent détecté afin d’éviter le plantage Undici de Node 22 pendant les relocalisations volumineuses.
- Le sélecteur de destination qBittorrent masque les répertoires techniques de relocalisation et limite la liste aux 32 dossiers utiles les plus employés.
- Les flèches de l’accueil utilisent un déplacement Jellyfin instantané pour supprimer les attentes de plusieurs secondes entre deux clics.
- Les actions Sonarr `Pack saison complète` et `Intégrales / toutes saisons` sont visibles dès l’ouverture, sans devoir changer de saison.
- Explorer propose un filtre par genre et des sections distinctes pour les animés, les films d’animation et les classiques renouvelés régulièrement.
- Le lecteur Jellyfin attend une réserve de segments plus saine après des interruptions répétées afin d’éviter les reprises de quelques secondes suivies d’une nouvelle coupure.
- StreamSports99 relance le chargement du même serveur après huit secondes de gel, sans basculer prématurément vers un autre flux.
