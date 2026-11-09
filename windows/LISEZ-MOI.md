# Noctra Windows 0.6.0

Client Windows natif WPF pour Noctra et Jellyfin. Windows 11 x64.

## Installation

Ouvrez **Noctra-Setup-0.6.0-x64.exe**. L’installation se fait dans votre compte Windows, avec un raccourci dans le menu Démarrer et une entrée de désinstallation. Le lecteur mpv est téléchargé depuis son projet d’origine, vérifié par SHA-256 et installé avec l’application. Cette étape nécessite Internet.

Connectez-vous ensuite avec votre compte Jellyfin. L’adresse Noctra est préremplie et peut être changée dans **Adresse du serveur**.

## Interface et lecture

**Nouveau en 0.6.0 : interface refaite.**
- **Palette et bandeau** : palette nuit, accents violet et cyan. Le bandeau flotte sur les visuels et devient opaque quand la page défile.
- **Accueil** : grand visuel pleine largeur, avec logo du titre, synopsis, défilement automatique (en pause au survol), fondu enchaîné et points de pagination.
- **Cartes** : elles s'agrandissent au survol et les images apparaissent en fondu. La progression est en dégradé, et une coche indique les titres vus.
- **Médiathèques** : tuiles illustrées en 2 × 2.
- **Épisodes** : lignes aérées, avec vignette, durée et progression.
- **TV** : guide « Maintenant / Ensuite » sur la fiche d'une chaîne.
- **Lecteur** : barre à icônes.
- **Notifications** : en pastille, elles s'effacent seules.

L’accueil affiche les reprises, les ajouts récents séparés pour chaque médiathèque, puis À suivre, et enfin les médiathèques. Il utilise les visuels et logos de Jellyfin. Les reprises, épisodes à suivre et favoris proviennent du compte connecté. Les fiches donnent accès à la lecture directe, aux saisons, au statut vu ou non vu et à la distribution.

Le bandeau supérieur adapte la taille des commandes, de la recherche et des espacements à la largeur disponible. Les grands écrans disposent de commandes plus généreuses ; une petite fenêtre conserve une disposition compacte. La mise à l’échelle Windows reste prise en charge. En mode agrandi, la barre de titre reste entièrement dans la zone visible du moniteur.

Le lecteur dispose de la pause, des sauts de 15 secondes, du volume, de menus audio et sous-titres, du plein écran et de la reprise. Le bouton **Passer le générique** utilise les segments Jellyfin ou des chapitres nommés du fichier. En cas d’échec de lecture directe, le client essaie le décodage de secours et le flux adapté par Jellyfin.

Le défilement est animé sur le rythme de composition de Windows. Le moteur vidéo utilise la synchronisation verticale et adapte la présentation à l’écran. La fréquence détectée est visible dans le profil. Les performances effectives dépendent du matériel, du pilote et de la vidéo.

Raccourcis du lecteur. Espace pour la pause, flèches gauche et droite pour les sauts, M pour couper le son, F11 pour le plein écran et Échap pour revenir.

Sur les directs TV, les commandes flottent sur la vidéo et se masquent après 2,5 secondes sans mouvement. Bougez la souris pour les retrouver. Le plein écran couvre le moniteur entier, masque les bordures et la barre des tâches, puis restitue la taille ou l’état agrandi de la fenêtre à la sortie. Un double clic dans la vidéo native bascule aussi ce mode.

## Services

- Bibliothèques, films, séries, saisons, favoris, recherche et filtres.
- Découverte, demandes Jellyseerr et roulette avec une adresse Noctra.
- TV, sports et PPV avec les catalogues, miroirs et flux que le serveur propose. Multivue jusqu’à quatre directs.
- Sessions Jellyfin et télécommande. Diffusion Chromecast avec recherche locale et saisie d’adresse IP.
- Pour les administrateurs, téléchargements, fichiers et corbeille, analyses, catalogue Radarr/Sonarr et recherche de versions, configuration et test des indexeurs Prowlarr, sources TV et accès LiveWatch. Le nouvel espace Jellyfin permet de consulter les comptes et les tâches, modifier l’accès des autres comptes et actualiser les médiathèques.

Les lecteurs externes s’ouvrent dans une fenêtre dédiée utilisant Microsoft WebView2, avec filtrage de domaines et chemins publicitaires, blocage des fenêtres surgissantes et compteur de blocages. La protection peut être mise en pause pour un lecteur incompatible. L’interface principale reste native et n’intègre pas la PWA. Le setup détecte WebView2 et lance son installateur Microsoft signé si le composant manque. La disponibilité des services et des flux dépend du serveur et des fournisseurs. La diffusion Chromecast requiert un récepteur compatible accessible sur le réseau.

« Son · Noctra » indique que le lecteur externe utilise la session audio Windows de Noctra. Si la page empêche le transfert audio, le lecteur conserve sa sortie web et l’indique dans son bandeau.

« Toutes les chaînes » regroupe les variantes d’une même chaîne et les présente comme serveurs dans sa fiche. La qualité, les suffixes techniques et les alias courants sont reconnus ; les numéros de chaînes et pays distincts restent séparés. Les bouquets publiés sont chargés progressivement, dans la limite de 120 bouquets automatiquement. Toutes les variantes sont proposées ; les douze premiers résolveurs sont explorés automatiquement et les suivants peuvent être ouverts à la demande.

Le menu des sources TV reste accessible pendant le défilement des chaînes et des événements. Il défile séparément quand la fenêtre est trop basse pour afficher toutes les sources.

Le serveur Noctra fournit les catalogues TV et les options de lecture, y compris celles de WiTV.

Cette vue affiche les chaînes françaises par défaut. Le menu **Pays** donne accès aux autres pays publiés, à **Tous les pays** et aux chaînes dont le pays n’est pas précisé. Les bouquets des pays choisis sont chargés à la demande. Les sources ouvertes séparément restent consultables sans filtre initial de pays.

Dans la fiche d’une chaîne, **Vérifier les qualités des serveurs** examine les flux déjà résolus et affiche l’image réellement reçue et les résolutions annoncées par chaque flux. Le lancement automatique privilégie les serveurs vérifiés, puis la plus haute résolution vérifiée. Pendant la lecture native, le bouton **Qualité**, qui affiche la résolution courante, permet de choisir les versions vidéo disponibles dans ce flux. **Auto** privilégie la meilleure qualité annoncée. Les qualités peuvent différer entre serveurs ; HD ou FHD dans un nom n’atteste pas de la résolution réelle. Les lecteurs externes conservent leurs propres choix de qualité.

## Données locales

Les réglages et le jeton de connexion, si vous cochez **Rester connecté sur ce PC**, sont conservés dans `%LOCALAPPDATA%\NoctraDesktop`. Windows protège le jeton. Le mot de passe reste en mémoire le temps de la connexion.

Les sources, le script du setup et le test des parcours Windows accompagnent l’archive de sources. Les notices des composants sont dans `licences`.

## Portée de cette version

La parité avec toute la PWA n’est pas complète : SyncPlay, le visionnage hors connexion, la gestion intégrale des utilisateurs/plugins Jellyfin et certains outils avancés de métadonnées et de sous-titres restent absents. Les téléchargements du menu de gestion concernent ceux du serveur. Les demandes disposent désormais du mode automatique ou manuel, du serveur et du profil qualité ; le choix d’un dossier reste soumis aux droits administrateur.

Le setup n'est pas signé. Le bilan livré avec les sources distingue les fonctions présentes des vérifications réalisées et des limites connues.

