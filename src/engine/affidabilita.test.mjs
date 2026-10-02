// Affidabilità con 4 giocatori: refresh della pagina in ogni fase, connessione persa e ripresa durante il round.
// Si lancia con:  npm run test:room   (sull'emulatore Firebase, come room.test.mjs)
//
// "Refresh" qui vuol dire quello che fa davvero un telefono che ricarica la pagina: la connessione vecchia
// si chiude (Firebase segna il giocatore offline), parte un'app nuova con lo STESSO utente, e il gioco
// rientra nella stanza con joinRoom e ricomincia ad ascoltarla, come fa App.js aprendo /r/CODICE.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, goOffline, goOnline } from 'firebase/database';
import { createEngine, SPIN_MS, COUNTDOWN_MS, HOST_GRACE_MS } from './room.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const DBP = +(process.env.DBP || 9000), AUP = +(process.env.AUP || 9099);
const apps = new Set();
let n = 0;

/** Gettone di accesso non firmato: l'emulatore lo accetta e fa rientrare lo stesso utente. */
function fakeToken(uid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ uid, iss: 'test', sub: 'test', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600 })}.`;
}

/** Un telefono. Con uid: lo stesso utente che riapre il gioco. */
async function phone(name, uid) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${DBP}?ns=${PROJECT}-default-rtdb` }, `a${n++}`);
  apps.add(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${AUP}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', DBP);
  const { user } = uid ? await signInWithCustomToken(auth, fakeToken(uid)) : await signInAnonymously(auth);
  const p = { name, uid: user.uid, app, db, engine: createEngine(db, user.uid), profile: { name, color: n % 6, face: n % 6 }, off: null };
  p.room = (code) => get(ref(db, `rooms/${code}`)).then((s) => s.val());
  return p;
}
/** Ascolta la stanza come fa App.js (serve anche al passaggio di host). */
const listen = (p, code) => { p.off = p.engine.subscribe(code, () => {}); return p; };

/** Refresh: chiude l'app vecchia e ne apre una nuova con lo stesso utente, che rientra nella stanza. */
async function refresh(p, code) {
  if (p.off) p.off();
  await deleteApp(p.app); apps.delete(p.app);
  // Al rientro il profilo salvato nel browser potrebbe essere diverso: nella stanza deve restare quello di prima.
  const q = await phone(p.name, p.uid);
  await q.engine.joinRoom(code, { name: 'Altro nome', color: 5, face: 5 });
  return listen(q, code);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000, msg = 'timeout') => {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(msg); await sleep(150); }
};

/** Aspetta che chi guarda veda la fase attesa (le letture subito dopo l'azione di un altro telefono possono essere un attimo indietro). */
const until = (viewer, code, status, label) => waitFor(async () => (await viewer.room(code)).status === status, 6000, `${label}: la fase non diventa ${status}`);

/** Controlli dopo ogni refresh: nessun doppione, profilo intatto, tutti online, host invariato. */
async function checkIntact(viewer, code, before, label) {
  await waitFor(async () => {
    const r = await viewer.room(code);
    return Object.keys(r.presence || {}).every((id) => r.presence[id] === true);
  }, 6000, `${label}: qualcuno è rimasto offline dopo il refresh`);
  const r = await viewer.room(code);
  assert.deepEqual(Object.keys(r.players).sort(), Object.keys(before.players).sort(), `${label}: giocatori cambiati o duplicati`);
  for (const id of Object.keys(r.players)) {
    assert.equal(r.players[id].name, before.players[id].name, `${label}: nome cambiato`);
    assert.equal(r.players[id].joinedAt, before.players[id].joinedAt, `${label}: ora di ingresso cambiata`);
    assert.equal(r.players[id].score, before.players[id].score, `${label}: punteggio cambiato`);
  }
  assert.equal(r.hostId, before.hostId, `${label}: l'host è cambiato`);
  assert.equal(r.status, before.status, `${label}: la fase è cambiata`);
  return r;
}

after(async () => { await Promise.all([...apps].map((a) => deleteApp(a).catch(() => {}))); });

const CATS = [{ key: 'nomi', label: 'Nomi', color: '#FF8A65' }, { key: 'cose', label: 'Cose', color: '#5CD0FF' }, { key: 'citta', label: 'Città', color: '#B79CFF' }];

