# Noctra sur Samsung UE40H6400 (Smart TV 2014) — guide d'installation

Ce guide vaut pour la Samsung **UE40H6400** et, en principe, pour les autres Smart TV Samsung de 2014 (série H : H5500, H6200, H6400, H6500, H7000…).

> **Avant de commencer.** Cette version n'a encore été essayée sur **aucun téléviseur réel**, ni sur un émulateur Samsung. Elle a été vérifiée par des tests automatiques dans un navigateur qui imite ce téléviseur (voir le rapport de compatibilité). Le premier essai sur votre téléviseur est donc aussi le premier essai réel. Si quelque chose ne marche pas, notez le message affiché (ou prenez une photo de l'écran) : il dit en général où se situe le problème.

## 1. Ce qu'il faut savoir

- **Ce téléviseur n'utilise pas Tizen.** Les Samsung de 2010 à 2014 utilisent l'ancienne plateforme « Orsay » (Smart Hub de 2014). Tizen n'est arrivé qu'en 2015. Les applis Tizen (`.wgt`) ne s'y installent pas. Le **2910** affiché dans le menu Assistance est le numéro de version du logiciel du téléviseur, pas une version de Tizen.
- **Noctra n'est pas sur la boutique Samsung.** On l'installe avec la fonction développeur du Smart Hub, « **User App Sync** ». Le téléviseur télécharge l'appli depuis un ordinateur de votre réseau.
- **Un ordinateur n'est nécessaire que pendant l'installation** (et pour les mises à jour). Une fois installée, l'appli reste sur le téléviseur et se connecte seule au serveur Noctra.
- **Le relais.** Ce téléviseur refuse la connexion sécurisée (HTTPS) au serveur Noctra : ses certificats datent de 2014. La solution recommandée est le **relais installé sur la seedbox** (chapitre 7) : elle est toujours allumée, il n'y a rien à laisser allumé chez vous. Un relais sur un PC, un NAS ou un Raspberry Pi de la maison reste possible (chapitre 7 bis).

## 2. Contenu du kit

Décompressez `Noctra-Samsung-2014-<version>.zip` sur l'ordinateur, par exemple dans `Documents\Noctra-Samsung-2014`.

| Fichier | Rôle |
|---|---|
| `Noctra.zip` | l'appli pour le téléviseur. **Ne la décompressez pas.** |
| `widgetlist.xml` | liste lue par le téléviseur (modèle ; les serveurs du kit la créent eux-mêmes) |
| `serveur/Installer sur le televiseur.cmd` | Windows : serveur d'installation, sans rien installer d'autre |
| `serveur/Installer-Noctra-Samsung2014.ps1` | le script PowerShell lancé par le fichier ci-dessus |
| `serveur/noctra-samsung2014.mjs` | serveur d'installation et relais local (Node.js : Windows, macOS, Linux, Raspberry Pi) |
| `serveur/Relais local (Node.js).cmd` | Windows : lance le relais local |
| `serveur/noctra-relais.service` | Linux / Raspberry Pi : relais lancé au démarrage |
| `RAPPORT-COMPATIBILITE-UE40H6400.md` | ce qui marche, ce qui est adapté, ce qui ne l'est pas |

## 3. Préparer l'ordinateur

L'ordinateur et le téléviseur doivent être **sur le même réseau** (même box, en Wi-Fi ou par câble).

1. **Notez l'adresse IP de l'ordinateur.**
   - Windows : touche Windows, tapez `cmd`, Entrée, puis `ipconfig`. Notez l'« Adresse IPv4 », par exemple `192.168.1.20`.
   - macOS : Réglages Système › Réseau.
   - Les serveurs du kit affichent aussi cette adresse au démarrage.
2. **Lancez le serveur d'installation.** Le téléviseur cherche toujours l'appli sur le **port 80** : ce serveur doit être lancé en administrateur.
   - **Windows (le plus simple)** : double-cliquez sur `serveur\Installer sur le televiseur.cmd`. Acceptez la demande d'administrateur. Une fenêtre affiche « Serveur d'installation Noctra prêt » et l'adresse à saisir sur le téléviseur. Le script autorise lui-même le port 80 dans le pare-feu, pour les réseaux privés.
   - **Avec Node.js** (Windows, macOS, Linux) : installez Node.js 18 ou plus récent depuis <https://nodejs.org>, puis dans un terminal, depuis le dossier du kit :
     - Windows, en administrateur : `node serveur\noctra-samsung2014.mjs installer`
     - macOS / Linux : `sudo node serveur/noctra-samsung2014.mjs installer`
