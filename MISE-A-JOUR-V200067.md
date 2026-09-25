# Noctra 200.0.67

## Corrections
- Carrousels mobiles : suppression du déplacement CSS qui s’ajoutait au défilement natif de Jellyfin et tronquait le rail. La boucle utilise désormais la position et la commande de défilement natives, sans remplacer les cartes ni leurs actions.
- Hauteur mobile : les dimensions transitoires du viewport vidéo ne sont plus conservées en pixels. L’application installée utilise la hauteur complète de son écran ; le navigateur conserve sa hauteur dynamique. Le clavier reste pris en compte séparément.
- Nouvelle synchronisation lors de l’entrée/sortie de lecture, des changements de plein écran et du retour à l’application. Le conteneur vidéo et les commandes de l’application installée utilisent la même hauteur.

## Vérification
Syntaxe vérifiée. Tests de régression : 100 passages aux extrémités avec la commande native, hauteur temporairement réduite pendant le plein écran, ouverture/fermeture du clavier et retour au navigateur.
Ces tests sont simulés : ils ne remplacent pas un essai sur l’iPhone physique concerné. Aucun déploiement effectué. Les réglages de lecture TV/VOD de la version précédente sont conservés.

## Installation
Installer cette archive complète avec la procédure habituelle, puis fermer et rouvrir Noctra. Vérifier que la version affichée est 200.0.67.