test('refresh in ogni fase, di un giocatore e dell\'host, con 4 giocatori', { timeout: 120000 }, async () => {
  let [a, b, c, d] = await Promise.all(['Anna', 'Bea', 'Ciro', 'Dani'].map((x) => phone(x)));
  const code = await a.engine.createRoom(a.profile, { cats: CATS, rounds: 2, maxPlayers: 8, timer: 90, hard: true });
  for (const p of [b, c, d]) await p.engine.joinRoom(code, p.profile);
  [a, b, c, d].forEach((p) => listen(p, code));

  // Lobby: refresh di un giocatore e dell'host. L'host torna prima che scada l'attesa e resta host.
  let before = await a.room(code);
  c = await refresh(c, code);
  await checkIntact(a, code, before, 'lobby, giocatore');
  a = await refresh(a, code);
  await checkIntact(b, code, before, 'lobby, host');
  await sleep(HOST_GRACE_MS + 1000); // nessuno deve aver preso il posto dell'host nel frattempo
  assert.equal((await b.room(code)).hostId, a.uid, 'lobby: l\'host ha perso il posto dopo un refresh');

  // Estrazione: refresh durante l'animazione, poi la partita parte lo stesso per tutti.
  await a.engine.startGame(code);
  before = await a.room(code);
  d = await refresh(d, code);
  await checkIntact(a, code, before, 'estrazione');
  await sleep(SPIN_MS + COUNTDOWN_MS + 200);
  await d.engine.goPlay(code); // la fa partire anche chi ha appena ricaricato
  await until(a, code, 'play', 'estrazione');

  // Partita: le risposte già salvate restano dopo il refresh, e si può continuare a scrivere.
  const L = (await a.room(code)).round.letter;
  await b.engine.saveAnswers(code, { nomi: L + 'arco', cose: L + 'ado' });
  before = await a.room(code);
  b = await refresh(b, code);
  let r = await checkIntact(a, code, before, 'partita');
  assert.deepEqual(r.answers[b.uid], { nomi: L + 'arco', cose: L + 'ado' }, 'partita: risposte perse col refresh');
  await b.engine.saveAnswers(code, { nomi: L + 'arco', cose: L + 'ado', citta: L + 'ilano' });
  await c.engine.saveAnswers(code, { nomi: L + 'ino', cose: L + 'ado', citta: L + 'odena' });
  // L'host ricarica mentre si gioca: resta host.
  before = await a.room(code);
  a = await refresh(a, code);
  await checkIntact(b, code, before, 'partita, host');
  await a.engine.saveAnswers(code, { nomi: L + 'aria', cose: L + 'ago', citta: L + 'arino' });
  assert.equal(await b.engine.pressStop(code), true);
  await until(a, code, 'review', 'STOP');

  // Correzione: i voti restano dopo il refresh di chi ha votato e dell'host.
  await c.engine.vote(code, 'nomi', a.uid, true);
  await d.engine.vote(code, 'nomi', a.uid, true);
  before = await a.room(code);
  c = await refresh(c, code);
  r = await checkIntact(a, code, before, 'correzione');
  assert.equal(r.votes.nomi[a.uid][c.uid], true, 'correzione: voto perso col refresh');
  a = await refresh(a, code);
  await checkIntact(b, code, before, 'correzione, host');
  await a.engine.nextCategory(code);
  await a.engine.nextCategory(code);
  await a.engine.nextCategory(code); // -> punti

  // Fine round: refresh, poi il round 2 parte normalmente.
  before = await a.room(code);
  assert.equal(before.status, 'round');
  d = await refresh(d, code);
  await checkIntact(a, code, before, 'fine round');
  await a.engine.nextRound(code);
  await until(c, code, 'spin', 'round 2');
  await sleep(SPIN_MS + COUNTDOWN_MS + 200);
  await c.engine.goPlay(code);
  await until(a, code, 'play', 'round 2');
  await until(d, code, 'play', 'round 2');
  await d.engine.saveAnswers(code, { nomi: 'x' });
  await d.engine.timeUp(code).catch(() => {}); // il tempo non è scaduto: non deve chiudere
  assert.equal((await a.room(code)).status, 'play');
  await c.engine.saveAnswers(code, { nomi: 'a', cose: 'b', citta: 'c' });
  assert.equal(await c.engine.pressStop(code), true);
  await waitFor(async () => (await a.room(code)).status === 'review', 5000, 'lo STOP non porta alla correzione');
  for (let i = 0; i < 3; i++) await a.engine.nextCategory(code);
  await until(a, code, 'round', 'punti round 2');
  await a.engine.nextRound(code); // -> premi
  await until(a, code, 'awards', 'premi');

  // Premi e podio: refresh, poi rivincita pulita con tutti e quattro.
  before = await a.room(code);
  assert.equal(before.status, 'awards');
  b = await refresh(b, code);
  await checkIntact(a, code, before, 'premi');
  await a.engine.showPodium(code);
  await until(b, code, 'final', 'podio');
  before = await a.room(code);
  a = await refresh(a, code);
  await checkIntact(b, code, before, 'podio, host');
  await a.engine.rematch(code);
  r = await a.room(code);
  assert.equal(r.status, 'spin');
  assert.equal(Object.keys(r.players).length, 4, 'rivincita: si è perso qualcuno');
  assert.ok(Object.values(r.players).every((p) => p.score === 0), 'rivincita: punteggi non azzerati');
  assert.equal(r.answers, undefined, 'rivincita: risposte della partita prima');
  assert.equal(r.votes, undefined, 'rivincita: voti della partita prima');
});

