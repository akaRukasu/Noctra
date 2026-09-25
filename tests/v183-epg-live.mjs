import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const start = server.indexOf('function decodeXmlText');
const end = server.indexOf('async function tvEpg', start);
assert.ok(start >= 0 && end > start);

const normalizedIdentifier = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
class HttpError extends Error {}
const parseXmlTvNowNextStream = new Function(
  'Buffer',
  'Date',
  'Map',
  'Set',
  'normalizedIdentifier',
  'HttpError',
  `${server.slice(start, end)}; return parseXmlTvNowNextStream;`
)(Buffer, Date, Map, Set, normalizedIdentifier, HttpError);

const response = await fetch('https://xmltvfr.fr/xmltv/xmltv_fr.xml.gz', {
  signal: AbortSignal.timeout(35_000)
});
assert.equal(response.ok, true);
assert.ok(response.body);
const guide = await parseXmlTvNowNextStream(Readable.fromWeb(response.body).pipe(createGunzip()));

const sixTer = guide.get('6ter.fr') || guide.get('6ter');
const arte = guide.get('Arte.fr') || guide.get('Arte');
assert.ok(sixTer?.length, 'Le guide 6ter doit contenir les programmes proches du direct.');
assert.ok(arte?.length, 'Le guide Arte doit contenir les programmes proches du direct.');
console.log(JSON.stringify({ aliases: guide.size, sixTer: sixTer.length, arte: arte.length }));
