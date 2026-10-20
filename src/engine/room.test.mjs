// Prove del motore multiplayer e delle regole del database, sull'emulatore Firebase.
// Si lancia con:  npm run test:room   (avvia l'emulatore, esegue, lo spegne; serve Java)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, goOffline } from 'firebase/database';
import { createEngine, RoomError, SPIN_MS, COUNTDOWN_MS, HOST_GRACE_MS, IDLE_MS } from './room.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;

/** Un telefono: app Firebase separata, accesso anonimo, motore. */
async function phone(name) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9000}?ns=${PROJECT}-default-rtdb` }, `p${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9099}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9000));
  const { user } = await signInAnonymously(auth);
  const engine = createEngine(db, user.uid);
  const profile = { name, color: n % 6, face: n % 6 };
  return { name, uid: user.uid, db, engine, profile, room: (code, path = '') => get(ref(db, `rooms/${code}${path ? '/' + path : ''}`)).then((s) => s.val()) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(150); }
};

after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('crea, entra, impostazioni, rimuovi, stanza piena, codice sbagliato', async () => {
  const [a, b, c, d] = await Promise.all(['Anna', 'Bea', 'Ciro', 'Dani'].map(phone));
  const code = await a.engine.createRoom(a.profile);
  assert.match(code, /^[A-Z2-9]{4}$/);

  await b.engine.joinRoom(code, b.profile);
  let room = await a.room(code);
  assert.equal(room.hostId, a.uid);
  assert.equal(Object.keys(room.players).length, 2);
  assert.equal(room.presence[b.uid], true);

  // Rientrando (pagina ricaricata) con un altro profilo salvato, il nome nella stanza non cambia.
  await b.engine.joinRoom(code, { name: 'Altro', color: 5, face: 5 });
  assert.equal((await a.room(code)).players[b.uid].name, 'Bea');

  // Il "false" tardivo di una connessione vecchia (pagina ricaricata) non lascia offline chi è collegato.
  await set(ref(a.db, `rooms/${code}/presence/${b.uid}`), false);
  await waitFor(async () => (await a.room(code)).presence[b.uid] === true, 3000);

  // Solo l'host cambia le impostazioni.
  await a.engine.updateSettings(code, { ...room.settings, maxPlayers: 3, cats: [...room.settings.cats, { key: 'x1', label: 'Supereroi', color: '#7FE3D0' }] });
  await assert.rejects(b.engine.updateSettings(code, room.settings), (e) => e.code === 'nothost');
  await denied(set(ref(b.db, `rooms/${code}/settings/rounds`), 9));
  room = await a.room(code);
  assert.equal(room.settings.cats[3].label, 'Supereroi');

  await c.engine.joinRoom(code, c.profile);
  await assert.rejects(d.engine.joinRoom(code, d.profile), (e) => e instanceof RoomError && e.code === 'full');
  await assert.rejects(d.engine.joinRoom('ZZZZ', d.profile), (e) => e.code === 'notfound');

  // Rimosso dall'host: non può rientrare, e il suo record non torna quando si disconnette.
  await a.engine.kickPlayer(code, c.uid);
  await assert.rejects(c.engine.joinRoom(code, c.profile), (e) => e.code === 'kicked');
  await denied(set(ref(c.db, `rooms/${code}/players/${c.uid}`), { name: 'Ciro', color: 0, face: 0, joinedAt: 1, score: 0 }));
  goOffline(c.db);
  await sleep(400);
  room = await a.room(code);
  assert.equal(room.players[c.uid], undefined); // presence/{uid}=false può restare: senza players/{uid} non conta
});

