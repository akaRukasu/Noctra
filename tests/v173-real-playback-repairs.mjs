import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [pkg, shell, theme, server, index, sw, manifest] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/noctra.webmanifest', root), 'utf8').then(JSON.parse)
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(manifest.icons.every(icon => icon.src.includes('?v=182')));

const v173Theme = theme.slice(theme.lastIndexOf('/* Noctra V173'));
assert.match(v173Theme, /noctra-my-media-section \.cardScalable \{[\s\S]*?position:\s*relative !important/);
assert.match(v173Theme, /noctra-my-media-section \.cardImageContainer \{[\s\S]*?position:\s*absolute !important;[\s\S]*?inset:\s*0 !important/);
assert.match(v173Theme, /body\.noctra-playing \.backgroundContainer,[\s\S]*?visibility:\s*hidden !important/);
assert.match(v173Theme, /#reactRoot \.splashLogo \{[\s\S]*?position:\s*absolute !important;[\s\S]*?top:\s*50% !important;[\s\S]*?left:\s*50% !important/);

assert.ok(shell.includes('const sliderMaximum = Math.max(0'));
assert.ok(shell.includes("typeof window.DOMMatrixReadOnly === 'function'"));
assert.ok(shell.includes("transform.startsWith('matrix3d(')"));
assert.ok(shell.includes('metrics.slider.style.transform = `translate3d('));
assert.ok(shell.includes("typeof carousel.scroller.addScrollEventListener === 'function'"));

assert.ok(shell.includes('const preferredTop = Math.max(safe, triggerRect.bottom + 8)'));
assert.ok(shell.includes('window.setTimeout(settleHeaderMenu, 90)'));
assert.ok(!shell.includes('viewportHeight - menuHeight - safe'));

assert.ok(shell.includes('function tvLatestBufferedWindow('));
assert.ok(shell.includes('function tvSeekIntoBufferedWindow('));
assert.ok(shell.includes('function tvSkipBufferedGap('));
assert.ok(shell.includes("recordTvDiagnostic('live-buffer-gap-skipped'"));
assert.ok(shell.includes('const startupBufferGoal = networkProfile.weak ? 12 : (stabilitySensitiveStream ? 10 : 8)'));
assert.ok(shell.includes('const bufferedWindow = tvLatestBufferedWindow(video'));
assert.ok(!shell.includes('Math.max(tvBufferedAhead(video), tvBufferedSpan(video))'));

function functionSource(name) {
  const start = shell.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} doit exister`);
  const bodyStart = shell.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < shell.length; index += 1) {
    if (shell[index] === '{') depth += 1;
    if (shell[index] === '}') depth -= 1;
    if (depth === 0) return shell.slice(start, index + 1);
  }
  throw new Error(`Corps incomplet pour ${name}`);
}

const tvContext = { result: null, document: { querySelector: () => null } };
vm.createContext(tvContext);
vm.runInContext(`${functionSource('tvLatestBufferedWindow')}\n${functionSource('tvSeekIntoBufferedWindow')}\n${functionSource('tvSkipBufferedGap')}`, tvContext);
const ranges = [[12, 16], [24, 36], [44, 52]];
const video = {
  currentTime: 52,
  buffered: {
    length: ranges.length,
    start: index => ranges[index][0],
    end: index => ranges[index][1]
  }
};
const latestEight = vm.runInContext('tvLatestBufferedWindow', tvContext)(video, 8);
assert.deepEqual({ ...latestEight }, { start: 44, end: 52, duration: 8 });
assert.equal(vm.runInContext('tvSeekIntoBufferedWindow', tvContext)(video, latestEight, 8), true);
assert.ok(video.currentTime > 44 && video.currentTime < 44.2);
video.currentTime = 16;
assert.equal(vm.runInContext('tvSkipBufferedGap', tvContext)(video, 12), true);
assert.ok(video.currentTime > 24 && video.currentTime < 24.1);

assert.ok(server.includes('const stableKey = String(channel.externalUrl || channel.id'));
assert.ok(server.includes('map.set(stableKey, channel)'));

console.log('Noctra v173 - rendu media, carrousels, menus et lecture reelle : OK');
