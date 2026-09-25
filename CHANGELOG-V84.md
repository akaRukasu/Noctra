# Noctra Media Client v84 — LiveWatch V80 restauré + plein écran mobile

## LiveWatch

- Retour au chemin Premium qui était le plus fiable en V80 : la session VIP est renouvelée avant la résolution du flux direct.
- `VIP Premium · direct` reste prioritaire lorsqu'il est disponible.
- Le lecteur officiel LiveWatch authentifié reste le second choix ; le lecteur public avec deux pubs reste manuel.
- Sur mobile/tactile, si le bridge officiel résout un média avant le démarrage de l'iframe, Noctra restaure le handoff V80 vers le lecteur vidéo natif.
- Aucun handoff n'est autorisé après le début de la lecture : une chaîne déjà en cours n'est jamais interrompue par une bascule tardive pouvant conduire à un 502.
- Le cache direct Premium court existant est conservé.

## Plein écran mobile TV

- Ajout d'un helper dédié au plein écran vidéo natif WebKit.
- Priorité à `webkitEnterFullscreen()` / `webkitEnterFullScreen()` pour les vidéos sur iPhone/iPad, avec `webkitSetPresentationMode('fullscreen')` en secours.
- Le Fullscreen API standard reste utilisé sur les plateformes qui l'acceptent.
- Si un lecteur LiveWatch officiel a déjà révélé son média sur iOS, un clic explicite sur Plein écran peut transférer ce média au lecteur natif avant d'ouvrir le plein écran vidéo.
- Le fallback viewport Noctra n'est utilisé que lorsqu'aucun vrai média vidéo n'est accessible depuis l'iframe.

## Conservation

- OHA, WiTV, logos TV, demandes Jellyseerr et les autres fonctions V83 sont conservés.
- Aucun changement automatique de serveur pendant une lecture active n'est réintroduit.

## Version / cache

- Version : `84.0.0`
- Cache PWA : `noctra-shell-v84`
- Centre TV : `NOCTRA · TV EN DIRECT · v84`
