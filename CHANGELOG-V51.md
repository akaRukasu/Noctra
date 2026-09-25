# Noctra v51

## Dock PC, tablette et mobile

- Le dock administrateur utilise désormais neuf cellules fixes.
- Le bouton **Gestion des utilisateurs** reste à l'intérieur du dock, quelle que soit la largeur de l'écran.
- Les icônes et la surbrillance active diminuent progressivement sur les téléphones étroits, sans décaler les autres boutons.

## Demandes Jellyseerr et vérification Prowlarr

- Les états ne sont plus fusionnés sous « Déjà présent ou demandé » :
  - Déjà présent ;
  - Partiellement présent ;
  - Téléchargement en cours ;
  - Demande en attente ;
  - Déjà demandé ;
  - Ajouter à Noctra.
- La recherche Prowlarr essaie d'abord `PROWLARR_INTERNAL_URL`, puis l'URL publique, puis automatiquement `http://127.0.0.1:15524` sur Ultra.cc.
- Une page HTML de connexion ou de proxy n'est plus interprétée comme du JSON.
- Les messages d'erreur indiquent désormais clairement si le proxy public renvoie du HTML ou si aucun indexeur ne répond.
- Le nombre de releases, de trackers et le meilleur nombre de seeders restent affichés lorsque la recherche aboutit.

## TV en direct

- Les pages HTML ajoutées par erreur ne sont plus transformées en fausses chaînes contenant des balises `<script>`.
- Le formulaire d'ajout de source est réorganisé pour PC, tablette et mobile.
- Types de sources disponibles : détection automatique, M3U, catalogue JSON et API LiveWatch JSON documentée.
- Ajout facultatif d'un guide XMLTV.
- Les cartes de chaînes peuvent afficher le programme en cours et le suivant.
- Le lecteur distingue les flux directs/HLS et les lecteurs web `embed_url` fournis par une API documentée.
- Ajout d'un état visible : connexion, mise en mémoire, lecture, erreur réseau ou format incompatible.
- Les lecteurs web sont ouverts dans une iframe isolée et les flux HLS continuent de passer par le proxy Noctra.

Noctra ne reproduit pas un navigateur propriétaire, ne contourne pas les protections d'un site et n'intègre aucun catalogue de chaînes. Les sources doivent être autorisées par l'utilisateur.

## Configuration facultative recommandée sur Ultra.cc

```dotenv
PROWLARR_INTERNAL_URL=http://127.0.0.1:15524
PROWLARR_INTERNAL_PORT=15524
```

La v51 possède déjà un repli automatique vers ce port, même sans modifier le `.env`.
