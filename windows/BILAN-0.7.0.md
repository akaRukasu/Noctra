# Noctra Windows 0.6.0 — bilan

## Ce qui change

**Interface (refonte complète)**
- **Palette** : nuit profonde, accents violet → cyan.
  - Bouton principal blanc, lisible sur tous les visuels.
  - Survols animés, anneau d'accent au clavier, cases à cocher, champs et listes harmonisés.
- **Bandeau** : il flotte sur les visuels et devient opaque dès que la page défile.
  - Onglets en texte, avec un trait d'accent sur l'onglet actif.
  - Recherche avec loupe, avatar en dégradé.
  - Les contrôles et alignements vérifiés par le test (920 à 2 560) sont conservés.
- **Accueil** : grand visuel en pleine largeur, sous le bandeau.
  - L'image garde ses proportions, calée à droite sur un fond flouté du même visuel, avec des fondus vers la page.
  - Logo du titre, synopsis, léger zoom arrière à l'apparition.
  - Défilement automatique (9 s), en pause au survol, au focus clavier et quand la fenêtre est inactive. Fondu enchaîné, flèches et points de pagination.
- **Rangées et cartes** :
  - titres plus nets ;
  - flèches discrètes, défilement horizontal animé ;
  - cartes agrandies au survol, avec liseré ; visuels en fondu ;
  - progression en dégradé, coche « vu » ;
  - flèches gauche / droite au clavier entre les cartes ;
  - clic droit : voir la fiche, vu / non vu, favori, **retirer de « Continuer à regarder »**.
- **Médiathèques** : tuiles illustrées en 2 × 2 (visuel d'un ajout récent), zoom au survol.
- **Fiches** : grand visuel commun ; épisodes en lignes aérées (vignette, durée, progression, survol).
- **TV** :
  - menu latéral discret ;
  - cartes de chaînes et de serveurs harmonisées, survol animé ;
  - **guide « Maintenant / Ensuite »** avec l'avancement du programme (`api/tv/programme`, comme la PWA) ;
  - **favoris TV** : étoile sur la fiche, favorites en tête de liste avec un badge, par profil.
- **Découverte** : fiche en pleine largeur, affiches animées au survol.
- **Toutes les fonctions** : tuiles avec icône. **Profil** : en-tête avec avatar.
- **Lecteur** :
  - barre à icônes (lecture / pause, −15 / +15, audio, sous-titres, plein écran, diffuser), raccourcis indiqués ;
  - commandes sur fond dégradé (flottantes en plein écran et en direct).
- **Messages** :
  - chargement discret (texte et barre animée) ;
  - états vides et erreurs avec icône ;
  - notifications en pastille qui s'effacent seules.
- **Changement de page** en fondu ; rangées de l'accueil qui apparaissent l'une après l'autre.

**Accessibilité et tests** : les noms accessibles des boutons sont inchangés (« ▶   Lire », « Pause » / « Reprendre », « ♡  Ajouter aux favoris »…). Les icônes sont décoratives.

## Vérifications

Elles sont faites par l'action **Noctra Windows** sur une machine Windows de GitHub, avec une API locale simulée (aucun serveur réel) :
- construction ;
- tests de protocole : Cast TLS simulé, regroupement TV, 18 variantes ;
- publication x64 autonome ;
- setups ;
- test de l'interface : deux profils, Teen Wolf, reprises, vu / non vu, favoris, recherche, demandes, TV, qualités HLS 360p, 720p et 1080p, multivue, administration ;
- captures.

Résultats détaillés : voir le message de livraison.

## Limites

- **Pas vérifié sur ton PC** : écran à haute fréquence, GPU réel, Chromecast physique, HDR, fournisseurs TV réels, audio DLStreams. La machine de GitHub n'a ni sortie audio ni GPU.
- **Toujours absent par rapport à la PWA** (voir AUDIT-PWA-0.7.0.md) : SyncPlay, hors connexion, vignettes de progression, recherche de sous-titres, administration Jellyfin complète, outils avancés de métadonnées.
