// Garde mémoire WebAssembly (200.0.165).
//
// Les requêtes de Node.js (fetch, undici) passent par un analyseur HTTP en
// WebAssembly. Avec la protection par défaut, V8 réserve une très grande zone
// de mémoire virtuelle pour chaque instance WebAssembly. Sur un service à
// mémoire virtuelle limitée (Ultra.cc), cette réservation échoue :
//   « WebAssembly.Instance(): Out of memory: Cannot allocate Wasm memory »
// et toutes les requêtes échouent (« fetch failed », Jellyfin injoignable).
//
// Le réglage --disable-wasm-trap-handler supprime cette réservation. Il était
// placé dans le service (NODE_OPTIONS), mais un service recréé ou modifié peut
// le perdre. Noctra se relance donc lui-même avec ce réglage s'il manque :
// cela ne dépend plus de la configuration du service.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { WASM_FLAG, needsWasmRelaunch } from './wasm-memory.mjs';

if (needsWasmRelaunch()) {
  // Le processus parent ne fait que relancer Noctra et attendre. Le simple
  // chargement de node:http y prépare l'analyseur HTTP WebAssembly (WebSocket)
  // et échoue de la même façon : erreur sans conséquence ici, ignorée (le
  // parent ne fait aucune requête), sinon le service s'arrêterait.
  let reported = false;
  const ignore = error => {
    if (reported) return;
    reported = true;
    const text = String(error?.message || error || '');
    if (!/Wasm memory|WebAssembly/i.test(text)) console.error(`Noctra (lanceur) : ${text}`);
  };
  process.on('uncaughtException', ignore);
  process.on('unhandledRejection', ignore);
  const child = spawn(process.execPath, [WASM_FLAG, ...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NOCTRA_WASM_CHILD: '1' }
  });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => { try { child.kill(signal); } catch {} });
  }
  child.on('error', error => {
    console.error(`Noctra : relance avec ${WASM_FLAG} impossible (${error.message}).`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  // Le reste du serveur ne démarre que dans le processus relancé.
  await new Promise(() => {});
}
