import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../public/noctra-shell.js', import.meta.url);
const sourceBetween = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Fixture source missing: ${start}`);
  return source.slice(from, to);
};

const server = createServer(async (_req, res) => {
  try {
    const source = await readFile(sourceUrl, 'utf8');
    const icons = sourceBetween(source, '  const icons = {', '\n  let activeAutomation');
    const repairs = sourceBetween(source, '  function materialIconFallback(', '\n  const boundHomeCarouselButtons');
    const script = `
      const results = { deliveries: 0, mutations: 0, loop: false, stable: false };
      const OriginalObserver = window.MutationObserver;
      // Stop an infinite microtask loop so the regression can report a failure.
      window.MutationObserver = class extends OriginalObserver {
        constructor(callback) {
          super((records, observer) => {
            results.deliveries++;
            results.mutations += records.length;
            if (results.deliveries > 40) {
              results.loop = true;
              observer.disconnect();
              return;
            }
            callback(records, observer);
          });
        }
      };
      const normalizedText = value => String(value).toLowerCase();
      const markRecentHomeSections = () => {};
      ${icons}
      ${repairs}
      const player = document.querySelector('.videoPlayerContainer');
      const output = document.querySelector('output');
      let allChanges = 0;
      const audit = new OriginalObserver(records => { allChanges += records.length; });
      audit.observe(player, { subtree: true, childList: true, attributes: true });
      observeNativePlayerIcons(player);
      setTimeout(() => {
        const previous = results.deliveries;
        document.querySelector('#toggle .material-icons').className = 'material-icons play_arrow';
        setTimeout(() => {
          results.dynamicIcon = document.querySelector('#toggle svg')?.dataset.noctraMaterialIcon;
          results.iconCount = document.querySelectorAll('#toggle svg').length;
          results.deliveriesAfterChange = results.deliveries - previous;
          const beforeRepeat = results.deliveries;
          const changesBeforeRepeat = allChanges;
          for (let i = 0; i < 5; i++) repairMaterialIconFallbacks(player);
          setTimeout(() => {
            results.stable = results.deliveries === beforeRepeat && allChanges === changesBeforeRepeat;
            const added = document.createElement('button');
            added.innerHTML = '<span class="material-icons theaters"></span>';
            player.append(added);
            setTimeout(() => {
              results.insertedIcon = added.querySelector('svg')?.dataset.noctraMaterialIcon;
              results.originalHidden = [...player.querySelectorAll('.material-icons')].every(icon => icon.hidden && icon.getAttribute('aria-hidden') === 'true');
              observeNativePlayerIcons(null);
              audit.disconnect();
              results.passed = !results.loop && results.stable && results.dynamicIcon === 'play' && results.iconCount === 1 && results.insertedIcon === 'film' && results.originalHidden;
              output.textContent = JSON.stringify(results);
              document.title = results.passed ? 'PASS - playback UI' : 'FAIL - playback UI';
            }, 80);
          }, 80);
        }, 80);
      }, 80);
    `;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><title>Playback UI test</title></head><body>
      <div class="videoPlayerContainer"><button id="toggle"><span class="material-icons pause"></span></button></div>
      <div id="videoOsdPage"><button><span class="material-icons fullscreen"></span></button></div>
      <output>Running</output><script>${script}</script></body></html>`);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

server.listen(40516, '127.0.0.1', () => console.log('Playback UI regression: http://127.0.0.1:40516'));
