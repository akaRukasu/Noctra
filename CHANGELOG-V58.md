# Noctra v58

## Dock et permissions utilisateur

- Le dock d'un compte standard contient uniquement **Accueil, Médiathèques, Demandes et TV**.
- Les boutons Téléchargements, Sonarr/Radarr, Dashboard et Actualiser les médiathèques ne sont plus seulement cachés : ils sont retirés de la grille et ne sont injectés que pour un administrateur authentifié.
- Le bouton Gestion des utilisateurs reste également strictement administrateur.
- La largeur et les quatre cellules du dock membre sont recalées sur PC, tablette et mobile afin que TV soit dans la continuité exacte des trois autres raccourcis.

## Centre TV

- Navigation des sources compactée : plus de gros onglet « Chaînes » laissant un vide à droite.
- **Sports est masqué par défaut** et apparaît via « Afficher Sports » ; le même bouton permet ensuite de le masquer.
- Le bouton d'ajout d'une source devient une petite commande d'administration intégrée à la barre des sources.
- LiveWatch et OHA conservent les noms courts **LiveWatch** et **OHA**.
- Le bloc sous le lecteur est aéré en trois zones : identité de la chaîne, guide Maintenant/Ensuite, puis état et actions.

## Logos LiveWatch

- Résolution des logos relatifs par rapport à l'URL réelle du catalogue.
- Passage des images distantes par le proxy Noctra avec détection du type d'image.
- Déduplication plus agressive des variantes du type `HD .s`, `.b`, `.c`, etc.
- Enrichissement facultatif des chaînes reconnues avec les logos publics de la base iptv-org.
- Monogramme propre conservé en dernier recours quand aucun logo valide n'est disponible.

## Guide des programmes

- `TV_EPG_URL` reste pris en charge comme guide XMLTV global.
- Pour une chaîne LiveWatch reconnue dans iptv-org, Noctra tente désormais **à la demande**, au moment où la chaîne est sélectionnée, de trouver un guide public associé.
- Cette récupération est paresseuse pour ne pas ralentir l'ouverture du catalogue de plusieurs centaines ou milliers de chaînes.
- En l'absence d'EPG, l'interface indique clairement qu'aucun programme n'est disponible au lieu de laisser croire à une panne du lecteur.

## WiTV

- Correction du problème `g is not defined` observé avec certains iframes extraits isolément.
- Noctra privilégie désormais un mode **WiTV compatible** utilisant la page publique de la chaîne, connue pour charger correctement ses dépendances, mais recadrée afin de mettre le lecteur en avant.
- Les lecteurs iframe directs détectés restent proposés comme variantes quand ils fonctionnent.

## OHA

- La source reste limitée à **`https://oha.cx/live`**.
- Noctra continue de chercher les chaînes/pages/lecteurs publiquement indexables côté serveur et utilise son résolveur lorsqu'il en trouve.
- Si OHA construit son catalogue exclusivement dans le navigateur et ne l'expose pas au serveur, Noctra conserve le repli sur la vue Live TV, recadrée pour masquer au maximum la navigation générale du site.
- Aucun mécanisme privé de VYPN, jeton caché ou contournement de contrôle d'accès n'est reproduit.

## Plein écran mobile/tablette

- Le lecteur TV possède un bouton plein écran directement dans la vidéo.
- Utilisation de Fullscreen API lorsque disponible.
- Utilisation du plein écran vidéo WebKit pour les flux directs sur iOS lorsqu'il est disponible.
- Repli **pseudo plein écran** pour les lecteurs iframe OHA/LiveWatch/WiTV lorsque Safari iPhone/iPad n'autorise pas le plein écran de l'iframe depuis la page parente.

## Performances

- Les grands catalogues restent rendus par lots.
- Recherche locale temporisée sans nouvel appel réseau.
- Métadonnées/logos iptv-org mis en cache et chargés avec un délai court ; le guide des programmes est récupéré uniquement pour la chaîne réellement sélectionnée.
- Cache PWA renouvelé en `noctra-shell-v58`.

Version serveur/PWA : `58.0.0`.