test('connessione persa e ripresa durante il round', { timeout: 60000 }, async () => {
  const [a, b, c, d] = await Promise.all(['Anna', 'Bea', 'Ciro', 'Dani'].map((x) => phone(x)));
  const code = await a.engine.createRoom(a.profile, { cats: CATS, rounds: 2, maxPlayers: 8, timer: 90, hard: true });
  for (const p of [b, c, d]) await p.engine.joinRoom(code, p.profile);
  [a, b, c, d].forEach((p) => listen(p, code));
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 200);
  await b.engine.goPlay(code);
  await until(a, code, 'play', 'inizio');
  await until(c, code, 'play', 'inizio');
  const L = (await a.room(code)).round.letter;

  // 1. Ciro perde la rete per qualche secondo mentre scrive, poi torna prima dello STOP:
  //    gli altri lo vedono offline, e al ritorno le parole scritte senza rete arrivano.
  goOffline(c.db);
  await waitFor(async () => (await a.room(code)).presence[c.uid] === false, 6000, 'Ciro non risulta offline');
  const pending = c.engine.saveAnswers(code, { nomi: L + 'ino', cose: L + 'ado' }); // resta in coda finché è offline
  await sleep(1500);
  goOnline(c.db);
  await pending;
  await waitFor(async () => (await a.room(code)).presence[c.uid] === true, 6000, 'Ciro non torna online');
  assert.deepEqual((await a.room(code)).answers[c.uid], { nomi: L + 'ino', cose: L + 'ado' });

  // 2. Dani perde la rete, intanto Bea preme STOP, e Dani torna solo dopo i 3 secondi di tolleranza:
  //    la parola scritta offline viene rifiutata (non si scrive a round chiuso), la partita va avanti
  //    e Dani conta come assente finché è offline.
  await d.engine.saveAnswers(code, { nomi: L + 'avide' });
  goOffline(d.db);
  await waitFor(async () => (await a.room(code)).presence[d.uid] === false, 6000, 'Dani non risulta offline');
  const late = d.engine.saveAnswers(code, { nomi: L + 'avide', cose: 'scritta offline' }).then(() => 'salvata', () => 'rifiutata');
  await b.engine.saveAnswers(code, { nomi: L + 'arco', cose: L + 'ono', citta: L + 'ilano' });
  assert.equal(await b.engine.pressStop(code), true);
  await until(a, code, 'review', 'STOP');
  await sleep(3500);
  goOnline(d.db);
  assert.equal(await late, 'rifiutata');
  let r = await a.room(code);
  assert.deepEqual(r.answers[d.uid], { nomi: L + 'avide' }, 'la parola scritta offline dopo lo STOP non deve contare');
  await waitFor(async () => (await a.room(code)).presence[d.uid] === true, 6000, 'Dani non torna online');

  // 3. L'host perde la rete in correzione e torna entro l'attesa: resta host e fa andare avanti la partita.
  goOffline(a.db);
  await waitFor(async () => (await b.room(code)).presence[a.uid] === false, 6000, 'host non risulta offline');
  await sleep(1000);
  goOnline(a.db);
  await waitFor(async () => (await b.room(code)).presence[a.uid] === true, 6000, 'host non torna online');
  await sleep(HOST_GRACE_MS);
  assert.equal((await b.room(code)).hostId, a.uid, 'l\'host ha perso il posto per una breve disconnessione');
  for (let i = 0; i < 3; i++) await a.engine.nextCategory(code);
  r = await a.room(code);
  assert.equal(r.status, 'round');
  // Tutti e quattro erano online al calcolo dei punti, quindi tutti hanno un risultato.
  assert.deepEqual(Object.keys(r.round.points).sort(), [a.uid, b.uid, c.uid, d.uid].sort());

  // 4. L'host resta offline oltre l'attesa: passa il posto a Bea (entrata per seconda), la partita continua,
  //    e quando l'host di prima torna non si riprende il posto né crea confusione.
  goOffline(a.db);
  await waitFor(async () => (await b.room(code)).hostId === b.uid, HOST_GRACE_MS + 8000, 'nessun nuovo host');
  goOnline(a.db);
  await waitFor(async () => (await b.room(code)).presence[a.uid] === true, 6000, 'host di prima non torna online');
  await sleep(1000);
  r = await b.room(code);
  assert.equal(r.hostId, b.uid, 'l\'host di prima si è ripreso il posto');
  await assert.rejects(a.engine.nextRound(code), (e) => e.code === 'nothost');
  await b.engine.nextRound(code);
  assert.equal((await b.room(code)).status, 'spin');
});
