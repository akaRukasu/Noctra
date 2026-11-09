# Noctra Windows face à la PWA : état des lieux (0.6.0)

Comparaison écran par écran entre :
- **Windows** : le client natif WPF, sources de ce dossier ;
- **PWA** : la version web Noctra 200.0.176, c'est-à-dire Jellyfin Web avec les modules `public/noctra-*.js` du serveur.

Légende : ✅ présent · 🟡 partiel · ❌ absent.
La colonne « Priorité » ordonne le travail restant :
- **P1** : usage quotidien ;
- **P2** : confort et gestion courante ;
- **P3** : administration rare.

## Accueil et navigation

| Fonction | PWA | Windows | Priorité / remarque |
|---|---|---|---|
| Grand visuel (reprise, logo du titre, synopsis) | ✅ | ✅ | 0.6 : pleine largeur, défilement automatique, fondu enchaîné, points de pagination. |
| Continuer à regarder (compte connecté) | ✅ | ✅ | `Resume` du compte. Vérifié avec deux profils simulés (test d'interface). |
| Ajouts récents par médiathèque | ✅ | ✅ | Une rangée par médiathèque. |
| À suivre (30 jours) | ✅ | ✅ | `NextUp` du compte. Dédoublonné avec « Continuer ». |
| Médiathèques en 2 × 2 | ✅ | ✅ | 0.6 : tuiles illustrées (visuel d'un ajout récent). |
| Bandeau adaptatif, recherche, profil | ✅ | ✅ | 0.6 : bandeau flottant, opaque au défilement. |
| Navigation clavier et focus visible | 🟡 | 🟡 | 0.6 : anneau d'accent sur boutons et cartes, rangées qui suivent le focus. Flèches entre cartes : non (P2). |
| Retirer un titre de « Continuer à regarder » | ✅ (Jellyfin) | ❌ | P2. |

## Médiathèques, fiches, recherche

| Fonction | PWA | Windows | Priorité / remarque |
|---|---|---|---|
| Parcours, filtres vu / non vu, tris | ✅ | ✅ | Filtres par genre, année et note : PWA seulement (P2). |
| Fiche film / série, saisons, épisodes | ✅ | ✅ | 0.6 : grand visuel commun, lignes d'épisodes avec vignette, durée et progression. |
| Vu / non vu, favoris | ✅ | ✅ | |
| Distribution, titres similaires | ✅ | ✅ | |
| Badges de complétude des séries | ✅ | ✅ | `api/library/series-status`. |
| Collections et listes de lecture | ✅ | 🟡 | Collections ouvertes depuis une fiche, retirées des médiathèques. Listes de lecture : non (P3). |
| Musique, livres, photos | ✅ (Jellyfin) | ❌ | Hors périmètre vidéo (P3). |
| Recherche Jellyfin et Découverte | ✅ | ✅ | |

## Lecteur

| Fonction | PWA | Windows | Priorité / remarque |
|---|---|---|---|
| Lecture directe, décodage de secours, HLS | ✅ | ✅ | libmpv. |
| ±15 s, pistes audio, sous-titres, plein écran | ✅ | ✅ | 0.6 : barre à icônes, raccourcis indiqués. |
| Passer le générique (segments, chapitres) | ✅ | ✅ | Bouton seulement si un marqueur existe. |
| Rapports démarrage / progression / arrêt | ✅ | ✅ | Ordre vérifié par le test d'interface. |
| Apparence des sous-titres (taille, fond) | ✅ | 🟡 | Réglages de profil partiels (P2). |
| Recherche et téléchargement de sous-titres | ✅ (Jellyfin) | ❌ | P2. |
| Vignettes de la barre de progression (trickplay) | ✅ (Jellyfin 10.9+) | ❌ | P2 : fort effet « plateforme ». |
| Épisode suivant automatique en fin d'épisode | 🟡 (carte « À suivre » web) | ❌ | Non prioritaire : tu as préféré « Passer le générique » à un bouton d'épisode suivant. |
| SyncPlay (visionnage à plusieurs) | ✅ | ❌ | P2. |
| Lecture hors connexion | ❌ (web) | ❌ | Prévu dans la demande, P3. |

## TV et sports

| Fonction | PWA | Windows | Priorité / remarque |
|---|---|---|---|
| Chaînes réunies, pays, variantes par serveur | ✅ | ✅ | Regroupement testé : 18 variantes conservées. |
| Sports et PPV séparés | ✅ | ✅ | |
| Choix manuel, secours manuel visible | ✅ | ✅ | |
| Qualité réelle (image décodée) | ✅ (200.0.176 : « Auto · 1080p ») | ✅ | La vérification mpv exige une image qui avance. |
| Guide des programmes (maintenant / ensuite) | ✅ | ❌ | P2 : l'API fournit déjà `epgUrl`. |
| Favoris TV | ✅ | ❌ | P2. |
| Multivue | ✅ (9) | ✅ (4) | |
| Diagnostic du lecteur TV | ✅ | 🟡 | État et qualité seulement (P3). |
| Lecteurs web tiers, blocage pub, audio vers Noctra | 🟡 (iframe) | ✅ | Plus abouti sous Windows. |

## Découverte, demandes, gestion

| Fonction | PWA | Windows | Priorité / remarque |
|---|---|---|---|
| Découverte, catégories, détail, roulette | ✅ | ✅ | |
| Demandes (auto / manuel, serveur, profil) | ✅ | ✅ | Choix du dossier réservé aux administrateurs. |
| Suivi des demandes | ✅ | ✅ | |
| Téléchargements serveur (qBittorrent) | ✅ | ✅ | Envoi d'un fichier .torrent : PWA seulement (P3). |
| Fichiers, corbeille | ✅ | ✅ | |
| Radarr / Sonarr, recherche de versions | ✅ | ✅ | |
| Complétude, doublons, identification d'un média | ✅ | ❌ | P3 (outils avancés de métadonnées). |
| Prowlarr | ✅ | ✅ | |
| Sources TV et accès LiveWatch | ✅ | ✅ | |
| Administration Jellyfin (comptes, extensions, médiathèques) | ✅ | 🟡 | Comptes, accès, tâches, actualisation. Extensions et configuration : non (P3). |
| Sessions, télécommande, Chromecast | ✅ | ✅ | Chromecast physique : non validé. |

## Ce que fait la 0.6.0

1. **Esthétique (priorité de l'utilisateur)** : refonte visuelle complète de l'accueil, des fiches, des médiathèques, du bandeau, du lecteur, des messages et de la connexion.
2. **Parcours principaux sécurisés** par le test d'interface existant, qui passe sur une machine Windows à chaque envoi. Il couvre deux profils, la reprise de Teen Wolf, « À suivre », vu / non vu et le retour du lecteur.
3. **Suite (P2)** : guide des programmes TV, favoris TV, vignettes de progression, recherche de sous-titres, SyncPlay.
