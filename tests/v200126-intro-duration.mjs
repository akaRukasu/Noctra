// 200.0.126 — intro de démarrage plus longue : 3,5 s minimum à la première
// ouverture de la session, 2,5 s ensuite, fondu de sortie de 0,7 s. Toujours
// immédiate en mouvement réduit, jamais au-delà de 10 s, filet CSS à 12 s.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const js = await readFile(new URL('public/noctra-aurora.js', root), 'utf8');
const css = await readFile(new URL('public/noctra-aurora.css', root), 'utf8');

assert.match(js, /const minimum = !motionAllowed\(\) \? 0 : seen \? 2500 : 3500;/);
assert.match(js, /\|\| now > 10000\) leave\(\);/, 'Jamais plus de 10 s');
assert.match(js, /window\.setTimeout\(\(\) => intro\.remove\(\), 750\);/);
const block = css.slice(css.indexOf('200.0.126 — Intro plus longue'));
assert.match(block, /#na-intro \{transition:opacity \.7s ease,visibility 0s linear \.7s;\}/);
assert.match(block, /@media \(prefers-reduced-motion:no-preference\) \{\s*html\[data-noctra-skin="aurora"\]:not\(#na-skin\) #na-intro img \{animation:na-intro-mark 1\.3s/);
assert.match(css, /animation:na-intro-failsafe \.01s linear 12s forwards!important;/, 'Filet CSS conservé');

console.log('v200.0.126 : intro de démarrage 3,5 s (2,5 s ensuite), fondu 0,7 s : OK');
