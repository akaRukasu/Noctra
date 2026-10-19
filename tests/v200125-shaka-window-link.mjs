// 200.0.125 — lecture sortie de la fenêtre du direct : retour 20 s avant son
// bord (plus de boucle de sauts au début de la fenêtre) ; lien du direct
// expiré (playlist 403/404/410 répétée) : renouvellement immédiat.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const vendor = await readFile(new URL('public/vendor/shaka-player.compiled.js', root), 'utf8');

// 1. Configuration Shaka du lecteur TV.
assert.match(shell, /returnToEndOfLiveWindowWhenOutside: true, safeSeekEndOffset: 20,/);
// Shaka 5.2.10 : hors fenêtre (position < début), l'option renvoie à
// fin - safeSeekEndOffset au lieu de début + marge (comportement par défaut).
assert.match(vendor, /b<e\?a\.h\.isLive\(\)&&a\.m\.returnToEndOfLiveWindowWhenOutside\?f-a\.m\.safeSeekEndOffset:/);
assert.match(vendor, /returnToEndOfLiveWindowWhenOutside:!1/, 'Désactivée par défaut dans Shaka');
// Le bouton « En direct » vise seekable.end - 0,35 s : il reste dans la fenêtre.
assert.match(shell, /if \(ranges\?\.length\) return Math\.max\(0, ranges\.end\(ranges\.length - 1\) - \.35\);/);

// 2. Lien expiré : 3 échecs 403/404/410 de la playlist en 60 s, lecture déjà
//    lancée → renouvellement par le chemin existant (refreshResolvedStream).
assert.match(shell, /const TV_SHAKA_EXPIRED_LINK_FAILURES = 3;/);
const handler = shell.slice(shell.indexOf('let expiredManifestFailures = [];'), shell.indexOf("video.addEventListener('seeking'", shell.indexOf('let expiredManifestFailures = [];')));
assert.match(handler, /event\.requestType === 0 && \[403, 404, 410\]\.includes\(event\.httpResponseCode\)/);
assert.match(handler, /filter\(at => now - at < 60_000\)/);
assert.match(handler, /expiredManifestFailures\.length >= TV_SHAKA_EXPIRED_LINK_FAILURES && playbackBecameActive/);
assert.match(handler, /recordTvDiagnostic\('shaka-link-expired'/);
assert.match(handler, /refreshResolvedStream\(playbackProvider, true\);/);
// Le renouvellement garde le tampon existant pendant la résolution (inchangé).
assert.match(shell, /Laisser le tampon existant se lire\/remplir pendant la résolution\./);

console.log('v200.0.125 : retour vers le bord hors fenêtre du direct, renouvellement du lien expiré : OK');
