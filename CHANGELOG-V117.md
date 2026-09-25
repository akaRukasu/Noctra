# Noctra V117

## TV — Daddy TV / NorthTV / FrameTV

- Corrige l'écran noir persistant des alternatives sur iPhone/iPad.
- Daddy TV, NorthTV et FrameTV ne passent plus par le bridge VIP expérimental.
- Leurs `embed_url` LiveWatch officiels sont chargés directement, comme prévu par l'API publique.
- L'étape publicitaire imposée par ces lecteurs est conservée : Noctra ne prétend plus que le VIP partagé la supprime.
- L'interface indique clairement que le lecteur officiel public est requis pour ces trois familles.
- LiveWatch principal et les wrappers Sports compatibles conservent le chemin VIP partagé existant.
- L'ordre des sources reste : LiveWatch, OHA, NorthTV, WiTV, Daddy TV, FrameTV.

## Régressions

- Les correctifs iOS/plein écran, OHA, Demandes et Torrent Live des versions précédentes sont conservés.
