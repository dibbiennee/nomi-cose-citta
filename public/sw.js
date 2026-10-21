// Service worker: tiene il gioco sul telefono, così si apre e si gioca da soli anche senza rete.
//
// Aggiornamenti: l'apertura della pagina chiede sempre prima alla rete (al massimo 3 secondi). Così chi ha
// rete apre subito la versione appena pubblicata, e nelle stanze online non si incontrano telefoni con versioni
// diverse del gioco. Solo se la rete non risponde in tempo si usa la copia salvata.
// I file in /static/ hanno nel nome un codice che cambia a ogni versione: si possono servire dalla copia.
const CACHE = 'ncc-app-v1';
const NET_TIMEOUT_MS = 3000;
const SHELL = ['/index.html', '/manifest.webmanifest', '/icona.svg', '/icona-192.png', '/icona-512.png', '/icona-maskable-512.png', '/offline.html'];

/** I file della versione pubblicata, presi da asset-manifest.json (lo scrive la build di create-react-app). */
async function buildFiles() {
  const res = await fetch('/asset-manifest.json', { cache: 'no-cache' });
  const manifest = await res.json();
  return Object.values(manifest.files || {}).filter((f) => f.startsWith('/static/') && !f.endsWith('.map') && !f.endsWith('.txt'));
}

/** Mette in copia i file della versione pubblicata e toglie quelli delle versioni vecchie. Un file che non arriva non blocca gli altri. */
async function syncCache() {
  const cache = await caches.open(CACHE);
  const files = await buildFiles();
  await Promise.all(SHELL.concat(files).map((f) => cache.match(f).then((hit) => hit || cache.add(new Request(f, { cache: 'no-cache' }))).catch(() => {})));
  const keep = new Set(files);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/static/') && !keep.has(path)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(syncCache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** La copia ricostruita come risposta nuova: se il server l'aveva servita con un redirect, il browser la rifiuterebbe. */
const fresh = (res) => res.blob().then((body) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));

async function openPage(event) {
  try {
    // 'no-cache' obbliga a chiedere al server invece di ripescare dalla memoria del browser.
    const res = await withTimeout(fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }), NET_TIMEOUT_MS);
    if (res.ok && (res.headers.get('Content-Type') || '').includes('text/html')) {
      const copy = res.clone();
      // La pagina nuova finisce in copia, e con lei i file della sua versione (anche le parole dei robot).
      event.waitUntil(caches.open(CACHE).then((c) => c.put('/index.html', copy)).then(syncCache).catch(() => {}));
    }
    return res;
  } catch (e) {
    // Senza rete: il gioco salvato, per qualsiasi indirizzo (anche /r/CODICE: poi il gioco dice che serve internet).
    const cache = await caches.open(CACHE);
    const page = (await cache.match('/index.html')) || (await cache.match('/offline.html'));
    if (page) return fresh(page);
    throw e;
  }
}

async function staticFile(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase e gli altri domini: non si toccano
  if (req.mode === 'navigate') { event.respondWith(openPage(event)); return; }
  if (url.pathname.startsWith('/static/')) { event.respondWith(staticFile(req)); return; }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(req)));
});
