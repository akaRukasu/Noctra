# Noctra v69

## Dock
- Aucun remaniement majeur : conservation du dock capsule complet de la v68, désormais considéré comme presque conforme au rendu attendu.

## LiveWatch
- Les quatre familles de catalogues (`LiveWatch`, `DaddyTV`, `NorthTV`, `FrameTV`) démarrent en parallèle.
- Le premier catalogue exploitable peut afficher immédiatement les chaînes ; `/api/v1/public/all` n’est plus un point de blocage obligatoire.
- Les autres familles complètent le catalogue en arrière-plan avec rafraîchissement progressif côté client.
- Réutilisation du dernier catalogue connu lorsqu’une reconnexion fournisseur est temporairement lente.
- Le statut VIP utilisé pour décorer le catalogue est lu localement afin de ne plus attendre le renouvellement Supabase à l’ouverture de la TV.
- Le renouvellement du jeton reste automatique en arrière-plan et la session est revérifiée strictement lors de la résolution d’une chaîne.
- Avant de remplacer l’iframe officielle, Noctra sonde désormais le flux VIP retourné et refuse les réponses HTML ou non vidéo.
- Le pont VIP est lancé avec un léger délai pour ne plus concurrencer le chargement initial de l’iframe officielle.

## OHA
- Chargement du catalogue par première page rapide puis pagination en arrière-plan.
- France et France Sport peuvent être affichés dès qu’un des deux groupes répond.
- Dernier catalogue connu utilisé comme secours pendant une panne ou une forte latence passagère.
- Ajout de `Origin`, `Referer`, `Accept-Language` et d’un User-Agent navigateur aux appels catalogue/résolveur.
- Nouveau classement des URL de résolution : priorité aux `.m3u8`, `.mp4` et `.mpd`, aux champs `stream/hls/src/file`, et rejet des images/pages OHA parasites.
- Les serveurs de lecture sont testés par vagues progressives au lieu d’une rafale simultanée de six POST.
- Le changement manuel de serveur reste disponible.

## WiTV
- Chemin de lecture laissé inchangé.

## Cache / version
- Version serveur, desktop, PWA et manifeste : `69.0.0`.
- Cache : `noctra-shell-v69`.
- HLS.js local et ressources principales marqués `?v=69`.

## Tests
- Batterie Noctra complète conservée.
- Ajout d’un test de régression OHA vérifiant qu’un vrai HLS/MPD est préféré à une URL de page ou une image.
- Tests statiques vérifiant le chargement progressif OHA, la course multi-catalogues LiveWatch et la validation du flux VIP avant bascule.
