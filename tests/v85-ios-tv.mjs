import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const hls = await readFile(new URL('../public/vendor/hls.min.js', import.meta.url), 'utf8');

assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'") && server.includes("version: '200.0.21'"), 'Client et serveur doivent annoncer v85.');
assert.ok(hls.includes('1.7.1'), 'Le bundle HLS.js local doit rester une version moderne compatible iOS 17.1+ / ManagedMediaSource.');

const start = shell.indexOf('async function playTvDirectStream');
const end = shell.indexOf('async function playTvResolvedOption', start);
assert.ok(start >= 0 && end > start, 'Le lecteur direct TV doit être extractible.');
const direct = shell.slice(start, end);
assert.ok(direct.includes('const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider);'), 'NorthTV doit privilégier WebKit natif sur iOS pour ses gros segments.');
assert.ok(direct.includes('&& !appleNativeFirst'), 'Les autres directs Premium doivent conserver HLS.js + ManagedMediaSource sur iOS.');
assert.ok(direct.includes('hlsOptions.preferManagedMediaSource = true') && direct.includes('hlsOptions.liveDurationInfinity = true'), 'Le lecteur iOS doit exploiter ManagedMediaSource et le mode live de HLS.js.');
assert.ok(direct.includes("if (iosHlsJsPreferred)"), 'LiveWatch doit tenter HLS.js/ManagedMediaSource avant le moteur HLS natif sur iOS.');
assert.ok(direct.includes("startNativeHls('Compatibilité iOS · essai du moteur HLS natif…')"), 'Un échec HLS.js doit retenter la même source via WebKit natif, sans changer de serveur.');
assert.equal(direct.includes('fallbackTvResolvedOption('), false, 'La compatibilité iOS ne doit jamais changer automatiquement de serveur TV.');
assert.ok(direct.includes("video.setAttribute('webkit-playsinline', '')"), 'La balise vidéo doit conserver le mode inline WebKit sur iPhone/iPad.');

const fullStart = shell.indexOf('async function toggleTvFullscreen');
const fullEnd = shell.indexOf('function renderTvGuideForChannel', fullStart);
const fullscreen = shell.slice(fullStart, fullEnd);
assert.ok(fullscreen.includes('if (video.paused && video.currentSrc) void video.play()'), 'Le clic plein écran iOS doit reprendre la vidéo dans le même geste utilisateur.');
assert.ok(fullscreen.includes('enterTvNativeVideoFullscreen(video)'), 'Le plein écran vidéo natif WebKit doit rester prioritaire sur iOS.');

console.log('Compatibilité TV iOS Noctra v88 : OK');
