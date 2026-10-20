// Service worker minimo, per rendere il gioco installabile sulla schermata Home.
// Di proposito NON mette in memoria il gioco: ogni apertura scarica la versione pubblicata, così gli
// aggiornamenti arrivano subito e non restano versioni vecchie sui telefoni. Tiene da parte solo la pagina
// "Sei senza connessione", da mostrare quando si apre il gioco senza rete.
const CACHE = 'ncc-offline-v1';
const OFFLINE = ['/offline.html', '/icona-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo l'apertura delle pagine passa da qui: tutto il resto (codice, immagini, Firebase) va in rete come sempre.
  if (req.mode !== 'navigate') return;
  // La pagina salvata viene ricopiata in una risposta nuova: se il server l'aveva servita con un redirect,
  // il browser rifiuterebbe di mostrarla così com'è.
  // 'no-cache' obbliga a chiedere al server: senza rete il browser non ripesca dalla sua memoria una pagina
  // del gioco senza il codice (che resterebbe bianca), e si passa alla pagina "Sei senza connessione".
  event.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => caches.match('/offline.html')
    .then((r) => r.blob().then((body) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))));
});
