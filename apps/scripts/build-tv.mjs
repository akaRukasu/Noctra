#!/usr/bin/env node
/* Construit les paquets TV de Noctra, sans dépendance ni SDK :
   - dist/apps/com.noctra.media_<version>_all.ipk  (LG webOS, format ares-package)
   - dist/apps/Noctra.wgt                         (Samsung Tizen, non signé :
     Apps2Samsung ou Tizen Studio le signent à l'installation)

   Usage : node apps/scripts/build-tv.mjs [webos|tizen] */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gzipSync } from 'node:zlib';

const appsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appsRoot, '..', 'dist', 'apps');
const only = process.argv[2];

async function listFiles(dir) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/* Contenu d'une appli TV : l'écran de connexion partagé, puis les fichiers
   propres à la plateforme (qui remplacent ceux du dossier partagé). */
async function collect(platformDir, exclude = []) {
  const files = new Map();
  for (const base of [join(appsRoot, 'shared', 'launcher'), platformDir]) {
    for (const file of await listFiles(base)) {
      const name = relative(base, file).split(sep).join('/');
      if (exclude.includes(name)) continue;
      files.set(name, await readFile(file));
    }
  }
  return files;
}

// ── tar (ustar) ────────────────────────────────────────────────────────────
function tarHeader(name, size, type, mtime) {
  const header = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  const put = (value, offset, length) => header.write(value, offset, length, 'utf8');
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  put(name, 0, 100);
  put(octal(type === '5' ? 0o755 : 0o644, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12);
  put(octal(mtime, 12), 136, 12);
  header.fill(' ', 148, 156);
  put(type, 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put('root', 265, 32);
  put('root', 297, 32);
  put(prefix, 345, 155);
  let sum = 0;
  for (const byte of header) sum += byte;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return header;
}

function tarGz(entries, mtime) {
  const chunks = [];
  const directories = new Set();
  for (const [name] of entries) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i += 1) directories.add(parts.slice(0, i).join('/') + '/');
  }
  for (const directory of [...directories].sort()) chunks.push(tarHeader(directory, 0, '5', mtime));
  for (const [name, content] of entries) {
    chunks.push(tarHeader(name, content.length, '0', mtime), content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

// ── ar (paquet .ipk) ───────────────────────────────────────────────────────
function ar(members, mtime) {
  const chunks = [Buffer.from('!<arch>\n')];
  for (const [name, content] of members) {
    const header = `${(name + '/').padEnd(16)}${String(mtime).padEnd(12)}${'0'.padEnd(6)}${'0'.padEnd(6)}${'100644'.padEnd(8)}${String(content.length).padEnd(10)}\`\n`;
    chunks.push(Buffer.from(header), content);
    if (content.length % 2) chunks.push(Buffer.from('\n'));
  }
  return Buffer.concat(chunks);
}

// ── zip (paquet .wgt) ──────────────────────────────────────────────────────
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files, date) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(content, { level: 9 });
    const stored = compressed.length >= content.length;
    const data = stored ? content : compressed;
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── Plateformes ────────────────────────────────────────────────────────────
async function buildWebos() {
  const platformDir = join(appsRoot, 'webos');
  const appinfo = JSON.parse(await readFile(join(platformDir, 'appinfo.json'), 'utf8'));
  const files = await collect(platformDir);
  const mtime = Math.floor(Date.now() / 1000);
  const appPath = `usr/palm/applications/${appinfo.id}`;
  const data = [...files].map(([name, content]) => [`${appPath}/${name}`, content]);
  data.push([`usr/palm/packages/${appinfo.id}/packageinfo.json`, Buffer.from(JSON.stringify({
    app: appinfo.id, id: appinfo.id, version: appinfo.version
  }, null, 2) + '\n')]);
  const installedSize = data.reduce((total, [, content]) => total + content.length, 0);
  const control = Buffer.from([
    `Package: ${appinfo.id}`,
    `Version: ${appinfo.version}`,
    'Section: misc',
    'Priority: optional',
    'Architecture: all',
    `Installed-Size: ${installedSize}`,
    'Maintainer: Noctra <noreply@noctra.media>',
    `Description: ${appinfo.appDescription || appinfo.title}`,
    'webOS-Package-Format-Version: 2',
    'webOS-Packager-Version: x.y.x',
    ''
  ].join('\n'));
  const ipk = ar([
    ['debian-binary', Buffer.from('2.0\n')],
    ['control.tar.gz', tarGz([['control', control]], mtime)],
    ['data.tar.gz', tarGz(data, mtime)]
  ], mtime);
  const target = join(outDir, `${appinfo.id}_${appinfo.version}_all.ipk`);
  await writeFile(target, ipk);
  return target;
}

async function buildTizen() {
  const platformDir = join(appsRoot, 'tizen');
  const files = await collect(platformDir);
  // config.xml en premier, comme le fait Tizen Studio.
  const ordered = new Map([['config.xml', files.get('config.xml')], ...[...files].filter(([name]) => name !== 'config.xml')]);
  const target = join(outDir, 'Noctra.wgt');
  await writeFile(target, zip(ordered, new Date()));
  return target;
}

await mkdir(outDir, { recursive: true });
const built = [];
if (!only || only === 'webos') built.push(await buildWebos());
if (!only || only === 'tizen') built.push(await buildTizen());
for (const file of built) {
  const { size } = await stat(file);
  console.log(`${relative(process.cwd(), file)} (${(size / 1024).toFixed(1)} Ko)`);
}