3. **Laissez la fenêtre ouverte** pendant l'installation. Chaque demande du téléviseur s'y affiche, ce qui permet de suivre l'avancement.

Si la fenêtre indique « Port 80 déjà utilisé », fermez le programme qui l'occupe (Skype ancien, IIS, un autre serveur web), puis relancez.

## 4. Préparer le téléviseur

1. **Connectez-le à Internet** : Menu › Réseau › Paramètres réseau. Vérifiez ensuite dans Menu › Réseau › État du réseau que la connexion à Internet est indiquée.
2. **Mettez-le à l'heure** : Menu › Système › Heure › Horloge, en mode Auto. Une date fausse fait échouer les connexions sécurisées.
3. **Ouvrez la session développeur du Smart Hub.** C'est ce compte qui active « User App Sync ».
   - Menu › **Fonctions Smart** › **Compte Samsung** › **Connexion**. Les intitulés peuvent varier un peu selon la version du logiciel.
   - Choisissez de saisir un identifiant. **Identifiant : `develop`**.
   - **Mot de passe** : selon les versions, le champ reste vide ou un mot de passe est demandé. Pour les modèles 2014, les guides de la communauté indiquent `sso1029dev!`. Je n'ai pas pu vérifier cette information à une source officielle.
   - Si la connexion ne tient pas, ouvrez le Smart Hub, allez dans la section **Jeux** (Games), puis connectez-vous de là avec le même identifiant.

## 5. Installer Noctra (User App Sync)

1. Appuyez sur la touche **Smart Hub** de la télécommande (le bouton multicolore).
2. Allez dans **Applis** (ou « Mes applis ») et placez-vous sur n'importe quelle appli.
3. **Maintenez la touche OK (Entrée) enfoncée environ 3 secondes.** Un menu apparaît, avec « IP Setting » et « Start User App Sync ».
4. Choisissez **IP Setting** et saisissez l'adresse IP de l'ordinateur (par exemple `192.168.1.20`), avec les chiffres de la télécommande.
   - Si le pavé de saisie se bloque, déplacez-vous sur la case suivante, puis revenez : la saisie reprend.
5. Maintenez de nouveau **OK** environ 3 secondes sur une appli, puis choisissez **Start User App Sync**.
6. Sur l'ordinateur, la fenêtre du serveur affiche `GET /widgetlist.xml`, puis `GET /Noctra.zip`. Sur le téléviseur, un message indique la fin de l'installation.
7. Quittez le Smart Hub, puis rouvrez-le. **Noctra** apparaît dans les applis, souvent en fin de liste. Vous pouvez le déplacer (touche TOOLS ou maintien de OK › Déplacer).
8. Fermez le serveur d'installation sur l'ordinateur. Il ne sert plus.

L'appli installée par le réseau reste sur le téléviseur après une mise hors tension. Une installation par clé USB, elle, n'est pas conservée sur ces modèles. N'utilisez pas cette méthode.

## 6. Premier lancement

1. Ouvrez **Noctra** depuis le Smart Hub.
2. L'appli vérifie le serveur Noctra (`https://akarukasu.astra.usbx.me/noctra`).
   - **Si l'écran de connexion Jellyfin s'affiche**, tout va bien. Passez à l'étape 3.
   - **Si « Connexion sécurisée impossible » s'affiche avec « Utiliser HTTP »**, le téléviseur refuse le certificat, mais le serveur répond aussi en HTTP simple. « Utiliser HTTP » marche sans aucun autre appareil. Les échanges ne sont alors pas chiffrés : connectez-vous avec Quick Connect plutôt qu'avec votre mot de passe. Le relais local (chapitre 7) reste la solution chiffrée.
   - **Si « Connexion impossible » s'affiche** avec un message sur la connexion sécurisée (HTTPS), le téléviseur refuse le certificat et le serveur ne répond pas en HTTP (redirection vers HTTPS chez l'hébergeur). Suivez le chapitre 7 (relais sur la seedbox), puis revenez ici.
