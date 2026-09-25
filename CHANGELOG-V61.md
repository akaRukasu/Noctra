# Noctra v61

## Dock utilisateur

- Les quatre raccourcis membre **Accueil / Médiathèques / Demandes / TV** utilisent désormais la même géométrie compacte que les cellules du dock administrateur.
- Le bouton TV n'a plus de largeur, hauteur ou grille spécifique susceptible de le détacher visuellement des trois autres actions.
- Les actions administrateur restent physiquement retirées pour les comptes standards.

## WiTV — lecteur direct et serveurs

- Chaque chaîne WiTV passe maintenant par le résolveur public Noctra au clic.
- Les iframes publiquement exposées par la page de la chaîne sont proposées directement comme **Serveur 1 / Serveur 2 / …**.
- Lorsque plusieurs lecteurs sont exposés, le changement de serveur se fait directement sous le nom de la chaîne dans Noctra.
- Un **Mode compatibilité** reste proposé en dernier choix et recharge la page publique WiTV lorsqu'un lecteur refuse de fonctionner isolément.
- Le résolveur réutilise les en-têtes publics associés à la page de référence et tente de récupérer le numéro de serveur depuis le HTML autour de chaque iframe.

## OHA

- Sur PC, le navigateur OHA utilise une hauteur bornée afin de supprimer le grand espace vide sous la zone utile.
- Sur mobile, OHA dispose d'une zone plus haute et réellement navigable au lieu du petit viewport 16:9 de la v60.
- Le plein écran de secours iPhone/iPad ne dépend plus d'un élément `position: fixed` enfermé dans le panneau animé : le panneau TV lui-même devient le viewport plein écran.

## Lecteurs TV sur mobile

- LiveWatch, WiTV, OHA et les flux directs utilisent désormais la même surface lecteur 16:9 hors mode portail.
- Le lecteur et la liste de chaînes sont mieux séparés, avec filtres collants et liste bornée sur téléphone.
- Le sélecteur de serveurs WiTV est horizontal, compact et défilable sur petit écran.
- Le bouton plein écran est désormais clair, contrasté et visible sur les images très sombres.

## Technique

- Version serveur/PWA : `61.0.0`.
- Cache PWA : `noctra-shell-v61`.
