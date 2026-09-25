# Noctra Media Client — Changelog V108

## TV
- LiveWatch : pipeline v107 conservé, aucune nouvelle couche de renouvellement.
- WiTV : aucune modification du lecteur ou du resolver.
- OHA : fusion des doublons typographiques du catalogue (ex. 13EME RUE / 13 EME RUE).
- OHA : les serveurs fusionnés deviennent des alternatives d’une même chaîne.
- OHA : validation du début réel de la playlist HLS (`#EXTM3U`) avant qu’un serveur soit présenté comme lecteur natif. Un resolver qui répond mais fournit une ressource non-HLS / morte est ignoré au profit d’une autre alternative ou du lecteur intégré.
- OHA : le lecteur HLS principal reste strictement celui de la v107/v94 ; la stabilité est travaillée uniquement par la sélection de serveurs réellement exploitables.

## Mode cinéma
- L’état cinéma est maintenant persistant jusqu’au clic explicite « Revenir au lecteur normal ».
- Une mise à jour partielle du zapping, du guide, du statut ou du menu TV ne peut plus supprimer l’attribut cinéma.
- Les mutations DOM transitoires ne détruisent plus les extras TV tant que le panneau TV est réellement ouvert.

## Sécurité / périmètre
- Édition Server Safe.
- Pas de changement du comportement WiTV.
- Pas de changement automatique de fournisseur ou de serveur.
