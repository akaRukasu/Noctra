NOCTRA UPDATER PC V8
====================

OBJECTIF
--------
Le script choisit automatiquement la version Noctra la plus recente presente
dans C:\Users\akaru\Downloads, l'envoie sur Ultra.cc, conserve le .env,
installe la version, redemarre le service et controle /health. Il verifie
ensuite tout ce dont Noctra a besoin sur le serveur (diagnostic).

NOUVEAU DANS LA V8
------------------
- Nouveau serveur : astra.usbx.me (au lieu de merlion.usbx.me).
- .env adapte automatiquement sur le serveur : adresses de l'ancien serveur
  remplacees, port local de qBittorrent corrige d'apres sa configuration.
- Seedbox deplacee sans le dossier Noctra : premiere installation complete
  (fichiers, service, proxy Ultra.cc, port libre) avec le .env garde dans ce
  dossier (.env.merlion). Ce fichier n'est envoye que dans ce cas, puis
  efface du serveur apres l'installation.
- Service ou proxy Ultra.cc manquant apres le deplacement : recrees.
- Nouvelle empreinte du serveur acceptee automatiquement (premiere connexion).
- Verification depuis Internet : https://akarukasu.astra.usbx.me/noctra/health
- Diagnostic complet apres chaque mise a jour, ou seul avec
  DIAGNOSTIC-NOCTRA-V8.cmd : Node.js, outils, espace disque, installation,
  .env (cles presentes, sans afficher leur valeur), service, proxy, Noctra en
  local et depuis Internet, Jellyfin (et sa cle d'API), qBittorrent
  (identifiants), Sonarr, Radarr, Prowlarr, Jellyseerr, TMDB, mises a jour et
  dernieres erreurs. Rapport enregistre dans ce dossier :
  RAPPORT-NOCTRA-<date>.txt, sans aucune cle ni mot de passe.

UTILISATION
-----------
1. Extraire le dossier (garder les fichiers ensemble, avec .env.merlion).
2. Mettre le ZIP noctra-media-client-vXXX.zip dans Telechargements.
3. Lancer LANCER-MISE-A-JOUR-NOCTRA-V8.cmd et confirmer avec O.
   Diagnostic seul : DIAGNOSTIC-NOCTRA-V8.cmd.

La cle SSH de la V6/V7 est reutilisee. Si le nouveau serveur ne la connait pas
encore, le script demande le mot de passe Ultra.cc une seule fois pour
l'installer.

En cas d'echec : DERNIERE-ERREUR-NOCTRA.txt (journal SSH complet) et
RAPPORT-NOCTRA-<date>.txt.
