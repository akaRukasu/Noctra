# Noctra v132

## Dock

- Suppression complète des ombres portées et des halos du conteneur et de ses boutons.
- Conservation de la forme arrondie et de l'état actif coloré, sans effet lumineux.

## LiveWatch

- LiveWatch principal conserve son resolver VIP HLS officiel.
- NorthTV conserve le direct HLS officiel introduit en v131.
- FrameTV utilise maintenant `/api/frame/stream/<id>` parce que sa route d'embed officielle est actuellement vide.
- Daddy TV conserve son embed officiel et son étape publicitaire, car son API ne fournit actuellement aucun HLS exploitable et son bridge ne reconnaît plus la session VIP virtuelle.
- Les sources sans session VIP conservent les embeds publics documentés.

Version : `132.0.0`
Cache PWA : `noctra-shell-v132`
