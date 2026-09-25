# Noctra 200.0.72

## Interface TV

Nouvelle composition sur grand écran : navigation des sources en colonne latérale, lecteur et zapping au premier plan, filtres pleine largeur, typographie agrandie, fonds et panneaux harmonisés. Les éléments et leurs événements restent en place : la refonte visuelle ne recrée pas les lecteurs. Les bandeaux de sous-menus utilisent deux côtés symétriques pour centrer leur titre indépendamment du dock.

## Multiview externe

Le lecteur externe utilisait une sandbox opaque différente du lecteur simple. Il appelle maintenant la même fonction de configuration par fournisseur et utilise la même politique de référent. Les pages préparées sur l'origine Noctra restent isolées conformément à cette fonction. La sélection d'un lecteur externe ne récupère plus un ancien flux HLS encore présent dans la liste des options.

Cette correction ne contourne pas les restrictions du fournisseur. Un site qui refuse réellement le domaine Noctra ou les lectures simultanées peut encore afficher « NOT ALLOWED ». Le lien d'ouverture externe reste disponible.

## Chrome et mobile

- Carrousels PC : l'API de déplacement Jellyfin et sa position sont prioritaires ; aucun déplacement CSS concurrent n'est ajouté lorsque cette API existe. L'animation respecte le mode immédiat de cette API. Le défilement vertical animé désactive le lissage CSS pendant ses propres déplacements.
- TV mobile : panneau à la hauteur de l'application, en-tête dans le flux et une zone de défilement flexible. Les hauteurs maximales internes du lecteur sont retirées hors plein écran.
- La sélection de l'onglet Lecteur fait défiler uniquement le corps du panneau, évitant de déplacer les ancêtres et de masquer le haut de l'écran.
- Plein écran : priorité conservée à la vidéo native. Sur iPhone avec lecteur externe, ou après refus de l'API vidéo, le bouton agrandit la case dans l'application sans déplacer ni recharger l'iframe. Le même bouton permet de quitter cet agrandissement. Il ne s'agit pas du plein écran natif iOS ; les limites du navigateur et du fournisseur subsistent.

## Movix et RénéVéo

- Movix, Northlive et RénéVéo entrent dans le garde-fou de démarrage : tentative de secours disponible lorsque le direct n'arrive pas à démarrer, avec prolongation bornée si les données progressent. Les paramètres de décodage et les réserves existantes sont conservés.
- Une URL Movix mal formée ou non HTTP(S) est ignorée sans faire échouer toute la liste des serveurs.
- Les indicateurs d'activation RénéVéo acceptent les formes true/TRUE/1. Si tous les manifestes HLS testés échouent, les options de lecteur web publiées restent disponibles au lieu d'être perdues dans une erreur globale. Les options manuelles restent identifiées comme telles.

## Vérifications

Suite automatisée de régression réussie : lecture TV/Jellyfin, Multiview, résolution et annulation, carrousels et grilles. Tests ajoutés pour l'API de carrousel, la politique d'iframe Multiview et le maintien des lecteurs web RénéVéo après échec HLS. Tests plein écran ajustés pour vérifier l'agrandissement après refus natif.

Contrôles locaux de mise en page avec les feuilles de style réelles et une page représentative, sans flux : disposition latérale à 1440 px, panneau mobile de 844 px avec en-tête accessible et corps défilant. Aucun essai physique sur iPhone, aucune comparaison manuelle complète Firefox/Chrome et aucun test d'endurance des flux Movix/RénéVéo effectués pour cette version. Ces points restent à confirmer après installation.

Installer l'archive complète selon la procédure habituelle, conserver configuration et données, redémarrer puis recharger le client. Version et cache 200.0.72. Aucun déploiement effectué pendant cette intervention.
