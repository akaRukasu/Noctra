#!/usr/bin/env node
/* Construit Noctra pour les Samsung Smart TV de 2014 (plateforme « Orsay »,
   série H : UE40H6400…), sans SDK ni dépendance :
     dist/apps/samsung-2014/Noctra.zip            appli (format « widget » Samsung)
     dist/apps/samsung-2014/widgetlist.xml        liste pour « User App Sync » (modèle)
     dist/apps/samsung-2014/serveur/…             serveur d'installation et relais local
     dist/apps/samsung-2014/*.md                  guide et rapport de compatibilité
     dist/apps/Noctra-Samsung-2014-<version>.zip  le tout, à décompresser sur un PC

   L'interface est celle de Noctra TV (apps/androidtv/web), avec :
     - app.css converti pour le moteur WebKit 537 du téléviseur (variables
       remplacées, grilles CSS en flexbox -webkit-, préfixes, dégradés anciens) ;
     - les compléments et l'hôte de apps/samsung-orsay.

   Usage : node apps/scripts/build-orsay.mjs */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zip } from './zip.mjs';

const appsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appsRoot, '..');
const variantRoot = join(appsRoot, 'samsung-orsay');
const tvRoot = join(appsRoot, 'androidtv', 'web');

// Révision de la variante Samsung 2014 (à augmenter à chaque livraison).
export const ORSAY_REVISION = 1;
export const DEFAULT_SERVER = 'https://akarukasu.merlion.usbx.me/noctra';

// ── Conversion du style pour WebKit 537 (2013) ────────────────────────────
const REM = 16, VW = 12.8, VH = 7.2;

function splitTop(text, separator) {
  const parts = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Règles CSS : { selector, decls: [{ prop, value, important }] } ou { at, prelude, body: [...] }. */
export function parseCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block() {
    const items = [];
    while (i < css.length) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (i >= css.length || css[i] === '}') { i++; break; }
      const open = css.indexOf('{', i);
      const semi = css.indexOf(';', i);
      if (css[i] === '@' && semi >= 0 && (open < 0 || semi < open)) { items.push({ raw: css.slice(i, semi + 1).trim() }); i = semi + 1; continue; }
      if (open < 0) break;
      const head = css.slice(i, open).trim();
      i = open + 1;
      if (/^@(media|supports|-webkit-keyframes|keyframes|document)/.test(head)) {
        items.push({ at: head, body: block() });
        continue;
      }
      const close = css.indexOf('}', i);
      const body = css.slice(i, close);
      i = close + 1;
      const decls = splitTop(body, ';').map(part => part.trim()).filter(Boolean).map(part => {
        const colon = part.indexOf(':');
        let value = part.slice(colon + 1).trim();
        const important = /!important\s*$/.test(value);
        if (important) value = value.replace(/\s*!important\s*$/, '');
        return { prop: part.slice(0, colon).trim().toLowerCase(), value, important };
      });
      items.push({ selector: head, decls });
    }
    return items;
  }
  return block();
}

function serialize(items, indent = '') {
  return items.map(item => {
    if (item.raw) return indent + item.raw;
    if (item.at) return `${indent}${item.at} {\n${serialize(item.body, indent + '  ')}\n${indent}}`;
    if (!item.decls.length) return '';
    return `${indent}${item.selector} { ${item.decls.map(d => `${d.prop}: ${d.value}${d.important ? ' !important' : ''}`).join('; ')}; }`;
  }).filter(Boolean).join('\n');
}

// Longueur évaluée pour l'appli en 1280 × 720 (min(), max()).
function lengthPx(token) {
  const match = /^(-?\d*\.?\d+)(rem|px|vw|vh|em)?$/.exec(token.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2] || 'px';
  return unit === 'rem' || unit === 'em' ? value * REM : unit === 'vw' ? value * VW : unit === 'vh' ? value * VH : value;
}
function staticMinMax(value) {
  return value.replace(/\b(min|max)\(([^()]*)\)/g, (whole, fn, args) => {
    const list = splitTop(args, ',').map(part => part.trim());
    const measured = list.map(lengthPx);
    if (measured.some(item => item === null)) return whole;
    const pick = fn === 'min' ? Math.min(...measured) : Math.max(...measured);
    return list[measured.indexOf(pick)];
  });
}

