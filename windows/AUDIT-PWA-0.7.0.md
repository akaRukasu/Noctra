# Noctra Windows face à la PWA : état des lieux (0.7.0)

Comparaison écran par écran entre :
- **Windows** : le client natif WPF, sources de ce dossier ;
- **PWA** : la version web Noctra 200.0.176, c'est-à-dire Jellyfin Web avec les modules `public/noctra-*.js` du serveur.

Légende : ✅ présent · 🟡 partiel · ❌ absent.

## Accueil et navigation

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Grand visuel, continuer à regarder, ajouts récents, à suivre | ✅ | ✅ | |
| Médiathèques en 2 × 2 (films, séries, musique, photos) | ✅ | ✅ | 0.7 : musique et photos ouvertes dans leur propre vue. |
| Aperçu au survol d'une affiche | ❌ | ✅ | 0.7 : visuel, note, durée, synopsis, lecture, fiche, favori. |
| Retirer de « Continuer à regarder », menu clic droit | ✅ | ✅ | 0.7 : + ajouter à une liste, télécharger sur ce PC, lancer pour le groupe. |
| Épisodes non vus sur les cartes de séries | ✅ | ✅ | 0.7 |

## Médiathèques, fiches, recherche

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Filtres vu / non vu, genre, année, note ; tris | ✅ | ✅ | 0.7 : genre, année, note, mieux notés, durée, hasard. |
| Fiche : badges techniques (4K, HDR, Dolby Vision, Atmos, 5.1…) | 🟡 | ✅ | 0.7 |
| Fiche technique (fichier, pistes, sous-titres) | ✅ | ✅ | 0.7 |
| Heure de fin, slogan, liens IMDb / TMDb | ✅ | ✅ | 0.7 |
| Bandes-annonces | ✅ | ✅ | 0.7 : locales dans le lecteur, YouTube dans le navigateur. |
| Pages des personnes (filmographie) | ✅ | ✅ | 0.7 |
| Collections | ✅ | ✅ | |
| Listes de lecture (créer, ajouter, retirer, lire, supprimer) | ✅ | ✅ | 0.7 |
| Musique (albums, artistes, titres, file, paroles) | ✅ | ✅ | 0.7 : paroles synchronisées (Jellyfin 10.9+). |
| Photos | ✅ | ✅ | 0.7 : visionneuse, flèches gauche / droite. |
| Livres | ✅ | ❌ | Renvoi vers la PWA (lecteur EPUB / PDF du navigateur). |

## Lecteur

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Lecture directe, flux adapté, ±15 s, pistes, plein écran | ✅ | ✅ | |
| Passer le générique | ✅ | ✅ | |
| Vignettes de la barre de progression (trickplay) | ✅ | ✅ | 0.7 (Jellyfin 10.9+, si les vignettes sont générées). |
| Sous-titres externes (.srt, .ass) | ✅ | ✅ | 0.7 : servis à part par Jellyfin, jamais incrustés. |
| Recherche et téléchargement de sous-titres | ✅ | ✅ | 0.7 (extension de sous-titres du serveur requise). |
| Apparence des sous-titres (taille, couleur, style, position) | ✅ | ✅ | 0.7 |
| Vitesse, décalage audio / sous-titres, format d'image, chapitres | ✅ | ✅ | 0.7 |
| Statistiques de lecture | ✅ | ✅ | 0.7 (touche I). |
| Image dans l'image | ✅ | ✅ | 0.7 : mini-lecteur au premier plan (touche P). |
| SyncPlay (regarder ensemble) | ✅ | ✅ | 0.7 : compatible avec les autres clients Jellyfin. |
| Télécommande de ce client depuis un autre appareil | ✅ | ✅ | 0.7 |
| Épisode suivant automatique | 🟡 | ❌ | Volontairement absent (tu as préféré « Passer le générique »). Les listes et albums enchaînent. |
| Lecture hors connexion | ❌ | ✅ | 0.7 : fichier copié sur le PC, reprise reportée au serveur. |

## TV et sports

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Chaînes, pays, serveurs, PPV, qualité réelle, guide, favoris | ✅ | ✅ | |
| Multivue | ✅ (9) | ✅ (4) | |
| Diagnostic du lecteur TV | ✅ | ✅ | 0.7 : statistiques aussi en direct. |

## Compte

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Quick Connect : se connecter avec un code | ✅ | ✅ | 0.7 |
| Quick Connect : autoriser un autre appareil | ✅ | ✅ | 0.7 |
| Changer le mot de passe | ✅ | ✅ | 0.7 |

## Découverte, demandes, gestion

| Fonction | PWA | Windows | Remarque |
|---|---|---|---|
| Découverte, demandes, suivi, roulette | ✅ | ✅ | |
| Téléchargements serveur, envoi de .torrent, fichiers, corbeille | ✅ | ✅ | |
| Doublons, complétude des sagas et séries | ✅ | ✅ | |
| Correction d'identification d'un média | ✅ | ✅ | 0.7 |
| Stockage du serveur | ✅ | ✅ | 0.7 |
| Radarr / Sonarr, Prowlarr, sources TV | ✅ | ✅ | |
| Administration Jellyfin : comptes, tâches, extensions, journal, appareils, dossiers, redémarrage | ✅ | ✅ | 0.7 |
| Administration Jellyfin : catalogue d'extensions, transcodage, réseau, clés d'API | ✅ | ❌ | Réglages rares du serveur : tableau de bord Jellyfin. |
