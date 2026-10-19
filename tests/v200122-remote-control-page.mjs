// 200.0.122 — page « Contrôle à distance » de Jellyfin (#/queue) : la file
// d'attente masquée (.hide) n'est plus forcée à l'écran par la grille mobile
// des médiathèques, qui recouvrait toute la télécommande d'un bloc sombre.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const base = '.libraryPage:not(.homePage):not(.itemDetailPage):not(.itemDetailsPage)';

// 1. La grille mobile des médiathèques ne vise plus la page de télécommande
//    ni un conteneur masqué par Jellyfin.
const mobileRules = theme.match(/body:not\(\.noctra-home\):not\(\.noctra-detail\) \.libraryPage[^{]*\{/g) ?? [];
assert.ok(mobileRules.length >= 5);
for (const rule of mobileRules) {
  for (const selector of rule.slice(0, -1).split(/,\s*/)) {
    if (!selector.includes(base)) continue;
    assert.ok(selector.includes(':not(.nowPlayingPage)'), `Télécommande exclue : ${selector.trim().slice(0, 120)}`);
    if (selector.includes('.itemsContainer')) assert.ok(selector.includes('.itemsContainer:not(.hide)'), `Conteneur masqué respecté : ${selector.trim().slice(0, 120)}`);
  }
}
// 2. Aucune règle « display … !important » sur .itemsContainer d'une page
//    bibliothèque ne peut plus l'emporter sur .hide.
const forced = [...theme.matchAll(/([^{}]*\.libraryPage[^{}]*\.itemsContainer(?!:not\(\.hide\))[^{}]*)\{[^}]*display:\s*(?:flex|grid|block)\s*!important/g)]
  .map(match => match[1].trim()).filter(selector => !/:not\(\.hide\)/.test(selector) && !/\.homePage|\.itemDetailPage\b(?!\))/.test(selector.replace(/:not\([^)]*\)/g, '')));
assert.deepEqual(forced.filter(selector => selector.includes(base)), [], 'Plus de grille forcée sur un conteneur masqué');
// 3. Les grilles desktop des médiathèques respectent aussi .hide.
assert.equal((theme.match(/\.itemsContainer:not\(\.hide\):has\(> \.card\.portraitCard\)/g) || []).length, 3);

console.log('v200.0.122 : page « Contrôle à distance » débloquée (file d’attente masquée respectée) : OK');
