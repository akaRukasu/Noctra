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
// noctra.81 : retard visé tenu par l'appli elle-même (lecture à 97 % sous
// l'objectif), « liste figée » dans le diagnostic, et course avec une nouvelle
// connexion pour un segment qui arrive au compte-gouttes.
assert.match(stream, /long goal = Math\.min\(window - Math\.max\(WINDOW_SAFETY_MS, window \/ 4\), 12000 \+ extraOffsetMs\);/);
assert.match(stream, /if \(!slowed && retard < goal - 3000\) \{\s*player\.setPlaybackSpeed\(0\.97f\);/);
assert.match(stream, /\} else if \(slowed && retard >= goal\) \{\s*player\.setPlaybackSpeed\(1f\);/);
assert.match(stream, /text\.append\(" · liste figée depuis "\)/);
assert.match(stream, /if \(live\) \{\s*noteStable\(now\);\s*keepLiveDistance\(now\);/);
const prefetch = await readFile(new URL('../apps/androidtv/java/com/noctra/tv/NoctraPrefetchDataSource.java', import.meta.url), 'utf8');
assert.match(prefetch, /private static final long SLOW_MS = 5000;/);
assert.match(prefetch, /if \(!servingRaced && !entry\.done && System\.currentTimeMillis\(\) - servingSince > SLOW_MS\) \{/);
assert.match(prefetch, /if \(fresh\.size > servingPosition \|\| \(fresh\.done && fresh\.size >= servingPosition\)\) \{/);
assert.match(await readFile(new URL('../apps/androidtv/stubs/androidx/media3/common/Player.java', import.meta.url), 'utf8'), /void setPlaybackSpeed\(float speed\);/);
assert.match(await readFile(new URL('../apps/scripts/build-androidtv.mjs', import.meta.url), 'utf8'), /const noctraRevision = (8[1-9]|9\d|\d{3});/);
console.log('Android TV noctra.81 : retard sur le direct tenu (ralenti 97 %), liste figée signalée, segment lent doublé : OK');
