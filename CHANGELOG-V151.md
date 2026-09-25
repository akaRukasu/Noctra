# Noctra v151

Base : v150.

## TV

- **WiTV / HLS** : détection du flux HLS renforcée pour les nouvelles formes PlayerJS (URL directe, `file`, liste de qualités, JSON/JS). Le direct n'est proposé qu'après validation réelle d'une playlist `#EXTM3U`.
- **WiTV / session lecteur** : les cookies publics posés par la page PlayerJS sont maintenant conservés avec l'Origin/Referer dans le relais HLS, y compris pour les segments enfants. Si le HLS n'est pas valide, Noctra conserve le lecteur web officiel en secours au lieu de lancer un direct cassé.
- **OHA / routes** : le bridge ouvre en priorité la route stable `/live` puis sélectionne automatiquement la chaîne par identifiant/nom. Les deep-links `/watch?live=...` restent des replis, ce qui évite les écrans `NOT FOUND` produits après le boot de certaines routes SPA devenues obsolètes.
- **OHA / recherche et scroll** : correction du listener de virtualisation qui pouvait rester actif après une recherche et remplacer les résultats par « Aucune chaîne » dès le premier scroll. La liste est désormais dévirtualisée proprement et revient en haut lors d'un nouveau filtre.

## Conservé depuis v150

- FSTV : lecteur public détecté en priorité, sinon page officielle intacte en mode focus.
- StreamSports99 : détection multi-domaines et prise en charge des URLs `/player/...` présentes dans HTML, JSON ou JavaScript.
- Navigation responsive Chaînes/Sports et comportement mobile v149.
