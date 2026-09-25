# Noctra v149

- FSTV reste dans **Chaînes**, entre **LiveWatch** et **OHA**, mais son rendu passe maintenant par un lecteur FSTV intégré à Noctra qui isole la zone vidéo au lieu d'afficher toute la page web dans le cadre.
- **JackTV** gère proprement le cas où l'endpoint officiel LiveWatch ne publie aucun match. Dans ce cas Noctra affiche temporairement les embeds officiels de Football Live comme secours, avec un avertissement explicite.
- **Matchs du jour** utilise le bandeau officiel lorsqu'il contient des lecteurs ; s'il est vide, Noctra construit une sélection de secours à partir des événements officiels Sports + Football Live.
- **StreamSports99** est conservé comme source Sports et sa découverte accepte désormais aussi les pages publiques `/live-tv/...`, en plus des anciennes pages `/player/...`.
- Navigation TV revue : les fournisseurs ne défilent plus horizontalement sur desktop. Les 6 sources Chaînes et les sources Sports utilisent une grille compacte.
- Responsive mobile : grille de 3 fournisseurs par ligne, puis 2 sur les écrans très étroits, afin que toutes les sources restent visibles sans swipe horizontal.
- Ordre Chaînes conservé : **LiveWatch → FSTV → OHA → NorthTV → WiTV → FrameTV**.
- Version client, serveur, service worker et cache-busters alignés sur v149.
