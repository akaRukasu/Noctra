import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, shell, server, index, sw, theme] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8')
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

const repairStart = shell.indexOf('function repairScrollArrowButtons(root = document)');
const repairEnd = shell.indexOf('\n  function repairAuthenticatedViewState', repairStart);
const repair = shell.slice(repairStart, repairEnd);
assert.ok(repair.includes("button.dataset.noctraCarouselEngine = nativeScrollerReady ? 'jellyfin-api' : 'dom-fallback'"));
assert.ok(!repair.includes('if (nativeScrollerReady) return;'));
assert.ok(repair.indexOf('event.preventDefault()') < repair.indexOf('moveHomeCarousel(button)'));
assert.ok(repair.includes('syncHomeCarouselButtons(carousel)'));

const syncStart = shell.indexOf('function syncHomeCarouselButtons(carousel)');
const syncEnd = shell.indexOf('\n  function moveHomeCarousel', syncStart);
const sync = shell.slice(syncStart, syncEnd);
assert.ok(sync.includes('const extending = canExtend && feed.loading'));
assert.ok(sync.includes(': extending || (!canExtend'));
assert.ok(shell.includes('const contentMaximum = Math.max(0, Number(tail?.offsetLeft || 0)'));
assert.ok(shell.includes('const nativeRangeCoversContent = metrics.nativeMaximum >= metrics.maximum - 8'));
assert.ok(shell.includes("metrics.slider.style.transition = 'none'"));
assert.ok(shell.includes("scroller.scrollToPosition(normalizedPosition, false)"));
assert.ok(shell.includes("behavior: 'auto'"));
assert.ok(shell.includes("sample?.classList.contains('overflowPortraitCard')"));
assert.ok(shell.includes('function recycleHomeCarouselItems(state, position)'));
assert.ok(shell.includes('domLimit: window.innerWidth >= 1800 ? 120 : 96'));
assert.ok(shell.includes('cards.slice(0, excess).forEach(card => card.remove())'));
const decorateStart = shell.indexOf('function decorateHomeCarousel(button)');
const decorateEnd = shell.indexOf('\n  function homeCarouselDirection', decorateStart);
assert.ok(!shell.slice(decorateStart, decorateEnd).includes("classList.add('noctra-carousel-moving')"));
assert.match(theme, /\.homePage \.lazy-image-fadein,[\s\S]*?animation:\s*none !important/);

const observerStart = shell.indexOf('const observer = new MutationObserver(mutations =>');
const observerEnd = shell.indexOf('\n  const installTvSafeExtrasObserver', observerStart);
const observerBlock = shell.slice(observerStart, observerEnd);
assert.ok(observerBlock.includes('mutationRootsForSelector(mutations, scrollSelector)'));
assert.ok(observerBlock.includes('scrollRoots.forEach(root => repairScrollArrowButtons(root))'));
assert.ok(!observerBlock.includes('\n    repairScrollArrowButtons();'));
assert.ok(!observerBlock.includes('mutationTargetsSelector(mutations, homeMutationSelector)'));
assert.ok(!shell.includes("homeMutationSelector = '.homePage .homeSectionsContainer, .homePage .verticalSection, .homePage .sectionTitle, .homePage .itemsContainer'"));
assert.ok(shell.includes('element.parentElement?.parentElement || element.parentElement || element'));

assert.match(theme, /body\.noctra-home \.homePage \.verticalSection:empty \{[\s\S]*?display:\s*none !important/);
assert.match(theme, /body\.noctra-home \.homePage \.noctra-my-media-section \{[\s\S]*?contain-intrinsic-size:\s*none !important/);
assert.match(theme, /@media \(max-width: 760px\) \{[\s\S]*?body\.noctra-home \.homePage \.homeSectionsContainer \{[\s\S]*?padding-bottom:\s*0 !important/);
assert.match(theme, /body\.noctra-detail \.itemDetailPage \.detailRibbon > \.mainDetailButtons,[\s\S]*?grid-column:\s*1 \/ -1 !important[\s\S]*?justify-content:\s*center !important/);
assert.match(theme, /\.itemDetailPage \.mainDetailButtons \.detailButton,[\s\S]*?border-radius:\s*50% !important/);
assert.match(theme, /body\.noctra-detail \.mainDetailButtons \.detailButton\.hide,[\s\S]*?display:\s*none !important/);
assert.match(theme, /#reactRoot:has\(> \.splashLogo\) > \.splashLogo[\s\S]*?place-items:\s*center !important|#reactRoot:has\(> \.splashLogo\)[\s\S]*?place-items:\s*center !important/);
assert.match(theme, /#reactRoot:has\(> \.splashLogo\) ~ #noctra-dock/);
assert.ok(server.includes('relink: publicDownloadRelinkJob()'));
assert.ok(shell.includes('async function requestDownloadRelinkStatus()'));
assert.ok(shell.includes('snapshot?.relink'));

assert.ok(shell.includes('let adaptiveRebuffering = false'));
assert.ok(shell.includes('adaptiveRebufferCycles += 1'));
assert.ok(shell.includes('Math.min(18, base + Math.max(0, adaptiveRebufferCycles - 1) * 2)'));
assert.ok(shell.includes('now - adaptiveRebufferLastAt > 180_000'));
assert.ok(shell.includes("recordTvDiagnostic('adaptive-rebuffer-start'"));
assert.ok(shell.includes("recordTvDiagnostic('adaptive-rebuffer-ready'"));
assert.ok(shell.includes('if (repeatedStall && beginAdaptiveRebuffer())'));
assert.ok(shell.includes('if (adaptiveRebuffering) resumeAdaptiveRebuffer(false)'));
assert.ok(shell.includes('hlsOptions.maxBufferLength = Math.max(hlsOptions.maxBufferLength, 75)'));
assert.ok(shell.includes('hlsOptions.maxMaxBufferLength = Math.max(hlsOptions.maxMaxBufferLength, 120)'));
assert.ok(shell.includes('hlsOptions.fragLoadingMaxRetry = Math.max(hlsOptions.fragLoadingMaxRetry, 12)'));
assert.ok(shell.includes('const protectedStartupBufferGoal = bufferedResolvedStream'));
assert.ok(shell.includes('stabilitySensitiveStream ? 16 : (conservativePublicStream ? 10 : 12)'));

console.log('Noctra v199 - flèches déterministes et réserve TV adaptative : OK');
