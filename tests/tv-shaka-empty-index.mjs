import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const vendor=await readFile(new URL('../public/vendor/shaka-player.compiled.js',import.meta.url),'utf8');
const context={console,setTimeout,clearTimeout,setInterval,clearInterval,TextDecoder,TextEncoder,URL,AbortController,navigator:{userAgent:'test'}};
context.self=context;context.global=context;vm.createContext(context);vm.runInContext(vendor,context);
vm.runInContext(source.slice(source.indexOf('  function prepareTvShaka('),source.indexOf('  function ensureShakaLibrary(')),context);
vm.runInContext(`
 const index = new shaka.media.SegmentIndex([]);
 let failed = false;
 try { [...index]; } catch { failed = true; }
 if (!failed) throw new Error('Upstream already fixed: remove compatibility shim');
 prepareTvShaka(shaka);
 if ([...index].length) throw new Error('Empty index is not empty');
 const original = shaka.media.SegmentIndex.prototype[Symbol.iterator];
 prepareTvShaka(shaka);
 if (original !== shaka.media.SegmentIndex.prototype[Symbol.iterator]) throw new Error('Repeated wrapping');
 const full = shaka.media.SegmentIndex.forSingleSegment(0, 10, ['https://example.test/segment']);
 if ([...full].length !== 1) throw new Error('Nonempty index changed');
 full.evict(11);
 if ([...full].length !== 0) throw new Error('Evicted index must be iterable');
`,context);
assert.ok(context.shaka.Player.version.includes('5.2.10'));
console.log('Real Shaka 5.2.10: empty/evicted live index no longer throws; valid segments and idempotence preserved.');
