import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchTorrentMediaFiles } from '../lib/torrent-relink.mjs';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(server.includes("path === '/api/downloads/relink/preview'"));
assert.ok(server.includes("path === '/api/downloads/relink/start'"));
assert.ok(server.includes("path === '/api/downloads/relink/status'"));
assert.ok(server.includes('downloaded >= size * .98'));
assert.ok(server.includes('Number(torrent?.completionOn || 0) > 0'));
assert.ok(server.includes("join(dirname(trashPath), '.noctra-seed')"));
assert.ok(server.includes('await link(sourceReal, target)'));
assert.ok(server.includes("await qbitSetLocation(torrent.hash, torrentRoot)"));
assert.ok(server.includes("await qbitMaintenanceAction(batch.join('|'), 'recheck')"));
assert.match(server, /if \(torrent\.completed && !torrent\.errored\) \{\s*verified\.push\(hash\);\s*await qbitAction\(hash, 'resume'\)/);
assert.match(server, /await qbitAction\(batch\.join\('\|'\), 'pause'\);\s*await qbitMaintenanceAction\(batch\.join\('\|'\), 'recheck'\)/);
assert.ok(shell.includes('data-download-relink-all'));
assert.ok(shell.includes('function downloadRelinkStatusMarkup(status)'));

const preferred = matchTorrentMediaFiles(
  [{ name: 'Film.Release.2025.mkv', size: 1200, priority: 1 }],
  [{ path: '/media/Films/Film (2025)/Film (2025).mkv', size: 1200 }],
  new Map()
);
assert.equal(preferred.matches.length, 1);
assert.equal(preferred.unmatched.length, 0);

const uniqueFallback = matchTorrentMediaFiles(
  [{ name: 'Serie.S01E01.mkv', size: 2400, priority: 1 }],
  [],
  new Map([[2400, [{ path: '/media/Series/Serie/Season 1/Serie S01E01.mkv', size: 2400 }]]])
);
assert.equal(uniqueFallback.matches.length, 1);

const ambiguous = matchTorrentMediaFiles(
  [{ name: 'unknown.bin', size: 16, priority: 1 }],
  [],
  new Map([[16, [{ path: '/media/A/a.bin', size: 16 }, { path: '/media/B/b.bin', size: 16 }]]])
);
assert.equal(ambiguous.matches.length, 0);
assert.equal(ambiguous.unmatched.length, 1);

const ignored = matchTorrentMediaFiles([{ name: 'sample.mkv', size: 10, priority: 0 }], [], new Map());
assert.equal(ignored.wanted.length, 0);

const auxiliary = matchTorrentMediaFiles(
  [
    { index: 0, name: 'Capitaines.S01.COMPLETE.mkv', size: 5_000, priority: 1 },
    { index: 1, name: 'Capitaines.S01.nfo', size: 120, priority: 1 }
  ],
  [],
  new Map([[5_000, [{ path: '/media/Series/Capitaines/Capitaines S01 COMPLETE.mkv', size: 5_000 }]]])
);
assert.equal(auxiliary.matches.length, 1);
assert.equal(auxiliary.unmatched.length, 0);
assert.deepEqual(auxiliary.ignored.map(item => item.index), [1]);

const unrelatedSingle = matchTorrentMediaFiles(
  [{ name: 'Capitaines.S01E01.mkv', size: 8_000, priority: 1 }],
  [],
  new Map([[8_000, [{ path: '/media/Series/Autre/Documentaire.mkv', size: 8_000 }]]])
);
assert.equal(unrelatedSingle.matches.length, 0, 'Une taille identique sans identité de titre ne suffit plus.');

assert.ok(server.includes('function qbitTorrentReadyToReseed'));
assert.ok(server.includes('await verifyRelinkedTorrents(stillReadyToReseed.map(torrent => torrent.hash))'));
assert.ok(server.includes("/api/v2/torrents/filePrio"));

assert.ok(!server.includes("id: 'iptv-org-france'"));
assert.ok(!server.includes('https://iptv-org.github.io/iptv/countries/fr.m3u'));
assert.ok(server.includes("if (line[index] === ',' && !quoted)"));
assert.ok(shell.includes('class="noctra-tv-screen-tools"'));
assert.ok(shell.includes('data-tv-safe-tools-launcher'));
assert.ok(shell.includes('data-tv-screen-fullscreen'));
assert.ok(shell.includes('class="noctra-livewatch-status"'));
assert.ok(!shell.includes('data-livewatch-vip-test'));

const v134Css = css.slice(css.indexOf('/* Noctra V134 - seed relink'));
assert.ok(v134Css.length > 4_000);
assert.match(v134Css, /button\.noctra-dock-button\[data-active="true"\][\s\S]*background: #2c2f37 !important;/);
assert.match(v134Css, /\.headerTop \.headerSyncButton,[\s\S]*background: transparent !important;/);
assert.match(v134Css, /\.noctra-tv-screen-tools[\s\S]*display: flex;/);
assert.match(v134Css, /\.noctra-download-relink-metrics[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);

console.log('v134 seed relink, TV controls, M3U and neutral navigation checks passed');
