// 200.0.123 — réserve de démarrage Shaka garantie : play() n'est appelé
// qu'avec 15 s de réserve (20 s d'attente au plus), Shaka téléchargeant déjà
// pendant la pause. En 200.0.122, Shaka partait avec ~7,5 s dès qu'il croyait
// avoir atteint le bord du direct (playlist non rafraîchie depuis 26 s).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const vendor = await readFile(new URL('public/vendor/shaka-player.compiled.js', root), 'utf8');

assert.match(shell, /const TV_SHAKA_STARTUP_RESERVE = 15;/);
assert.match(shell, /const TV_SHAKA_STARTUP_WAIT_MS = 20_000;/);
const start = shell.indexOf("await player.load(streamUrl, undefined, 'application/x-mpegurl');");
const gate = shell.slice(start, shell.indexOf('await video.play()', start));
assert.ok(gate.length > 200, 'Attente placée entre load() et play()');
assert.match(gate, /tvBufferedAhead\(video\) >= TV_SHAKA_STARTUP_RESERVE \|\| performance\.now\(\) - startupWaitStarted >= TV_SHAKA_STARTUP_WAIT_MS/);
assert.match(gate, /if \(videoEventSignal\.aborted \|\| playbackSequence !== tvPlaybackSequence\) return resolve\(\);/, 'Changement de chaîne : attente abandonnée');
assert.match(gate, /recordTvDiagnostic\('shaka-startup-reserve', \{/);
assert.match(gate, /setTvPlaybackStatus\(`Préchargement du direct · \$\{TV_SHAKA_STARTUP_RESERVE\} s…`, 'loading'\);/);
// Toujours 15 s de rebufferingGoal au démarrage, 6 s ensuite (200.0.121).
assert.match(shell, /rebufferingGoal: 15, bufferBehind: 15/);
// Shaka 5.2.10 quitte l'état « mise en mémoire » dès que le tampon atteint la
// fin du dernier segment connu, même sous rebufferingGoal (cause observée).
assert.match(vendor, /q\.oj=function\(\)\{if\(this\.h\.za\(\)\)\{var a=this\.h\.Rc\(\),b=Dk\(this\.i\.buffered\);if\(b!=null&&b>=a\)return!0\}return!1\}/);

console.log('v200.0.123 : première image Shaka seulement avec 15 s de réserve (20 s d’attente au plus) : OK');
