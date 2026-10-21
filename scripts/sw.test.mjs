// Il service worker non deve togliere dalla copia i file della versione vecchia finché quelli della nuova non
// sono tutti arrivati: altrimenti, con una rete ballerina, offline mancherebbe un file (per esempio le parole).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Carica public/sw.js con cache, fetch e self finti. failing: percorsi che la rete non riesce a scaricare. */
function loadSw({ manifestFiles, failing = new Set(), cached = [] }) {
  const store = new Map(cached.map((p) => [p, 'vecchio']));
  const pathOf = (r) => new URL(typeof r === 'string' ? r : r.url, 'https://gioco.test').pathname;
  const cache = {
    match: async (r) => (store.has(pathOf(r)) ? { ok: true } : undefined),
    add: async (r) => { const p = pathOf(r); if (failing.has(p)) throw new Error('rete'); store.set(p, 'nuovo'); },
    put: async (r) => { store.set(pathOf(r), 'nuovo'); },
    keys: async () => [...store.keys()].map((p) => ({ url: `https://gioco.test${p}` })),
    delete: async (r) => store.delete(pathOf(r)),
  };
  const listeners = {};
  const sandbox = {
    self: { addEventListener(type, fn) { listeners[type] = fn; }, location: { origin: 'https://gioco.test' } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async () => ({ json: async () => ({ files: Object.fromEntries(manifestFiles.map((f, i) => [`f${i}`, f])) }) }),
    URL, Request: class { constructor(url) { this.url = new URL(url, 'https://gioco.test').href; } }, Response: class {},
    setTimeout, clearTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), sandbox);
  return { syncCache: sandbox.syncCache, store, listeners };
}

test('se un file nuovo non arriva, i vecchi restano', async () => {
  const sw = loadSw({ manifestFiles: ['/static/js/main.new.js', '/static/js/parole.new.js'], failing: new Set(['/static/js/parole.new.js']), cached: ['/static/js/main.old.js', '/static/js/parole.old.js'] });
  await sw.syncCache();
  assert.ok(sw.store.has('/static/js/parole.old.js'), 'la versione vecchia delle parole resta in copia');
  assert.ok(sw.store.has('/static/js/main.new.js'));
});

test('quando arrivano tutti, i vecchi si tolgono', async () => {
  const sw = loadSw({ manifestFiles: ['/static/js/main.new.js', '/static/js/parole.new.js'], cached: ['/static/js/main.old.js', '/static/js/parole.old.js'] });
  await sw.syncCache();
  assert.ok(!sw.store.has('/static/js/main.old.js') && !sw.store.has('/static/js/parole.old.js'));
  assert.ok(sw.store.has('/static/js/parole.new.js'));
});

/** Il service worker risponde lui a questa apertura di pagina? */
function handles(sw, path) {
  let answered = false;
  sw.listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: `https://gioco.test${path}` }, respondWith() { answered = true; }, waitUntil() {} });
  return answered;
}

test('solo le pagine del gioco finiscono nella copia per giocare offline', () => {
  const sw = loadSw({ manifestFiles: [] });
  assert.ok(handles(sw, '/'));
  assert.ok(handles(sw, '/r/ABCD'));
  assert.ok(handles(sw, '/statistiche'));
  assert.ok(!handles(sw, '/privacy'), 'la privacy non prende il posto del gioco');
  assert.ok(!handles(sw, '/condizioni-acquisto'));
  assert.ok(!handles(sw, '/__/auth/iframe'), 'le pagine dell\'accesso Google non si toccano');
  assert.ok(!handles(sw, '/__/auth/handler'));
});