test('regole: chi non è nella stanza non scrive, nessuno si alza il punteggio', async () => {
  const [a, b, x] = await Promise.all(['Anna', 'Bea', 'Estraneo'].map(phone));
  const code = await a.engine.createRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  await denied(set(ref(x.db, `rooms/${code}/status`), 'final'));
  await denied(set(ref(x.db, `rooms/${code}/hostId`), x.uid));
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/score`), 999));
  await denied(set(ref(b.db, `rooms/${code}/hostId`), b.uid)); // l'host è online
  await denied(set(ref(b.db, `rooms/${code}/status`), 'review'));
  await denied(set(ref(b.db, `rooms/${code}`), null)); // solo l'host chiude la stanza
  await denied(set(ref(x.db, `rooms/${code}/players/${a.uid}/name`), 'Hacker'));
});

test('partita intera: lettera, STOP, voti, punteggi, ritardatario, host che esce, premi, rivincita', { timeout: 60000 }, async () => {
  const [a, b, c, late] = await Promise.all(['Anna', 'Bea', 'Ciro', 'Lino'].map(phone));
  const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'nomi', label: 'Nomi' }, { key: 'citta', label: 'Città' }], rounds: 2, maxPlayers: 8, timer: 60, hard: true });
  await assert.rejects(a.engine.startGame(code), (e) => e.code === 'few'); // da solo non si parte
  await b.engine.joinRoom(code, b.profile);
  await c.engine.joinRoom(code, c.profile);
  await assert.rejects(b.engine.startGame(code), (e) => e.code === 'nothost');

  await a.engine.startGame(code);
  let room = await a.room(code);
  assert.equal(room.status, 'spin');
  const L = room.round.letter;
  assert.ok(room.round.endsAt - room.round.startsAt === 60000);

  // Prima del via nessuno può far partire il round.
  await denied(set(ref(b.db, `rooms/${code}/status`), 'play'));
  await denied(set(ref(b.db, `rooms/${code}/answers/${b.uid}`), { nomi: 'x' }));
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await b.engine.goPlay(code); // anche un invitato può farlo
  await c.engine.goPlay(code); // il secondo non fa niente
  assert.equal((await a.room(code)).status, 'play');

  // Chi entra a partita iniziata aspetta.
  const j = await late.engine.joinRoom(code, late.profile);
  assert.equal(j.waiting, true);

  // Risposte: Anna e Bea uguali in Nomi, Ciro lettera sbagliata in Città.
  await a.engine.saveAnswers(code, { nomi: L + 'arco', citta: L + 'ilano' });
  await b.engine.saveAnswers(code, { nomi: L.toLowerCase() + 'àrco ', citta: L + 'odena' });
  await c.engine.saveAnswers(code, { nomi: L + 'ino', citta: 'Qqq' });
  // Chi aspetta può anche scrivere: lo esclude il conteggio dei punti, non le regole.
  await late.engine.saveAnswers(code, { nomi: L + 'ucio' });

  // STOP di Bea: vince lei anche se Ciro lo preme subito dopo.
  const [sb, sc] = await Promise.all([b.engine.pressStop(code, { nomi: L.toLowerCase() + 'àrco ', citta: L + 'odena' }), sleep(30).then(() => c.engine.pressStop(code))]);
  assert.equal(sb, true);
  assert.equal(sc, false);
  room = await a.room(code);
  assert.equal(room.status, 'review');
  assert.equal(room.round.stoppedBy, b.uid);

  // Le ultime lettere si salvano ancora per poco, poi no.
  await a.engine.saveAnswers(code, { nomi: L + 'arco', citta: L + 'ilano' });
  await sleep(3200);
  await denied(a.engine.saveAnswers(code, { nomi: 'cambiata' }));
  await denied(set(ref(a.db, `rooms/${code}/answers/${c.uid}/nomi`), 'Truccata')); // l'host non scrive per gli altri
  await denied(set(ref(a.db, `rooms/${code}/votes/nomi/${c.uid}/${b.uid}`), true)); // né vota al posto loro

  // Voti: non sulla propria parola; Città di Anna bocciata da Bea e Ciro (2 su 2 altri).
  await denied(set(ref(a.db, `rooms/${code}/votes/citta/${a.uid}/${a.uid}`), true));
  await b.engine.vote(code, 'citta', a.uid, true);
  await c.engine.vote(code, 'citta', a.uid, true);
  await assert.rejects(b.engine.nextCategory(code), (e) => e.code === 'nothost');
  await denied(set(ref(b.db, `rooms/${code}/round/reviewIdx`), 1));
  await b.engine.react(code, 'Geniale');

  await a.engine.nextCategory(code); // -> Città
  assert.equal((await a.room(code)).round.reviewIdx, 1);
  await a.engine.nextCategory(code); // -> punteggi
  room = await a.room(code);
  assert.equal(room.status, 'round');
  // Nomi: Anna e Bea doppia (5+5), Ciro unica (10). Città: Anna bocciata (0), Bea sola valida (20), Ciro lettera sbagliata (0).
  assert.deepEqual(room.round.points, { [a.uid]: 5, [b.uid]: 25, [c.uid]: 10 });
  assert.equal(room.players[late.uid].score, 0);
  assert.equal(room.players[b.uid].stats.uniq, 1);
  assert.equal(room.players[a.uid].stats.dup, 1);
  assert.equal(room.players[b.uid].stats.stops, 1); // contato dall'host insieme ai punti

  // Round 2: il ritardatario ora gioca. L'host chiude la finestra a metà: Bea (entrata prima) diventa host.
  await a.engine.nextRound(code);
  room = await a.room(code);
  assert.equal(room.status, 'spin');
  assert.equal(room.round.n, 2);
  assert.notEqual(room.round.letter, L);
  assert.equal(room.players[late.uid].waiting, undefined);

  const unsub = b.engine.subscribe(code, () => {});
  goOffline(a.db);
  await waitFor(async () => (await b.room(code)).hostId === b.uid, HOST_GRACE_MS + 6000);
  unsub();

  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await c.engine.goPlay(code);
  const L2 = (await b.room(code)).round.letter;
  await c.engine.saveAnswers(code, { nomi: L2 + 'aria', citta: L2 + 'oma' });
  await late.engine.saveAnswers(code, { nomi: L2 + 'aria', citta: L2 + 'una' });
  await c.engine.pressStop(code);
  await b.engine.nextCategory(code);
  await b.engine.nextCategory(code);
  room = await b.room(code);
  // Anna è offline: conta come vuota e non entra nel conteggio.
  assert.equal(room.round.points[a.uid], undefined);
  assert.equal(room.round.points[late.uid], 5 + 10);

  await b.engine.nextRound(code);
  assert.equal((await b.room(code)).status, 'awards');
  await b.engine.showPodium(code);
  assert.equal((await b.room(code)).status, 'final');

  // A fine partita l'host può tornare in lobby e cambiare le impostazioni prima di rigiocare.
  await assert.rejects(c.engine.backToLobby(code), (e) => e.code === 'nothost');
  await b.engine.backToLobby(code);
  room = await b.room(code);
  assert.equal(room.status, 'lobby');
  assert.equal(room.round, undefined);
  await b.engine.updateSettings(code, { ...room.settings, rounds: 1 });

  await b.engine.rematch(code);
  room = await b.room(code);
  assert.equal(room.status, 'spin');
  assert.equal(room.round.n, 1);
  assert.ok(Object.values(room.players).every((p) => p.score === 0 && p.stats.stops === 0));
});

test('tempo scaduto: si chiude da solo, ma non prima', { timeout: 30000 }, async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'nomi', label: 'Nomi' }, { key: 'cose', label: 'Cose' }], rounds: 1, maxPlayers: 4, timer: 60, hard: true });
  await b.engine.joinRoom(code, b.profile);
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await b.engine.goPlay(code);
  await denied(b.engine.timeUp(code)); // mancano 60 secondi
  // Simulo la fine del tempo spostando endsAt (lo può fare solo l'host).
  await update(ref(a.db, `rooms/${code}/round`), { endsAt: Date.now() - 10 });
  assert.equal(await b.engine.timeUp(code), true);
  const room = await a.room(code);
  assert.equal(room.status, 'review');
  assert.equal(room.round.stoppedBy, 'time');
});

test('uscita: l\'host esce dalla lobby e passa il posto, l\'ultimo chiude la stanza', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  await a.engine.leaveRoom(code);
  let room = await b.room(code);
  assert.equal(room.hostId, b.uid);
  assert.equal(room.players[a.uid], undefined);
  await b.engine.leaveRoom(code);
  room = await b.room(code);
  assert.equal(room, null);
});

test('host collegato ma fermo: dopo un minuto il posto passa al giocatore successivo', { timeout: 30000 }, async () => {
  const [a, b, c] = await Promise.all(['Anna', 'Bea', 'Ciro'].map(phone));
  const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'nomi', label: 'Nomi' }, { key: 'cose', label: 'Cose' }], rounds: 2, maxPlayers: 4, timer: 60, hard: true });
  await b.engine.joinRoom(code, b.profile);
  await c.engine.joinRoom(code, c.profile);
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await b.engine.goPlay(code);
  await b.engine.saveAnswers(code, { nomi: 'x', cose: 'y' });
  await b.engine.pressStop(code);
  let room = await a.room(code);
  assert.equal(room.status, 'review');
  assert.ok(room.round.stepAt > Date.now() - 5000);

  // Prima del minuto nessuno può prendere il posto, e nessuno può spostare indietro l'orologio.
  await denied(set(ref(b.db, `rooms/${code}/hostId`), b.uid));
  await denied(set(ref(c.db, `rooms/${code}/round/stepAt`), 1));

  // Simulo un minuto di attesa: l'host (che può scrivere round) sposta stepAt indietro.
  await set(ref(a.db, `rooms/${code}/round/stepAt`), Date.now() - IDLE_MS - 5000);
  const offB = b.engine.subscribe(code, () => {});
  const offC = c.engine.subscribe(code, () => {});
  await waitFor(async () => (await a.room(code)).hostId === b.uid, 8000); // Bea è entrata prima di Ciro
  offB(); offC();
  room = await a.room(code);
  assert.ok(room.round.stepAt > Date.now() - 5000, 'il nuovo host ha un minuto pieno');
  await denied(set(ref(a.db, `rooms/${code}/hostId`), a.uid)); // l'host di prima non se lo riprende da solo
  await b.engine.nextCategory(code); // e il nuovo host fa andare avanti la partita
  assert.equal((await a.room(code)).round.reviewIdx, 1);
});

// ---------- attacchi dall'audit di sicurezza: le regole devono respingerli ----------

const big = (kb) => 'x'.repeat(kb * 1024);
const DB_HTTP = `http://127.0.0.1:${process.env.DBP || 9000}`;
const NS = `?ns=${PROJECT}-default-rtdb`;
/** Scrittura da amministratore sull'emulatore (salta le regole): serve solo a preparare i casi. */
const admin = (path, body) => fetch(`${DB_HTTP}/${path}.json${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(body) });

test('attacchi: dimensioni, campi inventati, reazioni a raffica, colori con CSS', async () => {
  const [a, b, x] = await Promise.all(['Anna', 'Bea', 'Estraneo'].map(phone));
  const code = await a.engine.createRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  const R = `rooms/${code}`;
  await denied(set(ref(a.db, `${R}/settings/zavorra`), big(64)));
  await denied(set(ref(a.db, `${R}/settings/cats/0/color`), 'red; background-image: url(https://x.y/z.png)'));
  await denied(set(ref(a.db, `${R}/settings/cats/0/label`), 'x'.repeat(40)));
  await denied(set(ref(a.db, `${R}/kicked/${x.uid}`), big(4)));
  await denied(set(ref(b.db, `${R}/players/${b.uid}/extra`), 'x'));
  // Stanza fantasma: senza hostId nessuno la può creare scrivendo solo il proprio giocatore.
  await denied(set(ref(x.db, `rooms/ZZZ2/players/${x.uid}`), { name: 'x', color: 0, face: 0, joinedAt: Date.now(), score: 0 }));
  // createdAt nel futuro e joinedAt falso.
  await denied(set(ref(a.db, `${R}/createdAt`), Date.now() + 1e9));
  await denied(set(ref(b.db, `${R}/players/${b.uid}/joinedAt`), 0));
  // Reazioni: una alla volta, ognuno nella propria casella, niente zavorra.
  await b.engine.react(code, 'Ahah');
  await denied(b.engine.react(code, 'Ancora'));
  await denied(set(ref(b.db, `${R}/reactions/${a.uid}`), { text: 'finta', at: Date.now() }));
  await sleep(1600);
  await b.engine.react(code, 'Geniale');
  await denied(set(ref(a.db, `${R}/reactions/${a.uid}`), { text: 'x', at: Date.now(), zavorra: big(8) }));
});

test('attacchi in partita: STOP sabotato, STOP e punti truccati, stato all\'indietro', { timeout: 30000 }, async () => {
  const [a, b, c] = await Promise.all(['Anna', 'Bea', 'Ciro'].map(phone));
  const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'nomi', label: 'Nomi', color: '#FF8A65' }, { key: 'cose', label: 'Cose', color: '#5CD0FF' }], rounds: 2, maxPlayers: 4, timer: 60, hard: true });
  await b.engine.joinRoom(code, b.profile);
  await c.engine.joinRoom(code, c.profile);
  await a.engine.startGame(code);
  const R = `rooms/${code}`;
  await denied(set(ref(a.db, `${R}/status`), 'final')); // l'host non salta le fasi
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await b.engine.goPlay(code);
  // Ciro prova a bloccare lo STOP scrivendo stoppedAt in anticipo, e a fermare l'orologio dell'host.
  await denied(set(ref(c.db, `${R}/round/stoppedAt`), Date.now()));
  await denied(set(ref(c.db, `${R}/round/stepAt`), Date.now()));
  await denied(set(ref(c.db, `${R}/players/${c.uid}/stats/stops`), 999));
  await denied(set(ref(c.db, `${R}/answers/${c.uid}`), { inventata: 'x' }));
  await b.engine.saveAnswers(code, { nomi: 'x', cose: 'y' });
  assert.equal(await b.engine.pressStop(code), true);
  assert.equal((await a.room(code)).status, 'review');
  await denied(set(ref(a.db, `${R}/status`), 'play')); // nemmeno l'host torna indietro
  await denied(set(ref(a.db, `${R}/players/${c.uid}/score`), 1000)); // punti solo nel passaggio a fine round
  await denied(set(ref(c.db, `${R}/votes/inventata/${a.uid}/${c.uid}`), true));
  await a.engine.nextCategory(code);
  await a.engine.nextCategory(code);
  const room = await a.room(code);
  assert.equal(room.status, 'round');
  assert.equal(room.players[b.uid].stats.stops, 1);
});

test('STOP rimasto a metà: un altro telefono lo completa', { timeout: 30000 }, async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await b.engine.goPlay(code);
  // Bea scrive stoppedBy e poi "perde la connessione" prima di cambiare lo stato.
  await set(ref(b.db, `rooms/${code}/round/stoppedBy`), b.uid);
  assert.equal((await a.room(code)).status, 'play');
  await a.engine.finishStop(code);
  const room = await a.room(code);
  assert.equal(room.status, 'review');
  assert.equal(room.round.stoppedBy, b.uid);
});

test('pulizia: chi crea una stanza cancella quelle più vecchie di 12 ore, non le recenti', async () => {
  const [a, x] = await Promise.all(['Anna', 'Estraneo'].map(phone));
  const old = Date.now() - 13 * 3600 * 1000;
  for (const k of ['VEC2', 'VEC3']) await admin(`rooms/${k}`, { hostId: 'zz', status: 'lobby', createdAt: old, settings: { cats: [], rounds: 1, maxPlayers: 2, timer: 0, hard: true }, players: { zz: { name: 'z', color: 0, face: 0, joinedAt: old, score: 0 } } });
  const recent = await a.engine.createRoom(a.profile); // dentro lancia la pulizia
  await waitFor(async () => (await a.room('VEC2')) === null && (await a.room('VEC3')) === null, 5000);
  await denied(set(ref(x.db, `rooms/${recent}`), null)); // una stanza recente non la cancella un estraneo
  assert.ok(await a.room(recent));
});

test('Fondatore: CANT non diventa mai una stanza e non dà privilegi su Firebase', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  // Il caso estrae C, A, N, T per il primo tentativo: il motore lo scarta e ne prova un altro.
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seq = [...'CANT'].map((ch) => (abc.indexOf(ch) + 0.5) / abc.length);
  const realRandom = Math.random;
  Math.random = () => (seq.length ? seq.shift() : realRandom());
  let code;
  try { code = await a.engine.createRoom(a.profile); } finally { Math.random = realRandom; }
  assert.notEqual(code, 'CANT');
  assert.equal(await a.room('CANT'), null);

  // Scrivere a mano un campo "fondatore" sul proprio giocatore viene respinto: non esiste un ruolo così.
  await b.engine.joinRoom(code, b.profile);
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/fondatore`), true));
  await denied(update(ref(b.db, `rooms/${code}/players/${b.uid}`), { fondatore: true, score: 999 }));
  // Il codice non fa diventare host né apre la stanza agli altri: le regole restano quelle di sempre.
  await denied(set(ref(b.db, `rooms/${code}/hostId`), b.uid));
  await denied(set(ref(b.db, `rooms/${code}/players/${a.uid}/score`), 0));
  assert.equal((await a.room(code)).hostId, a.uid);
});
