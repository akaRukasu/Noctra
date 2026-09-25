# Noctra v60

## TV en direct — WiTV

- WiTV ne charge plus directement les iframes de lecteur extraites des pages de chaînes.
- Chaque chaîne WiTV ouvre désormais sa page publique complète dans le lecteur Noctra (`compatPage: true`) afin que les scripts et dépendances du site restent chargés dans leur contexte normal.
- Les anciennes entrées WiTV utilisant encore le résolveur sont elles aussi forcées sur la page publique compatible : les variantes de lecteur direct ne sont plus proposées pour WiTV.
- Cette modification cible l’erreur `g is not defined` observée avec le lecteur WiTV isolé.

## Bandeau TV

- Refonte du sélecteur LiveWatch / WiTV / OHA afin qu’il ressemble à un véritable bandeau de sources plutôt qu’à une grille de gros boutons séparés.
- Sur PC, les trois sources occupent proprement la largeur disponible et les commandes Sports / Ajouter restent isolées dans une zone secondaire compacte.
- Sur mobile, LiveWatch / WiTV / OHA restent sur une seule rangée horizontale défilable ; les descriptions sont masquées et Sports / Ajouter deviennent deux petites actions fixes à droite.
- Le bloc TV gagne en compacité sans retirer les fonctions existantes.

## OHA mobile

- Le repli OHA `/live` n’utilise plus une hauteur proche de `64vh` sur téléphone.
- Le lecteur revient à un viewport proche du ratio 16:9 en affichage normal, ce qui supprime les grands espaces noirs observés en portrait.
- Le recadrage de la navigation OHA reste appliqué sans agrandir artificiellement l’iframe.

## Plein écran iPhone / iPad

- Le mode de secours plein écran est maintenant déclenché directement pour les lecteurs iframe sur les appareils Apple tactiles.
- Correction du contexte CSS qui empêchait `position: fixed` de réellement remplir le viewport : les transforms/overflow du panneau Noctra sont neutralisés pendant le plein écran TV.
- En pseudo-plein-écran, seule la zone vidéo est affichée ; le bloc programme/actions sous le lecteur est masqué jusqu’à la sortie du plein écran.
- Les flux vidéo natifs conservent le plein écran vidéo WebKit lorsqu’il est disponible.

## Logos de chaînes

- Les variantes portant le même nom partagent maintenant le meilleur logo déjà trouvé dans les catalogues LiveWatch/DaddyTV/NorthTV/FrameTV.
- Le rapprochement iptv-org accepte davantage de variantes typographiques : suffixes HD/FHD/UHD, `TV`, `Channel`, tirets/points et formes ordinales comme `13 EME` / `13EME`.
- Le monogramme reste le dernier repli uniquement quand aucune image exploitable n’est disponible.

## Version / cache

- Version serveur/PWA : `60.0.0`.
- Cache service worker : `noctra-shell-v60`.
- Tests syntaxiques, statiques et responsive validés.