function resolveVars(value, vars, depth = 0) {
  if (depth > 8 || value.indexOf('var(') < 0) return value;
  return resolveVars(value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (whole, name, fallback) => {
    if (vars[name] !== undefined) return vars[name];
    return fallback !== undefined ? fallback.trim() : whole;
  }), vars, depth + 1);
}

// Dégradés à l'ancienne syntaxe -webkit- (sens et position inversés).
function legacyGradient(kind, repeating, inner) {
  const args = splitTop(inner, ',').map(part => part.trim());
  if (kind === 'linear') {
    const first = args[0];
    const sides = { 'to bottom': 'top', 'to top': 'bottom', 'to right': 'left', 'to left': 'right', 'to bottom right': 'top left', 'to top left': 'bottom right', 'to bottom left': 'top right', 'to top right': 'bottom left' };
    if (sides[first]) args[0] = sides[first];
    else if (/^-?\d*\.?\d+deg$/.test(first)) args[0] = `${90 - parseFloat(first)}deg`;
    return `-webkit-${repeating}linear-gradient(${args.join(', ')})`;
  }
  const at = /^(.*?)\s*\bat\s+(.+)$/.exec(args[0]);
  if (at) args.splice(0, 1, at[2], ...(at[1] ? [at[1]] : []));
  return `-webkit-${repeating}radial-gradient(${args.join(', ')})`;
}
export function legacyGradients(value) {
  const pattern = /(repeating-)?(linear|radial)-gradient\(/g;
  let out = '', from = 0, match;
  while ((match = pattern.exec(value))) {
    const start = match.index;
    let depth = 1, end = start + match[0].length;
    while (end < value.length && depth) { if (value[end] === '(') depth++; else if (value[end] === ')') depth--; end++; }
    if (value.slice(Math.max(0, start - 8), start) === '-webkit-') continue;
    out += value.slice(from, start) + legacyGradient(match[2], match[1] || '', value.slice(start + match[0].length, end - 1));
    from = end;
    pattern.lastIndex = end;
  }
  return out + value.slice(from);
}
function gradientFallback(value) {
  const layers = splitTop(value, ',').map(part => part.trim());
  const last = layers[layers.length - 1];
  if (last && !/gradient\(/.test(last) && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)$/i.test(last)) return last;
  const color = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/i.exec(value);
  return color ? color[1] : '';
}

const FLEX_PROPS = new Set(['flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'align-items', 'align-self', 'align-content', 'justify-content']);
const WEBKIT_PROPS = new Set(['transform', 'transform-origin', 'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
  'filter', 'user-select', 'appearance', 'backface-visibility', 'perspective', 'mask-image', 'mask-size', 'mask-repeat', 'mask-position', 'box-sizing']);
const DROPPED = new Set(['will-change', 'backdrop-filter', '-webkit-backdrop-filter', 'grid-gap', 'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
  'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows', 'grid-column', 'grid-row', 'grid-area', 'place-items', 'place-content', 'place-self', 'justify-items', 'justify-self']);
const UNSUPPORTED_SELECTORS = /:focus-within|:focus-visible|:is\(|:where\(|:has\(|::placeholder/;

function flexValue(value) { return value.replace(/(^|[^-\w])start\b/g, '$1flex-start').replace(/(^|[^-\w])end\b/g, '$1flex-end').replace(/\bspace-evenly\b/g, 'space-around'); }

function prefixDecls(decls) {
  const out = [];
  for (const decl of decls) {
    const { prop } = decl;
    const value = staticMinMax(decl.value);
    if (DROPPED.has(prop)) continue;
    const add = (name, text) => out.push({ prop: name, value: text, important: decl.important });
    const webkitValue = text => text.replace(/\btransform\b/g, '-webkit-transform').replace(/\bfilter\b/g, '-webkit-filter');
    if (prop === 'display' && /^(inline-)?flex$/.test(value)) { add('display', value === 'flex' ? '-webkit-flex' : '-webkit-inline-flex'); add('display', value); continue; }
    if (FLEX_PROPS.has(prop)) { const text = flexValue(value); add('-webkit-' + prop, text); add(prop, text); continue; }
    // Transitions : forme préfixée en dernier (c'est elle que ce moteur applique).
    if (/^transition/.test(prop)) { add(prop, value); add('-webkit-' + prop, webkitValue(value)); continue; }
    if (prop === 'mask-image') { add('-webkit-mask-image', legacyGradients(value)); continue; }
    if (WEBKIT_PROPS.has(prop)) { add('-webkit-' + prop, webkitValue(value)); add(prop, value); continue; }
    if ((prop === 'background' || prop === 'background-image') && /gradient\(/.test(value)) {
      const fallback = gradientFallback(value);
      if (fallback && prop === 'background') add('background-color', fallback);
      add(prop, legacyGradients(value));
      add(prop, value);
      continue;
    }
    if (/\bcalc\(/.test(value)) add(prop, value.replace(/\bcalc\(/g, '-webkit-calc('));
    add(prop, value);
  }
  return out;
}

function compoundParts(selector) {
  const trimmed = selector.trim();
  const cut = Math.max(trimmed.lastIndexOf(' '), trimmed.lastIndexOf('>'));
  const prefix = trimmed.slice(0, cut + 1);
  const last = trimmed.slice(cut + 1);
  return { prefix, parts: last.match(/[.#]?[\w-]+|\[[^\]]+\]|::?[\w-]+(\([^)]*\))?/g) || [last] };
}

/** app.css → CSS lisible par le moteur web des Samsung de 2014. */
export function convertCss(css) {
  const items = parseCss(css);
  const vars = {};
  for (const item of items) if (item.selector === ':root') for (const decl of item.decls) if (decl.prop.startsWith('--')) vars[decl.prop] = decl.value;
  const resolve = list => list.forEach(item => {
    if (item.body) resolve(item.body);
    if (item.decls) item.decls = item.decls.filter(d => !d.prop.startsWith('--')).map(d => ({ ...d, value: resolveVars(d.value, vars) }));
  });
  resolve(items);

  // Grilles : relevé (sélecteur → espacement, colonnes, orientation).
  const info = new Map();
  const get = (decls, name) => { const found = decls.filter(d => d.prop === name); return found.length ? found[found.length - 1].value : undefined; };
  for (const item of items) {
    if (!item.decls) continue;
    const display = get(item.decls, 'display');
    const entry = {
      grid: /^(inline-)?grid$/.test(display || ''), gap: get(item.decls, 'grid-gap') ?? get(item.decls, 'gap'),
      template: get(item.decls, 'grid-template-columns'), column: get(item.decls, 'grid-auto-flow') === 'column'
    };
    for (const selector of splitTop(item.selector, ',')) {
      const key = selector.trim();
      info.set(key, { ...(info.get(key) || {}), ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== false)) });
    }
  }
  const lookup = (selector, field) => {
    const own = info.get(selector.trim());
    if (own && own[field] !== undefined) return own[field];
    const { prefix, parts } = compoundParts(selector);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts.length < 2) break;
      const base = info.get(prefix + parts.filter((_, j) => j !== i).join(''));
      if (base && base[field] !== undefined) return base[field];
    }
    return undefined;
  };
  const gaps = value => { const list = String(value || '').trim().split(/\s+/).filter(Boolean); return list.length ? [list[0], list[1] || list[0]] : null; };

  const out = [];
  const child = (selectors, suffix, decls) => ({ selector: selectors.map(s => s.trim() + suffix).join(', '), decls });
  for (const item of items) {
    if (!item.decls) {
      if (item.at && /keyframes/.test(item.at)) {
        const name = item.at.replace(/^@(-webkit-)?keyframes\s+/, '');
        const frames = body => body.map(frame => ({ selector: frame.selector, decls: prefixDecls(frame.decls) }));
        out.push({ at: '@-webkit-keyframes ' + name, body: frames(item.body) }, { at: '@keyframes ' + name, body: frames(item.body) });
      } else out.push(item);
      continue;
    }
    const selectors = splitTop(item.selector, ',');
    const decls = item.decls;
    const display = get(decls, 'display');
    const isGrid = /^(inline-)?grid$/.test(display || '');
    const template = get(decls, 'grid-template-columns');
    const column = get(decls, 'grid-auto-flow') === 'column';
    const ownGap = get(decls, 'grid-gap') ?? get(decls, 'gap');
    const extra = [];
    const added = [];
    const inline = display === 'inline-grid';
    const flexDisplay = () => added.push({ prop: 'display', value: inline ? 'inline-flex' : 'flex' });
    const gapFor = () => gaps(ownGap ?? lookup(selectors[0], 'gap'));
    if (template) {
      flexDisplay();
      const [rowGap, colGap] = gapFor() || ['0', '0'];
      const fill = /repeat\(\s*auto-fill\s*,\s*minmax\(\s*([\d.]+rem)\s*,\s*1fr\s*\)\s*\)/.exec(template);
      const columns = fill ? null : splitTop(template.trim().replace(/\s+/g, ' '), ' ').filter(Boolean);
      const equal = columns && columns.length > 1 && columns.every(col => col === '1fr');
      if (fill || equal) {
        // Colonnes égales sur la largeur : nombre calculé pour l'écran 1280 px (75 rem utiles).
        const gapPx = lengthPx(colGap) || 0;
        const n = equal ? columns.length : Math.max(1, Math.floor((75 * REM + gapPx) / (lengthPx(fill[1]) + gapPx)));
        added.push({ prop: 'flex-direction', value: 'row' }, { prop: 'flex-wrap', value: 'wrap' }, { prop: 'align-content', value: 'flex-start' });
        extra.push(child(selectors, ' > :nth-child(n)', [
          { prop: 'width', value: `calc((100% - ${n - 1} * ${colGap}) / ${n})` }, { prop: 'flex', value: 'none' },
          { prop: 'margin-top', value: '0' }, { prop: 'margin-left', value: '0' }, { prop: 'margin-right', value: colGap }, { prop: 'margin-bottom', value: rowGap }
        ]));
        extra.push(child(selectors, ` > :nth-child(${n}n)`, [{ prop: 'margin-right', value: '0' }]));
      } else {
        added.push({ prop: 'flex-direction', value: 'row' }, { prop: 'flex-wrap', value: 'nowrap' });
        columns.forEach((col, index) => {
          const rules = col === '1fr' ? [{ prop: 'flex', value: '1' }, { prop: 'min-width', value: '0' }]
            : col === 'auto' || col === 'max-content' ? [{ prop: 'flex', value: 'none' }]
              : [{ prop: 'width', value: col }, { prop: 'flex', value: 'none' }];
          extra.push(child(selectors, ` > :nth-child(${index + 1})`, rules));
        });
        extra.push(child(selectors, ' > :nth-child(n+2)', [{ prop: 'margin-top', value: '0' }, { prop: 'margin-left', value: colGap }]));
      }
    } else if (column) {
      flexDisplay();
      added.push({ prop: 'flex-direction', value: 'row' }, { prop: 'flex-wrap', value: 'nowrap' });
      const [, colGap] = gapFor() || ['0', '0'];
      extra.push(child(selectors, ' > :nth-child(n)', [{ prop: 'flex', value: 'none' }, { prop: 'margin-top', value: '0' }]));
      extra.push(child(selectors, ' > :nth-child(n+2)', [{ prop: 'margin-left', value: colGap }]));
    } else if (isGrid) {
      // Grille d'une colonne : pile verticale (flexbox en colonne, sans rétrécir).
      flexDisplay();
      added.push({ prop: 'flex-direction', value: 'column' });
      const place = get(decls, 'place-items');
      const justifyItems = get(decls, 'justify-items');
      const alignContent = get(decls, 'align-content');
      if (place === 'center') added.push({ prop: 'align-items', value: 'center' }, { prop: 'justify-content', value: 'center' });
      if (justifyItems) added.push({ prop: 'align-items', value: justifyItems === 'center' ? 'center' : justifyItems === 'start' ? 'flex-start' : justifyItems === 'end' ? 'flex-end' : 'stretch' });
      if (alignContent === 'center') added.push({ prop: 'justify-content', value: 'center' });
      extra.push(child(selectors, ' > :nth-child(n)', [{ prop: 'flex-shrink', value: '0' }]));
      const gap = gapFor();
      if (gap) extra.push(child(selectors, ' > :nth-child(n+2)', [{ prop: 'margin-top', value: gap[0] }]));
    } else if (ownGap) {
      // Espacement seul : celui de la grille de base (pile ou rangée).
      const [rowGap, colGap] = gaps(ownGap);
      if (lookup(selectors[0], 'column')) extra.push(child(selectors, ' > :nth-child(n+2)', [{ prop: 'margin-left', value: colGap }]));
      else if (!lookup(selectors[0], 'template')) extra.push(child(selectors, ' > :nth-child(n+2)', [{ prop: 'margin-top', value: rowGap }]));
    }
    const justifySelf = get(decls, 'justify-self');
    if (justifySelf) added.push({ prop: 'align-self', value: justifySelf === 'center' ? 'center' : justifySelf === 'start' ? 'flex-start' : 'flex-end' });
    const kept = decls.filter(d => !(d.prop === 'display' && /grid/.test(d.value)) && !(isGrid && d.prop === 'align-content'));
    const finalDecls = prefixDecls([...kept, ...added.map(d => ({ ...d, important: false }))]);
    // Sélecteurs que ce moteur ne connaît pas : règle à part, pour ne pas perdre les autres.
    if (selectors.length > 1 && selectors.some(s => UNSUPPORTED_SELECTORS.test(s))) {
      for (const selector of selectors) out.push({ selector: selector.trim(), decls: finalDecls });
    } else out.push({ selector: item.selector, decls: finalDecls });
    for (const rule of extra) out.push({ selector: rule.selector, decls: prefixDecls(rule.decls) });
  }
  return '/* Converti pour Samsung Smart TV 2014 par apps/scripts/build-orsay.mjs : ne pas modifier. */\n' + serialize(out) + '\n';
}

// ── Paquet ────────────────────────────────────────────────────────────────
async function listFiles(dir) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
const crlf = text => text.replace(/\r?\n/g, '\r\n');

export async function tvVersion() {
  const source = await readFile(join(tvRoot, 'tv-native.js'), 'utf8');
  return /var VERSION = '([\d.]+)'/.exec(source)[1];
}
export function orsayVersions(version, revision = ORSAY_REVISION) {
  const [major, minor, patch] = version.split('.').map(Number);
  return {
    label: `${version}-2014.${revision}`,
    // Numéro du config.xml (nombre décimal croissant : 1.1.51 révision 1 → 1.15101).
    widget: `${major}.${minor}${String(patch).padStart(2, '0')}${String(revision).padStart(2, '0')}`
  };
}

/** Fichiers de l'appli : [[chemin dans le zip, contenu]]. */
export async function widgetFiles({ server = DEFAULT_SERVER } = {}) {
  const version = await tvVersion();
  const { label, widget } = orsayVersions(version);
  const files = new Map();
  const tvIndex = await readFile(join(tvRoot, 'index.html'), 'utf8');
  // Écran de l'interface (en-tête, menu, zones) repris de l'appli Android TV.
  const body = /<body>([\s\S]*?)<script/.exec(tvIndex)[1].trim();
  const template = await readFile(join(variantRoot, 'index.html'), 'utf8');
  files.set('index.html', template.replace('<!--NOCTRA-INTERFACE-->', body).replace(/\{\{VERSION\}\}/g, label));
  files.set('config.xml', crlf((await readFile(join(variantRoot, 'config.xml'), 'utf8')).replace('{{WIDGET_VERSION}}', widget)));
  files.set('widget.info', crlf(await readFile(join(variantRoot, 'widget.info'), 'utf8')));
  files.set('config.js', `/* Réglages de Noctra pour Samsung Smart TV 2014 (créé à la construction). */\nwindow.NOCTRA_ORSAY_CONFIG = ${JSON.stringify({ version: label, defaultServerUrl: server }, null, 2)};\n`);
  for (const name of ['orsay-compat.js', 'orsay-host.js', 'orsay.css']) files.set(name, await readFile(join(variantRoot, name), 'utf8'));
  for (const file of await listFiles(join(variantRoot, 'icon'))) files.set('icon/' + relative(join(variantRoot, 'icon'), file).split(sep).join('/'), await readFile(file));
  // Interface Noctra TV partagée (le lecteur web séparé n'existe pas ici : player.html/js non repris).
  for (const name of ['tv-native.js', 'tv-data.js', 'app.js', 'noctra-mark.svg']) files.set(name, await readFile(join(tvRoot, name)));
  files.set('app.css', convertCss(await readFile(join(tvRoot, 'app.css'), 'utf8')));
  return { files, version, label, widget };
}

export function widgetList({ host = '__ADRESSE_IP_DU_PC__', size = 0, label = '' } = {}) {
  return crlf(`<?xml version="1.0" encoding="UTF-8"?>
<rsp stat="ok">
  <list>
    <widget id="Noctra">
      <title>Noctra</title>
      <compression size="${size}" type="zip"/>
      <description>Noctra ${label} pour Samsung Smart TV 2014</description>
      <download>http://${host}/Noctra.zip</download>
    </widget>
  </list>
</rsp>
`);
}

export async function buildOrsay({ outRoot = join(repoRoot, 'dist', 'apps'), server = DEFAULT_SERVER } = {}) {
  const { files, label, widget } = await widgetFiles({ server });
  const ordered = [...files.entries()].sort(([a], [b]) => (a === 'config.xml' ? -1 : b === 'config.xml' ? 1 : a.localeCompare(b)));
  const widgetZip = zip(ordered);
  const kitDir = join(outRoot, 'samsung-2014');
  await rm(kitDir, { recursive: true, force: true });
  await mkdir(join(kitDir, 'serveur'), { recursive: true });
  await writeFile(join(kitDir, 'Noctra.zip'), widgetZip);
  await writeFile(join(kitDir, 'widgetlist.xml'), widgetList({ size: widgetZip.length, label }));
  const kit = [['Noctra.zip', widgetZip], ['widgetlist.xml', widgetList({ size: widgetZip.length, label })]];
  for (const file of await listFiles(join(variantRoot, 'serveur'))) {
    const name = 'serveur/' + relative(join(variantRoot, 'serveur'), file).split(sep).join('/');
    let content = await readFile(file);
    // Windows : fins de ligne CRLF ; PowerShell 5 lit l'UTF-8 seulement avec BOM.
    if (/\.(cmd|bat|ps1)$/.test(name)) content = Buffer.from((/\.ps1$/.test(name) ? '\ufeff' : '') + crlf(content.toString('utf8')));
    await writeFile(join(kitDir, name), content);
    kit.push([name, content]);
  }
  for (const name of ['GUIDE-INSTALLATION-UE40H6400.md', 'RAPPORT-COMPATIBILITE-UE40H6400.md']) {
    const content = await readFile(join(variantRoot, name));
    await writeFile(join(kitDir, name), content);
    kit.push([name, content]);
  }
  const kitName = `Noctra-Samsung-2014-${label}.zip`;
  const kitZip = zip(kit.map(([name, content]) => [`Noctra-Samsung-2014/${name}`, content]));
  await writeFile(join(outRoot, kitName), kitZip);
  return { label, widget, kitDir, widgetZip: join(kitDir, 'Noctra.zip'), kit: join(outRoot, kitName), size: widgetZip.length, files: [...files.keys()] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await buildOrsay({ server: process.env.NOCTRA_SERVER || DEFAULT_SERVER });
  console.log(`Noctra Samsung 2014 ${result.label} (config.xml ${result.widget})`);
  console.log(`  appli : ${relative(repoRoot, result.widgetZip)} (${Math.round(result.size / 1024)} Ko, ${result.files.length} fichiers)`);
  console.log(`  kit   : ${relative(repoRoot, result.kit)}`);
}
