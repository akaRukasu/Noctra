# Mise à jour Noctra v149 Server Safe sur Ultra.cc

1. Arrête Noctra si tu fais une mise à jour manuelle, ou utilise ton script de mise à jour habituel.
2. Conserve impérativement ton `.env` et ton dossier `runtime/` : ils contiennent la configuration et les états persistants de Noctra.
3. Remplace les fichiers applicatifs par ceux de `noctra-media-client-v149.zip`.
4. Redémarre le service Noctra.
5. Vérifie `http://127.0.0.1:<PORT><BASE_URL>/health` : la réponse doit annoncer exactement `"version":"150.0.0"`.
6. Ferme complètement la PWA/onglet puis rouvre-le afin de charger `noctra-shell-v150`.

Si un ancien processus répond encore sur le port, redémarre le service avant de conclure que la mise à jour n’a pas été appliquée.
