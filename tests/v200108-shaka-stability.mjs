// 200.0.108 — stabilité Shaka : configuration durcie et relance bornée du
// même flux après une erreur fatale survenue en cours de lecture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { playerFixture } from './v200048-tv-recovery.mjs';

class Shaka extends EventTarget {
  static version = '5.2.10'; static isBrowserSupported() { return true; }
  constructor() { super(); this.config = { abr: { enabled: true }, streaming: {}, manifest: {} }; }
  configure(c) { for (const [k, v] of Object.entries(c)) this.config[k] = { ...this.config[k], ...v }; }
  getConfiguration() { return this.config; } getStats() { return { estimatedBandwidth: 1000000 }; } getVariantTracks() { return []; }
  async attach(video) { this.video = video; } async load(url) { this.url = url; } async destroy() { this.destroyed = true; }
}
const library = async () => ({ Player: Shaka, polyfill: { installAll() {} } });

const p = await playerFixture('LiveWatch', false, { section: 'channels' });
p.deps.tvEnginePreference = 'shaka'; p.deps.ensureShakaLibrary = library;
p.ahead=20;await p.deps.tvDirectRestart();
const player = p.deps.tvShaka;
const config = player.config;
assert.equal(config.manifest.hls.ignoreManifestProgramDateTime, true, 'PDT IPTV ignoré');
assert.equal(config.manifest.hls.sequenceMode, true, 'Segments enchaînés sans suivre les PTS irréguliers');
assert.equal(config.streaming.retryParameters.stallTimeout, 15000, 'Laisse le relais partager un segment en cours');
assert.equal(config.streaming.retryParameters.timeout, 45000, 'Les gros segments qui progressent gardent leur délai');
assert.equal(config.streaming.maxDisabledTime, 15);
assert.equal(config.manifest.retryParameters.stallTimeout, 8000);
assert.equal(config.abr.switchInterval, 12);
assert.ok(config.abr.bandwidthUpgradeTarget < 0.85, 'Montée en qualité plus prudente que le défaut');
assert.equal(config.streaming.bufferingGoal, 45, 'Réserve inchangée');
assert.equal(config.streaming.rebufferingGoal, 15, 'Réserve de démarrage (200.0.121)');

const events = [], statuses = [];
p.deps.recordTvDiagnostic = (event, details) => events.push({ event, ...details });
p.deps.setTvPlaybackStatus = (text, state) => statuses.push({ text, state });
let restarts = 0;
p.deps.tvDirectRestart = async () => { restarts += 1; };
const fatal = (category = 3, code = 3016) => player.dispatchEvent(Object.assign(new Event('error'), { detail: { severity: 2, category, code } }));

// Avant la première image : pas de relance automatique, comportement historique.
fatal();
assert.equal(restarts, 0);
assert.equal(statuses.at(-1).state, 'error');

p.video.dispatchEvent(new Event('playing'));
fatal();
await Promise.resolve();
assert.equal(restarts, 1, 'Erreur décodeur en lecture : relance du même flux');
assert.equal(p.video._noctraShakaSegmentsMode, true, 'Après une erreur décodeur, la relance repasse en mode par segments');
assert.equal(events.find(e => e.event === 'shaka-fatal-restart')?.attempt, 1);
assert.equal(p.deps.tvHls, null, 'Aucun changement de moteur');
fatal(4, 4000);
assert.equal(restarts, 2);
fatal();
assert.equal(restarts, 2, 'Au plus deux relances automatiques en cinq minutes');
assert.equal(statuses.at(-1).state, 'error', 'Ensuite, retour au message manuel existant');
assert.ok(!JSON.stringify(events).includes('http'), 'Aucune URL dans le diagnostic');
p.deps.tvVideoEventsController.abort();

// La relance suivante lit bien ce repli.
const q = await playerFixture('LiveWatch', false, { section: 'channels' });
q.video._noctraShakaSegmentsMode = true;
q.deps.tvEnginePreference = 'shaka'; q.deps.ensureShakaLibrary = library;
q.ahead=20;await q.deps.tvDirectRestart();
assert.equal(q.deps.tvShaka.config.manifest.hls.sequenceMode, false);
q.deps.tvVideoEventsController.abort();

// Le diagnostic de recalage indique l'écart au direct pour suivre la réserve.
const d = await playerFixture('LiveWatch', false, { section: 'channels' });
d.deps.tvEnginePreference = 'shaka'; d.deps.ensureShakaLibrary = library;
d.ahead=20;await d.deps.tvDirectRestart();
const seen = [];
d.deps.recordTvDiagnostic = (event, details) => seen.push({ event, ...details });
d.deps.tvShaka.seekRange = () => ({ start: 66.1, end: 103.2 });
d.video.currentTime = 76.6;
d.video.dispatchEvent(new Event('seeking'));
assert.equal(seen.at(-1).liveDistance, 26.6);
assert.equal(seen.at(-1).sequenceMode, true);
d.deps.tvVideoEventsController.abort();

// Le multiview reçoit les mêmes protections réseau.
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const multi = shell.slice(shell.indexOf('bufferingGoal: count <= 4'));
assert.match(multi.slice(0, 1200), /ignoreManifestProgramDateTime: true/);
assert.match(multi.slice(0, 1200), /stallTimeout: 15000/);

console.log('v200.0.108 : Shaka durci (PDT, délais, ABR) et relance bornée après erreur fatale : OK');
