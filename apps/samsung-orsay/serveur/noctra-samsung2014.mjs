#!/usr/bin/env node
/* Noctra pour Samsung Smart TV 2014 : serveur d'installation et relais local.

   node noctra-samsung2014.mjs installer
       Sert l'appli au téléviseur pour « User App Sync » (port 80, imposé par le
       téléviseur) : http://<IP du PC>/widgetlist.xml puis /Noctra.zip.
       À lancer seulement pendant l'installation ou une mise à jour.

   node noctra-samsung2014.mjs relais [--serveur https://…/noctra] [--port 8095]
       Relais local, à laisser tourner sur un appareil toujours allumé (PC, NAS,
       Raspberry Pi) SI le téléviseur refuse la connexion HTTPS du serveur Noctra
       (certificat trop récent pour un modèle de 2014). Le téléviseur parle en
       HTTP à ce relais, sur le réseau de la maison ; le relais parle en HTTPS au
       serveur. Seuls les appareils du réseau local sont acceptés.

   node noctra-samsung2014.mjs tout [options]   les deux à la fois.

   Node.js 18 ou plus récent, aucune dépendance. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, '..');
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'installer';
function option(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const DEFAULT_SERVER = 'https://akarukasu.merlion.usbx.me/noctra';

function addresses() {
  const list = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal) list.push(entry.address);
  }
  return list;
}
function privateAddress(address) {
  const ip = String(address || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip) || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}
const time = () => new Date().toLocaleTimeString('fr-FR');

// ── Installation (User App Sync) ─────────────────────────────────────────
function widgetList(host, size) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsp stat="ok">',
    '  <list>',
    '    <widget id="Noctra">',
    '      <title>Noctra</title>',
    `      <compression size="${size}" type="zip"/>`,
    '      <description>Noctra pour Samsung Smart TV 2014</description>',
    `      <download>http://${host}/Noctra.zip</download>`,
    '    </widget>',
    '  </list>',
    '</rsp>',
    ''
  ].join('\r\n');
}
function startInstaller(port) {
  const archive = join(kit, 'Noctra.zip');
  if (!existsSync(archive)) { console.error(`Noctra.zip introuvable à côté du dossier « serveur » (${archive}).`); process.exit(1); }
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://tv').pathname);
    console.log(`${time()}  ${req.socket.remoteAddress.replace(/^::ffff:/, '')}  ${req.method} ${path}`);
    if (/^\/widgetlist\.xml$/i.test(path)) {
      // Adresse demandée par le téléviseur (celle saisie dans « IP Setting »).
      const host = String(req.headers.host || addresses()[0] || '').replace(/:80$/, '');
      const body = widgetList(host, statSync(archive).size);
      res.writeHead(200, { 'content-type': 'text/xml; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
      res.end(body);
      console.log('            liste envoyée : le téléviseur va télécharger Noctra.zip');
      return;
    }
    if (/^\/(?:[^/]*\/)?Noctra\.zip$/i.test(path)) {
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': statSync(archive).size, 'cache-control': 'no-store' });
      createReadStream(archive).pipe(res).on('finish', () => console.log('            Noctra.zip envoyé. Sur le téléviseur : attendez la fin de l’installation (bandeau en haut).'));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Noctra : seuls /widgetlist.xml et /Noctra.zip sont servis ici.');
  });
  server.on('error', error => {
    if (error.code === 'EACCES') console.error(`Port ${port} refusé : lancez ce programme en administrateur (Windows) ou avec sudo (macOS, Linux).`);
    else if (error.code === 'EADDRINUSE') console.error(`Port ${port} déjà utilisé par un autre programme (Skype, IIS, serveur web…) : fermez-le puis relancez.`);
    else console.error('Serveur d’installation : ' + error.message);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`\nServeur d'installation Noctra prêt (port ${port}).`);
    console.log('Sur le téléviseur, dans « IP Setting », saisissez l’adresse de ce PC :');
    for (const address of addresses()) console.log(`    ${address}`);
    console.log('puis « Start User App Sync ». Ctrl+C pour arrêter une fois l’installation terminée.\n');
  });
}

// ── Relais local HTTP → HTTPS ────────────────────────────────────────────
const TEXT = /json|mpegurl|m3u|text\/|javascript|xml/i;
const MAX_REWRITE = 16 * 1024 * 1024;
function startRelay(port, serverUrl) {
  let upstream;
  try { upstream = new URL(serverUrl); } catch { console.error('Adresse du serveur invalide : ' + serverUrl); process.exit(1); }
  const agent = upstream.protocol === 'https:' ? new https.Agent({ keepAlive: true, maxSockets: 24 }) : new http.Agent({ keepAlive: true, maxSockets: 24 });
  const client = upstream.protocol === 'https:' ? https : http;
  const upstreamOrigin = upstream.origin;
  const escaped = text => text.replace(/\//g, '\\/');
  function swap(text, from, to) { return text.split(from).join(to).split(escaped(from)).join(escaped(to)); }
  const server = http.createServer((req, res) => {
    if (!privateAddress(req.socket.remoteAddress)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Relais Noctra : réservé aux appareils du réseau local.');
      return;
    }
    const relayOrigin = `http://${req.headers.host || 'localhost:' + port}`;
    const target = new URL(req.url, upstreamOrigin);
    const headers = { ...req.headers, host: upstream.host, 'accept-encoding': 'identity' };
    delete headers.connection;
    if (headers.origin && headers.origin !== 'null') headers.origin = swap(headers.origin, relayOrigin, upstreamOrigin);
    if (headers.referer) headers.referer = swap(headers.referer, relayOrigin, upstreamOrigin);
    const chunks = [];
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size <= MAX_REWRITE) chunks.push(chunk); });
    req.on('end', () => {
      let body = Buffer.concat(chunks);
      // Adresses du relais dans une requête (droit de lecture, multiview) : celles du serveur.
      if (body.length && TEXT.test(String(req.headers['content-type'] || ''))) body = Buffer.from(swap(body.toString('utf8'), relayOrigin, upstreamOrigin));
      // Corps renvoyé d'un bloc : longueur exacte, sans découpage « chunked ».
      if (body.length) { delete headers['transfer-encoding']; headers['content-length'] = String(body.length); }
      const forward = client.request(target, { method: req.method, headers, agent, timeout: 60_000 }, upstreamRes => {
        const out = { ...upstreamRes.headers };
        if (out.location) out.location = swap(out.location, upstreamOrigin, relayOrigin);
        const type = String(out['content-type'] || '');
        const length = Number(out['content-length'] || 0);
        if (req.method !== 'HEAD' && TEXT.test(type) && (!length || length <= MAX_REWRITE)) {
          // Listes HLS et réponses JSON : adresses du serveur remplacées par celles du relais.
          const parts = [];
          let total = 0;
          upstreamRes.on('data', chunk => { total += chunk.length; parts.push(chunk); });
          upstreamRes.on('end', () => {
            const text = Buffer.concat(parts, total).toString('utf8');
            const rewritten = Buffer.from(swap(text, upstreamOrigin, relayOrigin));
            delete out['transfer-encoding'];
            out['content-length'] = String(rewritten.length);
            res.writeHead(upstreamRes.statusCode || 502, out);
            res.end(rewritten);
          });
          upstreamRes.on('error', () => res.destroy());
          return;
        }
        res.writeHead(upstreamRes.statusCode || 502, out);
        upstreamRes.pipe(res);
      });
      forward.on('timeout', () => forward.destroy(new Error('délai dépassé')));
      forward.on('error', error => {
        console.log(`${time()}  erreur vers le serveur : ${error.message} (${req.method} ${target.pathname})`);
        if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Relais Noctra : serveur injoignable (' + error.message + ')' })); }
        else res.destroy();
      });
      res.on('close', () => forward.destroy());
      forward.end(body.length ? body : undefined);
    });
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') console.error(`Port ${port} déjà utilisé : choisissez-en un autre avec --port.`);
    else console.error('Relais : ' + error.message);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`\nRelais local Noctra prêt : ${upstream.href}`);
    console.log('Sur le téléviseur (Noctra › Paramètres › Serveur et relais local › Utiliser un relais local), saisissez :');
    for (const address of addresses()) console.log(`    ${address}:${port}`);
    console.log('Laissez ce programme ouvert tant que le téléviseur utilise Noctra.\n');
  });
  // Test de la connexion au serveur au démarrage.
  client.get(new URL(upstream.pathname.replace(/\/+$/, '') + '/health', upstreamOrigin), { agent }, response => {
    let text = '';
    response.on('data', chunk => { text += chunk; });
    response.on('end', () => {
      let data = null;
      try { data = JSON.parse(text); } catch {}
      console.log(data && data.client === 'Noctra' ? `${time()}  serveur Noctra joint (version ${data.version || '?'}).` : `${time()}  attention : ${upstream.href} ne répond pas comme un serveur Noctra (HTTP ${response.statusCode}).`);
    });
  }).on('error', error => console.log(`${time()}  attention : serveur injoignable depuis ce PC (${error.message}).`));
}

if (command === 'installer' || command === 'tout') startInstaller(Number(option('port-installation', command === 'installer' ? option('port', 80) : 80)));
if (command === 'relais' || command === 'tout') startRelay(Number(option('port', 8095)), option('serveur', process.env.NOCTRA_SERVER || DEFAULT_SERVER));
if (!['installer', 'relais', 'tout'].includes(command)) {
  console.log('Usage : node noctra-samsung2014.mjs installer | relais [--serveur https://…/noctra] [--port 8095] | tout');
  process.exit(1);
}
