# Noctra v148

- Ajoute **FSTV** dans l’univers **Chaînes**, exactement entre **LiveWatch** et **OHA**.
- Le catalogue FSTV est construit depuis les pages publiques `fstv.rest` et chaque chaîne conserve sa page/son lecteur public officiel.
- Ajoute **DLStreams** dans l’univers **Sports** à partir du programme public du site et de ses pages d’embed documentées `stream/stream-<id>.php`.
- Ajoute **StreamSports99** dans l’univers **Sports** en référençant ses pages publiques `/player/...`; un portail public de secours reste disponible si le site change son rendu.
- Aucune extraction de jeton privé, clé, DRM ou flux caché : Noctra intègre uniquement les pages/embeds publics fournis par les sites.
- Conserve le comportement TV v147 pour LiveWatch, OHA, NorthTV, WiTV, FrameTV et le reste de Noctra.
