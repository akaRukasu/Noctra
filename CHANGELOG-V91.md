# Noctra Media Client v91 — Fluidité desktop / TV / Demandes

Cette version ne réduit pas la quantité de contenu affichée. Elle change surtout **quand** et **comment** Noctra monte/rend les éléments lourds afin de réduire le travail du thread principal et du GPU sur PC.

## TV — fluidité et chargement PC

- La liste des chaînes est **virtualisée sur desktop** au-delà de 70 résultats : toutes les chaînes restent accessibles par défilement/recherche/zapping, mais seulement la fenêtre visible + une marge est présente dans le DOM à un instant donné.
- Le zapping sait recentrer automatiquement une chaîne située hors de la fenêtre virtualisée.
- Les chaînes conservent leur index réel : aucun contenu, groupe ou résultat de recherche n'est retiré.
- Les catalogues progressifs LiveWatch/OHA ne remontent plus tout le workspace TV. La liste et le compteur sont actualisés **en place** sans détruire/recréer le lecteur vidéo ou l'iframe active.
- Le texte de recherche normalisé des chaînes est mémorisé pour éviter de recalculer 500–2000 chaînes à chaque frappe.
- Les filtres desktop sont regroupés sur une frame afin d'éviter les rafales de recalcul pendant la saisie.
- Le dernier fournisseur TV utilisé est mémorisé et son catalogue est préchauffé pendant une période idle sur PC.

## Demandes / Discovery

- La page Discovery n'attend plus la réponse des plateformes de streaming avant d'afficher ses recommandations.
- Sur desktop, les 12 premières recommandations sont montées immédiatement puis le reste du **même résultat complet** est ajouté par petits lots pendant les périodes idle.
- Les enrichissements Jellyseerr/TMDB/Prowlarr restent paresseux et sont lancés une fois le montage principal stabilisé.
- Les sections de recommandations hors écran utilisent `content-visibility` et l'isolation layout/paint pour réduire le coût du scroll sans supprimer de cartes.
- Discovery, historique des demandes et fournisseurs sont préchauffés en arrière-plan sur desktop lorsque le navigateur est idle.

## GPU / rendu PC

- Le `backdrop-filter: blur(...)` appliqué à tout l'écran derrière TV/Demandes/Discovery est supprimé sur desktop : sur un grand écran/haute fréquence, ce blur provoquait un repaint GPU très coûteux à chaque frame.
- Pendant l'ouverture de ces panneaux plein écran, le rendu du `#reactRoot` Jellyfin situé derrière est suspendu avec `content-visibility:hidden`. Le DOM et l'état Jellyfin restent intacts et réapparaissent instantanément à la fermeture.
- Les transitions de remplacement de contenu sont désactivées uniquement sur les panneaux lourds afin d'éviter de recomposer toute une surface 4K pendant un rafraîchissement.
- Les nombreux petits `backdrop-filter` des badges Discovery/TV sont remplacés sur desktop par leur fond composite existant, beaucoup moins coûteux.

## Réseau

- Les grosses réponses JSON Noctra (>24 Ko) sont maintenant compressées en gzip lorsque le navigateur l'accepte. Les catalogues TV et gros résultats API transitent donc avec beaucoup moins de données sans modifier leur contenu.

## Préchargement intelligent

Sur PC uniquement, lorsque la connexion n'annonce pas `Save-Data`, Noctra utilise `requestIdleCallback` pour réchauffer :

- `/api/tv/sources` puis le catalogue TV préféré ;
- Discovery `smart/balanced` ;
- fournisseurs de streaming ;
- historique/quota Jellyseerr.

Le mobile conserve son comportement actuel, déjà fluide.

## Vérifications

- `npm run check` ;
- suite complète `npm test` ;
- test de régression v91 : virtualisation TV, refresh progressif en place, Discovery progressif, préchauffage idle, isolation GPU et gzip ;
- smoke test `/health` / `/api/config` en `91.0.0` ;
- tests relancés depuis l'archive ZIP finale réextraite.
