#!/usr/bin/env node
/* Régénère les icônes, bannières et écrans de démarrage des applications à
   partir du logo Noctra (public/noctra-mark.svg). Outil de développement :
   nécessite Playwright (npx playwright). Les images produites sont versionnées,
   la construction des applis n'en a donc pas besoin. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const appsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appsRoot, '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

const mark = await readFile(join(repoRoot, 'public', 'noctra-mark.svg'), 'utf8');
const font = (await readFile(join(repoRoot, 'public', 'fonts', 'sora-latin-wght.woff2'))).toString('base64');

// Le « N » Noctra sans son carré arrondi, pour les icônes pleine surface.
const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="9" y1="9" x2="55" y2="55" gradientUnits="userSpaceOnUse">
    <stop stop-color="#78a8ff"/><stop offset=".52" stop-color="#8b6cff"/><stop offset="1" stop-color="#d070ff"/>
  </linearGradient></defs>
  <path d="M17 45V19l30 26V19" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="47" cy="18" r="4" fill="#72e8ff"/>
</svg>`;
const uri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const background = 'radial-gradient(circle at 30% 20%, #242b50, #080b17 75%)';

const page = content => `<!doctype html><html><head><style>
@font-face { font-family: Sora; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 800; }
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { display: flex; align-items: center; justify-content: center; font-family: Sora, sans-serif; color: #eef1ff; }
</style></head><body>${content}</body></html>`;

// Icône avec son carré arrondi et fond transparent (webOS, Tizen, Android ancien).
const roundedIcon = size => page(`<img src="${uri(mark)}" style="width:${size}px;height:${size}px">`);
// Icône pleine surface, sans transparence (iOS).
const fullIcon = size => page(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${background}">
  <img src="${uri(glyph)}" style="width:${size * .86}px;height:${size * .86}px"></div>`);
// Premier plan des icônes adaptatives Android (zone sûre : 66 % du centre).
const adaptiveForeground = size => page(`<img src="${uri(glyph)}" style="width:${size * .62}px;height:${size * .62}px">`);
const wordmark = (width, height, markSize, textSize, gap) => page(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(70% 90% at 15% 10%, rgba(120,168,255,.28), transparent 60%), radial-gradient(60% 80% at 90% 100%, rgba(208,112,255,.24), transparent 60%), #050711">
  <img src="${uri(mark)}" style="width:${markSize}px;height:${markSize}px;margin-right:${gap}px">
  <span style="font-size:${textSize}px;font-weight:700;letter-spacing:-.02em">Noctra</span></div>`);

const targets = [
  ['webos/icon-80.png', 80, 80, roundedIcon(80), true],
  ['webos/icon-130.png', 130, 130, roundedIcon(130), true],
  ['webos/splash.png', 1920, 1080, wordmark(1920, 1080, 200, 150, 48), false],
  ['tizen/icon.png', 512, 512, roundedIcon(512), true],
  ['android/app/src/main/res/drawable-xhdpi/banner.png', 320, 180, wordmark(320, 180, 64, 50, 16), false],
  ['ios/Noctra/Assets.xcassets/AppIcon.appiconset/icon-1024.png', 1024, 1024, fullIcon(1024), false]
];
for (const [folder, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  targets.push([`android/app/src/main/res/mipmap-${folder}/ic_launcher.png`, size, size, roundedIcon(size), true]);
}
targets.push(['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, 432, adaptiveForeground(432), true]);

const browser = await playwright.chromium.launch();
try {
  for (const [target, width, height, html, transparent] of targets) {
    const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await tab.setContent(html);
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(50);
    const file = join(appsRoot, target);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await tab.screenshot({ omitBackground: transparent }));
    await tab.close();
    console.log(`${target} (${width}×${height})`);
  }
} finally {
  await browser.close();
}
