// Réglage mémoire WebAssembly de Node.js (voir wasm-memory-guard.mjs).
// Fonctions sans effet : utilisables par les tests sans relancer le processus.
import process from 'node:process';

export const WASM_FLAG = '--disable-wasm-trap-handler';

export function wasmFlagActive(execArgv = process.execArgv, nodeOptions = process.env.NODE_OPTIONS || '') {
  return execArgv.includes(WASM_FLAG) || String(nodeOptions).split(/\s+/).includes(WASM_FLAG);
}

export function needsWasmRelaunch({
  execArgv = process.execArgv,
  env = process.env,
  allowed = process.allowedNodeEnvironmentFlags
} = {}) {
  if (env.NOCTRA_WASM_GUARD === 'off' || env.NOCTRA_WASM_CHILD === '1') return false;
  if (wasmFlagActive(execArgv, env.NODE_OPTIONS || '')) return false;
  // Node.js trop ancien pour connaître ce réglage : lancement normal.
  return Boolean(allowed && typeof allowed.has === 'function' && allowed.has(WASM_FLAG));
}