3. **Connexion Jellyfin** : un code **Quick Connect** s'affiche. Sur votre téléphone ou votre PC, ouvrez Jellyfin › Paramètres › Quick Connect, puis saisissez ce code. Le téléviseur se connecte seul. Vous pouvez aussi entrer vos identifiants : appuyez sur OK sur un champ pour ouvrir le clavier à l'écran.
4. La session est mémorisée. Aux lancements suivants, l'accueil Noctra s'ouvre directement.

## 7. Relais sur la seedbox (recommandé)

Le téléviseur parle en HTTP simple à un relais qui tourne sur la seedbox. Ce relais transmet tout en HTTPS au serveur Noctra et à Jellyfin, sur la même machine. Il ne relaie que vers votre serveur. Les échanges entre le téléviseur et la seedbox ne sont pas chiffrés : connectez-vous avec Quick Connect, et limitez l'accès à votre box (étape 4).

1. Mettez le serveur Noctra à jour en **200.0.148** ou plus récent (`noctra-update`, comme d'habitude).
2. En SSH sur la seedbox (`ssh akarukasu@astra.usbx.me`), dans le dossier de Noctra :
   ```bash
   bash ultra/install-relais-samsung2014.sh
   ```
   Le script choisit un port libre de votre slot (`app-ports free`), installe le service `noctra-relais-tv` (relancé tout seul), puis affiche l'adresse à saisir sur le téléviseur, par exemple `169.150.243.3:12345`. Pour imposer un port : `bash ultra/install-relais-samsung2014.sh 12345`.
3. **Vérifiez l'accès depuis Internet** : sur un téléphone en 4G (Wi-Fi coupé), ouvrez `http://astra.usbx.me:<port>/noctra/health`. Un texte contenant « Noctra » doit s'afficher. Sinon, ce port n'est pas ouvert : relancez le script avec un autre port de `app-ports free`.
4. **Conseillé** : limitez l'accès à votre box. Depuis un appareil de la maison, notez votre adresse publique sur <https://ifconfig.me>, puis lancez `bash ultra/install-relais-samsung2014.sh <port> --autoriser <adresse>`. Si votre box change d'adresse, relancez cette commande avec la nouvelle.
5. Sur le téléviseur, dans Noctra : **Utiliser un relais local**, OK sur le champ, puis saisissez `169.150.243.3:<port>` avec les chiffres de la télécommande (le « . » et le « : » sont sur le clavier à l'écran). Validez.

Suivi : `systemctl --user status noctra-relais-tv`, journal dans `logs/relais-tv.log`. Désinstallation : `bash ultra/install-relais-samsung2014.sh --desinstaller`.

## 7 bis. Relais local (sur un appareil de la maison)

**Pourquoi.** Le téléviseur de 2014 ne connaît pas les autorités de certification actuelles. Il peut donc refuser la connexion HTTPS au serveur Noctra, alors même qu'Internet fonctionne. Le relais règle ce problème. Le téléviseur lui parle en HTTP simple, uniquement à l'intérieur de la maison. Le relais, lui, parle en HTTPS au serveur Noctra. Il n'accepte que les appareils du réseau local.

**Où le faire tourner.** Sur un appareil **toujours allumé quand vous regardez la télévision** :
- un **Raspberry Pi** ou un **NAS** : la solution la plus durable (faible consommation, toujours en marche) ;
- sinon, un PC Windows ou un Mac, qui ne doit pas se mettre en veille pendant ce temps.

Donnez à cet appareil une **adresse IP fixe**. Dans l'interface de votre box, cherchez « bail DHCP statique » ou « réservation d'adresse ». Sinon, l'adresse peut changer et le téléviseur ne trouvera plus le relais.

### Windows
1. Installez **Node.js** 18 ou plus récent (<https://nodejs.org>, version « LTS »).
2. Double-cliquez sur `serveur\Relais local (Node.js).cmd`. Acceptez la demande du pare-feu Windows. Si une fenêtre du relais est déjà ouverte, n'en ouvrez pas une seconde. Si le port 8095 est pris, le relais prend le suivant (8096…) : utilisez l'adresse qu'il affiche.
3. La fenêtre affiche « serveur Noctra joint », puis l'adresse à saisir sur le téléviseur, par exemple `192.168.1.20:8095`. Laissez-la ouverte.
4. Pour que le relais démarre seul : Planificateur de tâches › Créer une tâche › Déclencheur « À l'ouverture de session » › Action « Démarrer un programme » › le fichier `.cmd` ci-dessus.

### Raspberry Pi, NAS ou PC Linux
1. Installez Node.js 18 ou plus récent (`sudo apt install nodejs`, ou depuis nodejs.org).
2. Copiez le dossier du kit, par exemple dans `/home/pi/Noctra-Samsung-2014`.
3. Essai : `node /home/pi/Noctra-Samsung-2014/serveur/noctra-samsung2014.mjs relais`.
4. Service permanent : copiez `serveur/noctra-relais.service` dans `/etc/systemd/system/` et adaptez le chemin et l'utilisateur. Ensuite : `sudo systemctl daemon-reload && sudo systemctl enable --now noctra-relais`.

### Sur le téléviseur
1. Dans Noctra, écran « Connexion impossible », choisissez **Utiliser un relais local**. Une fois connecté, ce réglage se trouve aussi dans le menu du compte (votre nom, en haut à droite) › **Paramètres de l’appli** › **Serveur et relais local (Samsung 2014)**.
2. Appuyez sur **OK** sur le champ. Saisissez l'adresse du relais, par exemple `192.168.1.20:8095`. Les chiffres se tapent directement avec la télécommande ; « . » et « : » se trouvent sur le clavier à l'écran. Validez.
3. Noctra se connecte par le relais. Ce réglage est mémorisé.

Options du relais : `--serveur https://…/noctra` (autre serveur), `--port 8095` (autre port).

## 8. Utilisation à la télécommande

| Touche | Action |
|---|---|
| ◀ ▲ ▼ ▶, **OK** | navigation, validation ; OK sur un champ ouvre le clavier à l'écran |
| **RETURN** | retour, fermeture d'une fenêtre ou du lecteur ; à l'accueil, retour au Smart Hub |
| **EXIT** | quitte Noctra (le lecteur et les relais du serveur sont arrêtés) |
| **CH ▲ / CH ▼**, ▲ ▼ en lecture | chaîne précédente / suivante |
| **0–9** | numéro de chaîne pendant un direct ; chiffres dans un champ |
| **TOOLS**, **CH LIST**, ◀ en lecture | liste des chaînes |
| ▶ en lecture d'un direct | liste des serveurs |
| ▶ ‖ ■ ◀◀ ▶▶ | lecture, pause, arrêt, recul et avance (films) |
| **INFO** | bandeau de la chaîne (programme en cours et suivant) |
| Volume, Muet | gérés par le téléviseur, comme d'habitude |

**Multiview** : le téléviseur n'a qu'un décodeur vidéo. Le serveur Noctra compose donc les chaînes en une seule image (9 au plus). ◀ ▲ ▼ ▶ choisit une case. OK ouvre un menu : écouter cette chaîne, la mettre en avant, changer de serveur, ajouter une chaîne, la retirer. RETURN quitte le multiview. Chaque changement recompose l'image : comptez quelques secondes.

## 9. Mise à jour

1. Décompressez le nouveau kit sur l'ordinateur.
2. Lancez le serveur d'installation (chapitre 3).
3. Sur le téléviseur : Smart Hub › maintenir OK sur une appli › **Start User App Sync**. L'adresse IP déjà saisie est conservée : ne la changez que si l'ordinateur a une autre adresse.
4. L'ancienne version est remplacée. Le serveur choisi, le relais et la session Jellyfin sont mémorisés par l'appli (aussi dans un fichier de l'appli). Si une reconnexion est demandée, refaites Quick Connect.
5. Si vous utilisez le relais local, remplacez aussi `serveur/noctra-samsung2014.mjs` sur l'appareil du relais, puis redémarrez-le.

## 10. Désinstallation

1. Sur le téléviseur : Smart Hub › placez-vous sur **Noctra** › touche **TOOLS** (ou maintien de OK) › **Supprimer**.
2. Facultatif : déconnectez le compte `develop` (Menu › Fonctions Smart › Compte Samsung). Les autres applis installées par User App Sync peuvent alors disparaître.
3. Relais local, s'il y en a un :
   - Windows : supprimez la tâche planifiée, puis le dossier du kit ;
   - Linux : `sudo systemctl disable --now noctra-relais && sudo rm /etc/systemd/system/noctra-relais.service`.
4. Pare-feu Windows : la règle « Noctra installation TV » se retire avec PowerShell en administrateur : `Remove-NetFirewallRule -DisplayName 'Noctra installation TV'`.

## 11. Dépannage

| Symptôme | Cause probable et solution |
|---|---|
| « IP Setting » / « User App Sync » n'apparaissent pas | La session `develop` n'est pas ouverte : refaites le chapitre 4, étape 3 (au besoin depuis la section Jeux). Maintenez bien OK environ 3 s sur une **appli**. |
| « User App Sync is requested » puis rien ne se passe | Le téléviseur n'arrive pas à joindre le PC. 1) Regardez la fenêtre du serveur : si aucune ligne `GET /widgetlist.xml` n'apparaît, la demande n'arrive pas. 2) Sur un téléphone connecté au même Wi-Fi, ouvrez `http://<IP du PC>/widgetlist.xml` : un texte XML doit s'afficher. Sinon : pare-feu (relancez le script du kit, qui ouvre maintenant le port 80 même sur un réseau Windows « Public » ; désactivez un antivirus avec pare-feu le temps de l'installation), ou PC et téléviseur sur des réseaux différents (Wi-Fi invité, répéteur, second routeur). 3) Revérifiez l'adresse saisie dans « IP Setting » : validez chaque case avec OK. Un PC relié en Wi-Fi a souvent une autre adresse qu'en câble. |
| Rien ne s'affiche dans la fenêtre du serveur pendant la synchronisation | Mauvaise adresse IP, appareils sur des réseaux différents (Wi-Fi invité…) ou pare-feu. Vérifiez l'IP, désactivez un instant le pare-feu tiers, essayez un câble réseau. |
| La fenêtre montre `GET /widgetlist.xml` mais pas `/Noctra.zip` | Relancez « Start User App Sync » ; vérifiez que `Noctra.zip` est bien à côté du dossier `serveur` et qu'il n'a pas été décompressé. |
| Noctra n'apparaît pas après la synchronisation | Quittez et rouvrez le Smart Hub ; éteignez le téléviseur 30 s (débranché) puis rallumez. |
| L'appli reste sur « Ouverture de Noctra… » ou affiche « Fichier manquant » | Installation incomplète : refaites la synchronisation (chapitre 9). |
| « Connexion impossible » (HTTPS) | Le téléviseur refuse le certificat du serveur : mettez en place le relais local (chapitre 7). Vérifiez aussi la date et l'heure du téléviseur. |
| « Connexion impossible » avec un relais | L'appareil du relais est éteint ou en veille, le relais n'est pas lancé, ou son adresse a changé (fixez-la sur la box). |
| Les touches ne répondent plus | Appuyez sur RETURN, puis sur une flèche. Si rien ne change, quittez avec EXIT et relancez. Signalez la touche et l'écran concernés. |
| Une chaîne ne démarre pas | Noctra essaie d'abord le lecteur du téléviseur, puis le relais du serveur, puis le serveur suivant. Le journal du lecteur en bas à gauche indique l'étape. ▶ ouvre la liste des serveurs. |
| « Relais impossible : ffmpeg est absent du serveur » | ffmpeg doit être installé sur le serveur Noctra (il sert déjà à la diffusion Chromecast/AirPlay). Voir `NOCTRA_FFMPEG` dans la documentation du serveur. |
| Image saccadée sur un film | Menu du compte (votre nom, en haut à droite) › **Qualité des films** : chaque appui passe à la valeur suivante ; choisissez 12 ou 8 Mb/s. |
| Une chaîne « lecteur du site » est absente ou indisponible | Ces lecteurs demandent un navigateur récent : ils ne fonctionnent pas sur ce téléviseur (voir le rapport). |
| Le multiview reste sur « Préparation… » | Le serveur compose la mosaïque (10 à 30 s). En cas d'échec, le message affiché donne la raison. |

### Journal de diagnostic

L'appli note ce qui se passe sur le téléviseur : moteur web, touches reçues, erreurs, blocages de l'interface et requêtes lentes.
- **À l'écran** : touche **rouge (A)** de la télécommande. Un nouvel appui ferme le journal.
- **Sur la seedbox** (relais de la seedbox) : le journal est envoyé toutes les 5 s. En SSH : `tail -n 300 ~/apps/noctra/logs/tv-diagnostic.log`. Copiez le résultat pour le signaler.
- **Relais sur un PC** : fichier `tv-diagnostic.log` dans le dossier depuis lequel le relais a été lancé.

Pour signaler un problème, joignez si possible une photo de l'écran (message et journal du lecteur), la touche pressée et ce qu'affichait la fenêtre du serveur ou du relais.
