import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');

assert.ok(theme.includes('Noctra V44'), 'Le hero mobile V44 doit être présent.');
assert.ok(theme.includes('Noctra V54 — centre TV enrichi, lecteurs iframe fiables, WiTV/OHA'), 'La base des panneaux TV doit rester présente.');
assert.ok(theme.includes('Noctra V58c — finition PC/mobile/tablette : dock membre, centre TV et lecteurs'), 'La couche responsive TV v57 doit être présente.');
assert.ok(theme.includes('--noctra-v38-header-height'), 'La hauteur mobile V44 doit être définie.');
assert.ok(theme.includes('body:not(.noctra-drawer-open) .mainDrawer'), 'Le tiroir fermé doit être totalement hors écran.');
assert.ok(theme.includes('data-noctra-panel-kind="requests"'), 'Le panneau Demandes doit avoir une mise en page mobile dédiée.');
assert.ok(theme.includes('data-noctra-panel-kind="downloads"'), 'Le panneau Téléchargements doit avoir une mise en page mobile dédiée.');
assert.ok(theme.includes('.pageTitleWithLogo::after'), 'Le logo mobile doit contenir le mot-symbole Noctra.');
assert.ok(theme.includes('grid-auto-columns: minmax(40px, 1fr)'), 'Le dock mobile doit répartir régulièrement ses actions.');
assert.ok(theme.includes('body.noctra-detail .itemDetailPage .trackSelections'), 'Les pistes des fiches doivent rester dans la largeur mobile.');
assert.ok(theme.includes('html.noctra-ultrawide'), 'Le mode compact pour écran ultralarge doit être présent.');
assert.ok(theme.includes('scroll-behavior: auto !important'), 'Le mode ultralarge doit conserver le défilement natif.');
assert.ok(shell.includes("classList.toggle('noctra-native-wheel', performanceDesktop || ultrawide)"), 'Le desktop, y compris le 32:9, doit utiliser le défilement natif le plus fluide.');
assert.ok(shell.includes("!document.documentElement.classList.contains('noctra-native-wheel')"), 'Le lissage JS ne doit pas intercepter la molette ultralarge.');
assert.ok(shell.includes('1 - Math.exp(-dt / 68)'), 'Le lissage PC classique doit être plus direct.');
assert.ok(shell.includes("data-noctra-panel-kind=\"${escapeHtml(panelKind)}\""), 'Le type de panneau doit être exposé au CSS.');
assert.ok(shell.includes('visibleMask'), 'L’état du tiroir doit tenir compte du masque réellement visible.');

assert.ok(theme.includes('--noctra-v38-header-height'), 'La barre mobile compacte V44 doit être définie.');
assert.ok(theme.includes('.noctra-dock-button::before'), 'La surbrillance du dock doit être indépendante du bouton.');
assert.ok(theme.includes('.noctra-empty-resume-section'), 'Les sections de reprise vides doivent pouvoir être masquées.');
assert.ok(shell.includes('continuationCandidates'), 'La sélection de la reprise doit privilégier une section réellement remplie.');
assert.ok(shell.includes("classList.toggle('noctra-detail-mobile', compactDetail)"), 'La fiche mobile doit être isolée des anciens styles desktop.');
assert.ok(shell.includes("classList.toggle('noctra-detail-ready', compactDetail && detailReady)"), 'Les styles mobiles doivent attendre le contenu Jellyfin.');
assert.ok(theme.includes('body.noctra-detail-mobile.noctra-detail-ready'), 'La mise en page V44 doit être appliquée uniquement après chargement.');

assert.ok(theme.includes('--noctra-v44-poster'), 'La fiche V44 doit dimensionner une affiche responsive.');
assert.ok(theme.includes('top: calc(-1 * var(--noctra-v44-overlap))'), 'L’affiche doit chevaucher la bannière.');
assert.ok(theme.includes('padding-left') || theme.includes('calc(var(--noctra-v44-edge) + var(--noctra-v44-poster)'), 'Le contenu doit réserver la place de l’affiche.');
assert.ok(theme.includes('justify-content: flex-start !important'), 'Les carrousels secondaires doivent partir du bord gauche utile.');
assert.ok(theme.includes('max-width: calc(100vw - 330px'), 'Le dock paysage doit rester borné entre les commandes supérieures.');


assert.ok(theme.includes('form.trackSelections.hide'), 'La V47 doit respecter la classe hide native des pistes.');
assert.ok(theme.includes('.nextUpSection'), 'La V47 doit compacter la section À suivre.');
assert.ok(theme.includes('#childrenCollapsible'), 'La V47 doit compacter saisons et épisodes.');
assert.ok(shell.includes("'.nextUpSection, #childrenCollapsible"), 'Le recalcul JS doit inclure les sections de série.');

assert.ok(theme.includes('.noctra-discovery-grid'), 'Les suggestions V51 doivent être responsive.');
assert.ok(theme.includes('.noctra-download-dashboard'), 'Les téléchargements V51 doivent être responsive.');
assert.ok(theme.includes('.noctra-tv-section-tabs'), 'Les sous-menus TV doivent rester responsive.');

