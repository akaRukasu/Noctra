// 200.0.124 — départ Shaka 30 s en retrait du direct. Le fournisseur publie
// ses segments en retard sur l'horloge : au départ par défaut, il n'existait
// que ~7,5 s de contenu devant la lecture et la réserve de démarrage restait
// bloquée (diagnostic 200.0.123 : 7,58 s après 20 s d'attente).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const vendor = await readFile(new URL('public/vendor/shaka-player.compiled.js', root), 'utf8');

assert.match(shell, /const TV_SHAKA_START_BEHIND_LIVE = -30;/);
assert.match(shell, /await player\.load\(streamUrl, TV_SHAKA_START_BEHIND_LIVE, 'application\/x-mpegurl'\);/);
// Toujours suivi de l'attente de réserve (200.0.123) avant play().
const start = shell.indexOf('await player.load(streamUrl, TV_SHAKA_START_BEHIND_LIVE');
assert.ok(shell.indexOf('TV_SHAKA_STARTUP_RESERVE ||', start) > start && shell.indexOf('TV_SHAKA_STARTUP_RESERVE ||', start) < shell.indexOf('await video.play()', start));

// Shaka 5.2.10 : une heure de départ négative est relative au bord du direct
// (seekRange().end + valeur), puis bornée à la fenêtre [début, fin].
assert.match(vendor, /b<0&&\(b=a\.h\.Eb\(\)\+b\);return un\(a,tn\(a,b\)\)/, 'Départ négatif = relatif au direct');
assert.match(vendor, /function tn\(a,b\)\{var c=a\.h\.Kb\(\);if\(b<c\)return c;a=a\.h\.Eb\(\);return b>a\?a:b\}/, 'Borné au début de la fenêtre');

console.log('v200.0.124 : départ Shaka 30 s en retrait du direct (segments déjà publiés), réserve de démarrage atteignable : OK');
