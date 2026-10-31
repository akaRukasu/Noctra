import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Android TV noctra.80 : diagnostic « réserve 10 s · fenêtre 36 s · retard 10 s ·
// dernier segment 13,4 s » : la réserve ne peut pas dépasser le retard sur le
// direct. Léger ralenti (97 %, jamais d'accélération) pour regagner l'avance
// perdue ; retour dans la fenêtre avec de l'avance après une sortie de fenêtre.
const stream = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraStream.java', import.meta.url), 'utf8');
assert.match(stream, /\.setMinPlaybackSpeed\(0\.97f\)\s*\.setMaxPlaybackSpeed\(1f\)/, 'ralenti seulement, jamais d’accélération');
assert.match(stream, /long back = Math\.min\(extraOffsetMs, window \/ 2\);\s*player\.seekTo\(Math\.max\(margin, window - back\)\);/);
assert.match(stream, /error\.errorCode == BEHIND_LIVE_WINDOW && played/);
assert.match(await readFile(new URL('../apps/scripts/build-androidtv.mjs', import.meta.url), 'utf8'), /const noctraRevision = (8\d|9\d|\d{3});/);
console.log('Android TV noctra.80 : avance sur le direct regagnée par léger ralenti, retour dans la fenêtre avec de l’avance : OK');