assert.ok(theme.includes('repeat(4, minmax(0,1fr))'), 'Le dock membre mobile doit comporter quatre cellules cohérentes.');
assert.ok(theme.includes('noctra-tv-pseudo-fullscreen'), 'Le lecteur TV doit disposer d’un mode plein écran mobile de secours.');
assert.ok(theme.includes('data-tv-provider="witv"'), 'WiTV compatible doit être recadré de façon responsive.');

assert.ok(theme.includes('Noctra V60 — TV : navigation intégrée, WiTV stable et plein écran mobile réel'), 'La couche responsive TV v60 doit être présente.');
assert.ok(theme.includes('height: clamp(340px, 58dvh, 520px)'), 'OHA mobile doit garder un viewport exploitable.');
assert.ok(theme.includes('Noctra V61 — dock membre aligné sur l\'admin + lecteurs TV mobile/pseudo-plein-écran'), 'La couche responsive TV v61 doit être présente.');
assert.ok(theme.includes('flex: 0 0 42px !important'), 'Le dock membre doit reprendre des cellules compactes identiques à l’admin.');
assert.ok(theme.includes('Noctra V62 — dock membre unifié, demandes éditorialisées et TV adaptative'), 'La couche responsive v62 doit être présente.');
assert.ok(theme.includes('.noctra-smart-rail') && theme.includes('scroll-snap-type: x proximity'), 'Les suggestions v62 doivent devenir des rubans tactiles fluides.');
assert.ok(theme.includes('height: clamp(520px, 66dvh, 720px)'), 'OHA desktop doit utiliser une hauteur bornée sans espace inférieur géant.');
assert.ok(theme.includes('body[data-noctra-role="user"] #noctra-dock[data-role="user"] [data-noctra="tv"]'), 'TV doit partager exactement la règle des autres boutons membre.');
assert.ok(theme.includes('Noctra V63 — session LiveWatch VIP partagée sans exposer ses jetons'), 'La couche responsive LiveWatch VIP v63 doit être présente.');
assert.ok(theme.includes('.noctra-livewatch-vip-form') && theme.includes('grid-template-columns: 40px minmax(0,1fr)'), 'Le formulaire VIP doit rester utilisable sur mobile.');
assert.ok(theme.includes('data-tv-mobile-view="channels"') && theme.includes('data-tv-mobile-view="player"'), 'La TV mobile doit séparer proprement le zapping et le lecteur.');
assert.ok(theme.includes('.noctra-request-auto-destination'), 'Le rangement automatique des demandes membre doit être lisible sur mobile.');

assert.ok(shell.includes("lastAuthToken = 'cookie-session'"), 'La PWA mobile doit réutiliser la session HttpOnly pendant la réhydratation Jellyfin.');
assert.ok(shell.includes("window.addEventListener('pageshow'") && shell.includes("document.addEventListener('visibilitychange'"), 'Le rôle admin doit être resynchronisé au retour dans la PWA mobile.');
assert.ok(theme.includes('#noctra-dock[data-role="administrator"] .noctra-dock-items') && theme.includes('grid-template-columns: repeat(9, minmax(0, 1fr))'), 'Le dock admin mobile doit afficher les neuf actions dans la capsule sans les cacher hors écran.');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'") && shell.includes('verifyNoctraBuild'), 'Le client doit détecter un déploiement client/serveur incohérent.');
assert.ok(theme.includes('Noctra V79 — dock mobile sans bulle active ni dédoublement'), 'La correction V79 du dock mobile doit être présente.');
assert.ok(theme.includes('#noctra-dock .noctra-dock-button[data-active="true"]') && theme.includes('content: none !important'), 'Le dock mobile V79 doit neutraliser la double bulle active et ses pseudo-éléments.');
assert.ok(theme.includes('Noctra V81 — dock mobile en barre pure, sans logo'), 'La couche v81 doit conserver le dock mobile sans logo.');
assert.ok(theme.includes('#noctra-dock[data-role="administrator"] .noctra-brand') && theme.includes('display: none !important'), 'Le logo du dock doit être retiré sur mobile, y compris pour l’administrateur.');


assert.ok(theme.includes('V82b — aucun micro-effet au survol du dock membre') && theme.includes('scale: 1 !important'), 'Le dock membre doit rester totalement immobile au survol, y compris ses icônes.');
assert.ok(shell.includes("screen.requestFullscreen({ navigationUI: 'hide' })") && theme.includes('.noctra-tv-screen:fullscreen'), 'Le bouton TV doit utiliser le Fullscreen API natif sur le viewport vidéo.');

console.log('Responsive mobile, panneaux, fiches et ultralarge Noctra v88 : OK');

assert.ok(theme.includes('noctra-track-empty'), 'La V47 doit masquer les pistes réellement vides.');
