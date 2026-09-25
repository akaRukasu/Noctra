import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');

assert.ok(shell.includes("const NOCTRA_BUILD_VERSION = '200.0.21'"));

assert.ok(shell.includes('async function waitForTvPlayer(sequence, timeoutMs = 4_000)'));
assert.ok(shell.includes('!await waitForTvPlayer(sequence)'));
assert.ok(shell.indexOf('!await waitForTvPlayer(sequence)') < shell.indexOf('await playTvChannel(index)', shell.indexOf('async function openTvFavorite')));

assert.ok(shell.includes("? 'Series'"));
assert.ok(shell.includes("? 'Movie'"));
assert.ok(shell.includes("query.ParentId = state.parentId"));
assert.ok(shell.includes('IncludeItemTypes: state.includeItemTypes'));
assert.ok(shell.includes('setCarouselPosition(scroller, target, true)'));
assert.ok(shell.includes("const canExtend = direction === 'right' && feed && !feed.exhausted"));

assert.ok(shell.includes("frame.referrerPolicy = channel?.liveWatchDocsEmbed ? 'no-referrer' : 'strict-origin-when-cross-origin'"));
assert.ok(shell.includes("wiTvWebFrame || liveWatchVipBridge || publicGate ? 'loading' : 'playing'"));
assert.ok(shell.includes("const startProviderWebFallback = (reason = '')"));
assert.ok(shell.includes("}, /^WiTV$/i.test(playbackProvider) ? 12_000 : 22_000)"));
assert.ok(shell.includes("recordTvDiagnostic('oha-sustained-stall-fallback'"));

assert.match(theme, /body\.noctra-playing \.skinHeader\.osdHeader\s*\{[\s\S]*?background:\s*transparent !important/);
assert.match(theme, /\.noctra-menu-icon-fixed::before\s*\{[\s\S]*?content:\s*none !important/);
assert.match(theme, /data-noctra-header-menu="syncplay"[\s\S]*?border-radius:\s*8px !important/);

console.log('Noctra v179 - lecture, favoris TV, carrousels et SyncPlay : OK');
