# Noctra v172

## Mediatheques

- Les quatre images d'accueil utilisent une couverture dediee au-dessus du rendu Jellyfin.
- Le proxy image meme origine remplace les URL Blob fragiles.
- Un observateur recree la couverture si Jellyfin reconstruit tardivement une carte.
- Le titre natif reste visible tant que l'image n'est pas chargee et disparait uniquement quand la couverture reelle est presente.

## Accueil

- Les fleches laissent d'abord le carrousel Jellyfin executer son defilement natif.
- Noctra ne prend le relais qu'en l'absence de mouvement reel.
- Le retour automatique en boucle et le forçage des boutons actifs ont ete retires.
- Le chargement progressif des films reste disponible a l'approche de la fin.

## TV - Chaines

- Toutes les chaines HLS directes partagent desormais le profil stable, quel que soit leur fournisseur.
- La lecture commence apres un objectif de 12 secondes de tampon.
- La position live reste a trois segments du bord, quatre sur connexion faible, sans acceleration de rattrapage.
- Le tampon avant est borne a 30 secondes et le plafond a 45 secondes.
- Une attente ordinaire ne relance plus le chargeur HLS et n'augmente plus artificiellement la latence.
- Les reprises reseau et les renouvellements d'URL propres a chaque fournisseur sont conserves.

## Compatibilite

- Les boutons Cast et SyncPlay conservent leur rendu d'origine.
- Le Multiview conserve son profil separe pour les flux simultanes.
