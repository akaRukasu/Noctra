import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(shell.includes("window.addEventListener('click', event => {\n    const carouselButton"));
assert.ok(shell.includes("typeof window.DOMMatrixReadOnly === 'function'"));
assert.ok(shell.includes("transform.startsWith('matrix3d(')"));

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

const slider = {
  computedTransform: 'matrix(1, 0, 0, 1, -420, 0)',
  scrollWidth: 2828,
  offsetWidth: 2828,
  parentElement: { clientWidth: 731 },
  style: { transform: 'translateX(0px)', transition: '' }
};
const scroller = {
  clientWidth: 731,
  offsetWidth: 731,
  scrollWidth: 731,
  scrollLeft: 0,
  querySelector: () => slider
};
const context = {
  homeCarouselTargets: new WeakMap(),
  window: {
    getComputedStyle: element => ({ transform: element.computedTransform || element.style.transform || 'none' }),
    setTimeout: callback => { callback(); return 1; }
  }
};
vm.createContext(context);
vm.runInContext(`${functionSource('getCarouselMetrics')}\n${functionSource('setCarouselPosition')}`, context);

const metrics = vm.runInContext('getCarouselMetrics', context)(scroller);
assert.equal(metrics.position, 420);
assert.equal(metrics.maximum, 2097);
assert.equal(metrics.viewport, 731);
vm.runInContext('setCarouselPosition', context)(scroller, 800, true);
assert.equal(slider.style.transform, 'translate3d(-800px, 0, 0)');
assert.equal(slider.style.transition, 'none');

console.log('Noctra v174 - carrousel sans DOMMatrix et interception prioritaire : OK');
