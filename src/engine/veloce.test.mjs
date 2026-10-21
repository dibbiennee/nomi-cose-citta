// Partita veloce: regole del database per coda, stanze veloci e robot, sull'emulatore (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, serverTimestamp } from 'firebase/database';
import { createEngine, SPIN_MS, COUNTDOWN_MS } from './room.js';
import { DEFAULT_CATEGORIES, sanitizeSettings } from './rules.js';
import { track, setLive } from '../stats.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
async function phone(name) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9100}?ns=${PROJECT}-default-rtdb` }, `v${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9100));
  const { user } = await signInAnonymously(auth);
  const engine = createEngine(db, user.uid);
  return { name, uid: user.uid, db, engine, profile: { name, color: n % 6, face: n % 6 }, read: (p) => get(ref(db, p)).then((s) => s.val()) };
}
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

const QUICK = sanitizeSettings({ cats: DEFAULT_CATEGORIES.slice(0, 3), rounds: 3, timer: 90, hard: true, maxPlayers: 4 });
const player = (p) => ({ name: p.name, color: p.profile.color, face: p.profile.face, joinedAt: serverTimestamp(), score: 0, stats: { stops: 0, uniq: 0, dup: 0 } });
const botPlayer = (name) => ({ name, color: 1, face: 1, joinedAt: serverTimestamp(), score: 0, stats: { stops: 0, uniq: 0, dup: 0 }, bot: true });
let codeN = 0;
const freshCode = () => `Q${'ABCDEFGHJK'[codeN % 10]}${'23456789'[Math.floor(codeN / 10) % 8]}${'MNPQRSTUVW'[codeN++ % 10]}`;
/** Stanza scritta a mano dall'host, veloce o normale. */
async function makeRoom(host, quick) {
  const code = freshCode();
  await set(ref(host.db, `rooms/${code}`), {
    hostId: host.uid, status: 'lobby', createdAt: serverTimestamp(), settings: QUICK,
    players: { [host.uid]: player(host) }, presence: { [host.uid]: true }, ...(quick ? { quick: true } : {}),
  });
  return code;
}
/** Porta la stanza in "play" con le funzioni del motore. */
async function toPlay(host, code) {
  await host.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await host.engine.goPlay(code);
}

test('stanze veloci: robot solo lì, scritti dall\'host, e il segno quick non cambia', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const quick = await makeRoom(a, true);
  await set(ref(a.db, `rooms/${quick}/players/bot1`), botPlayer('Giulia'));
  await set(ref(a.db, `rooms/${quick}/presence/bot1`), true);
  assert.equal((await a.read(`rooms/${quick}/players/bot1`)).bot, true);
  await denied(set(ref(a.db, `rooms/${quick}/quick`), false));
  await denied(set(ref(a.db, `rooms/${quick}/players/bot7`), botPlayer('Marco')), 'id robot fuori elenco');
  await b.engine.joinRoom(quick, b.profile);
  await denied(set(ref(b.db, `rooms/${quick}/players/bot2`), botPlayer('Sara')), 'solo l\'host aggiunge robot');
  await denied(set(ref(b.db, `rooms/${quick}/players/${b.uid}/bot`), true), 'un umano non diventa robot');
  const normal = await makeRoom(a, false);
  await denied(set(ref(a.db, `rooms/${normal}/players/bot1`), botPlayer('Giulia')), 'niente robot nelle stanze normali');
  await denied(set(ref(a.db, `rooms/${normal}/quick`), true), 'una stanza normale non diventa veloce');
});

test('a nome dei robot scrivono i giocatori umani della stanza, nessun altro', async () => {
  const [a, b, x] = await Promise.all(['Anna', 'Bea', 'Xeno'].map(phone));
  const code = await makeRoom(a, true);
  await set(ref(a.db, `rooms/${code}/players/bot1`), botPlayer('Giulia'));
  await set(ref(a.db, `rooms/${code}/presence/bot1`), true);
  await b.engine.joinRoom(code, b.profile);
  await toPlay(a, code);
  const L = (await a.read(`rooms/${code}/round/letter`));
  await set(ref(b.db, `rooms/${code}/answers/bot1`), { nomi: `${L}iulia` });
  assert.equal((await a.read(`rooms/${code}/answers/bot1/nomi`)), `${L}iulia`);
  await denied(set(ref(x.db, `rooms/${code}/answers/bot1`), { nomi: 'X' }), 'un estraneo no');
  await denied(set(ref(b.db, `rooms/${code}/round/stoppedBy`), 'bot9'), 'robot che non esiste');
  await set(ref(b.db, `rooms/${code}/round/stoppedBy`), 'bot1');
  await a.engine.finishStop(code);
  assert.equal(await a.read(`rooms/${code}/status`), 'review');
  await set(ref(b.db, `rooms/${code}/votes/nomi/${a.uid}/bot1`), true);
  await denied(set(ref(b.db, `rooms/${code}/votes/nomi/bot1/${a.uid}`), true), 'non si vota a nome di un altro umano');
  await denied(set(ref(x.db, `rooms/${code}/votes/nomi/${a.uid}/bot1`), true), 'un estraneo non vota per i robot');
});

test('stanza normale: nessuno scrive a nome di un id robot', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await makeRoom(a, false);
  await b.engine.joinRoom(code, b.profile);
  await toPlay(a, code);
  await denied(set(ref(b.db, `rooms/${code}/answers/bot1`), { nomi: 'X' }));
  await denied(set(ref(b.db, `rooms/${code}/round/stoppedBy`), 'bot1'));
});

test('coda: ognuno la propria voce; la stanza la assegna solo il suo host, una volta', async () => {
  const [a, b, c] = await Promise.all(['Anna', 'Bea', 'Ciro'].map(phone));
  const entry = (p) => ({ name: p.name, color: 1, face: 1, at: serverTimestamp() });
  await set(ref(a.db, `queue/${a.uid}`), entry(a));
  await set(ref(c.db, `queue/${c.uid}`), entry(c));
  await denied(set(ref(a.db, `queue/${b.uid}`), entry(b)), 'non la voce di un altro');
  await denied(set(ref(a.db, `queue/${a.uid}`), { name: 'x', color: 1, face: 1, at: 5 }), 'at deve essere l\'ora del server');
  assert.equal((await b.read(`queue/${a.uid}`)).name, 'Anna');
  const code = await makeRoom(b, true);
  await set(ref(b.db, `queue/${a.uid}/room`), code);
  assert.equal(await a.read(`queue/${a.uid}/room`), code);
  const other = await makeRoom(c, true);
  await denied(set(ref(c.db, `queue/${a.uid}/room`), other), 'già assegnata');
  await denied(set(ref(a.db, `queue/${c.uid}/room`), code), 'chi non è host di quella stanza non assegna');
  await set(ref(a.db, `queue/${a.uid}`), null);
  assert.equal(await b.read(`queue/${a.uid}`), null);
});

test('statistiche: partite veloci e chi è in coda', async () => {
  const a = await phone('Anna');
  await track(a.db, 'partite_veloci');
  await setLive(a.db, a.uid, 'coda');
  assert.equal((await a.read(`live/${a.uid}`)).where, 'coda');
});

// ---------- motore: stanze veloci e robot ----------
import { createDictionary } from '../solo/dizionario.js';
import { ALPHABET } from './rules.js';
import { goOffline } from 'firebase/database';
const lists = {};
for (const { key } of DEFAULT_CATEGORIES) {
  lists[key] = {};
  for (const l of ALPHABET) lists[key][l] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`${l}${key}${i}`, i % 3]);
}
const dict = createDictionary(lists);
/** Fa girare i robot dal telefono p finché cond(room) è vera o scade il tempo. */
async function drive(p, code, cond, ms = 30000) {
  const t0 = Date.now();
  for (;;) {
    const room = await p.read(`rooms/${code}`);
    if (cond(room) || Date.now() - t0 > ms) return room;
    if (p.engine.shouldDriveBots(code, room, p.engine.now(), dict)) await p.engine.driveBots(code, room, dict).catch(() => {});
    await sleep(300);
  }
}
const botsWrote = (room) => ['bot1', 'bot2'].every((id) => Object.keys(room?.answers?.[id] || {}).length > 0);

test('partita veloce con 2 persone e 2 robot fino al podio', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createQuickRoom(a.profile);
  let room = await a.read(`rooms/${code}`);
  assert.equal(room.quick, true);
  assert.equal(room.settings.maxPlayers, 4);
  assert.deepEqual(room.settings.cats.map((c) => c.key), ['nomi', 'cose', 'citta']);
  await b.engine.joinRoom(code, b.profile);
  await a.engine.updateSettings(code, { ...room.settings, rounds: 1 });
  await a.engine.addBots(code, 2);
  room = await a.read(`rooms/${code}`);
  assert.ok(room.players.bot1.bot && room.players.bot2.bot);
  assert.ok(![a.name, b.name].includes(room.players.bot1.name));
  assert.equal(b.engine.shouldDriveBots(code, room, Date.now()), false, 'scrive l\'host');
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await a.engine.goPlay(code);
  room = await drive(a, code, botsWrote);
  assert.ok(botsWrote(room), 'i robot hanno scritto');
  await b.engine.pressStop(code, { nomi: `${room.round.letter}parolamia` });
  room = await drive(a, code, (r) => r.status === 'review' && r.votes !== undefined, 5000);
  assert.equal(room.status, 'review');
  for (let i = 0; i < 3; i++) await a.engine.nextCategory(code);
  assert.equal(await a.read(`rooms/${code}/status`), 'round');
  await a.engine.nextRound(code);
  await a.engine.showPodium(code);
  room = await a.read(`rooms/${code}`);
  assert.equal(room.status, 'final');
  assert.ok(typeof room.players.bot1.score === 'number');
});

test('se l\'host cade durante il round, i robot li fa giocare un altro telefono; un robot non diventa mai host', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createQuickRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  await a.engine.addBots(code, 2);
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await a.engine.goPlay(code);
  const offB = b.engine.subscribe(code, () => {}); // come nell'app: ascoltando la stanza si prende il posto dell'host
  goOffline(a.db);
  let room = await drive(b, code, (r) => r.presence?.[a.uid] === false, 5000);
  assert.equal(room.presence[a.uid], false);
  assert.equal(b.engine.shouldDriveBots(code, room, Date.now()), true, 'tocca a Bea');
  room = await drive(b, code, botsWrote);
  assert.ok(botsWrote(room), 'i robot continuano dal telefono di Bea');
  room = await drive(b, code, (r) => r.hostId === b.uid, 8000);
  assert.equal(room.hostId, b.uid, 'il nuovo host è Bea, non un robot');
  offB();
  await b.engine.leaveRoom(code);
  assert.equal(await b.read(`rooms/${code}/hostId`), a.uid, 'esce Bea: il posto va ad Anna (scollegata ma in stanza), mai a un robot');
});

// ---------- coda ----------
import { createQueue } from './coda.js';
/** Mette in coda i telefoni e restituisce, per ognuno, la stanza assegnata (o null dopo maxMs). */
async function queueUp(phones, opts = {}, maxMs = 12000) {
  const got = new Map();
  const queues = phones.map((p) => createQueue(p.db, p.engine, p.uid, { waitMs: 2000, ...opts }));
  await Promise.all(phones.map((p, i) => queues[i].join(p.profile, (st) => {
    if (st.room) {
      assert.ok(!got.has(p.uid), `${p.name} assegnato due volte`);
      got.set(p.uid, st.room);
    }
  })));
  const t0 = Date.now();
  while (got.size < phones.length && Date.now() - t0 < maxMs) await sleep(200);
  await Promise.all(queues.map((q) => q.leave()));
  return phones.map((p) => got.get(p.uid) || null);
}

test('coda: 4 persone nella stessa stanza veloce, di cui una è l\'host', async () => {
  const phones = await Promise.all(['Q1', 'Q2', 'Q3', 'Q4'].map(phone));
  const rooms = await queueUp(phones);
  assert.ok(rooms.every((r) => r && r === rooms[0]), JSON.stringify(rooms));
  const room = await phones[0].read(`rooms/${rooms[0]}`);
  assert.equal(room.quick, true);
  assert.ok(phones.some((p) => p.uid === room.hostId));
});

test('coda: 6 persone, una stanza da 4 e una da 2, nessuno in due stanze', async () => {
  const phones = await Promise.all(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(phone));
  const rooms = await queueUp(phones);
  assert.ok(rooms.every(Boolean), JSON.stringify(rooms));
  const counts = {};
  rooms.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  assert.deepEqual(Object.values(counts).sort(), [2, 4]);
});

test('coda: da soli, dopo l\'attesa una stanza veloce tutta per sé', async () => {
  const [p] = await Promise.all(['Solo'].map(phone));
  const t0 = Date.now();
  const [code] = await queueUp([p]);
  assert.ok(code);
  assert.ok(Date.now() - t0 >= 1800, 'prima aspetta');
  const room = await p.read(`rooms/${code}`);
  assert.equal(room.hostId, p.uid);
  assert.equal(await p.read(`queue/${p.uid}`), null, 'uscendo dalla coda la voce sparisce');
});

test('coda: due organizzatori insieme non mettono nessuno in due stanze', async () => {
  const phones = await Promise.all(['D1', 'D2', 'D3', 'D4'].map(phone));
  const rooms = await queueUp(phones, { isOrganizer: () => true });
  assert.ok(rooms.every(Boolean), JSON.stringify(rooms));
  for (const code of new Set(rooms)) assert.ok(await phones[0].read(`rooms/${code}/hostId`), `la stanza ${code} esiste`);
});

// ---------- correzioni dopo la revisione ----------
import { scoreRound } from './rules.js';
import { botVotesFor } from './robotOnline.js';

test('i voti dei robot li decide il motore dell\'host: quelli scritti a mano da un umano non contano, e le risposte dei robot non si cancellano', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  const code = await a.engine.createQuickRoom(a.profile);
  await b.engine.joinRoom(code, b.profile);
  await a.engine.updateSettings(code, { ...QUICK, rounds: 1 });
  await a.engine.addBots(code, 2);
  a.engine.setBotDict(dict);
  await a.engine.startGame(code);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await a.engine.goPlay(code);
  let room = await drive(a, code, botsWrote);
  const L = room.round.letter;
  await set(ref(a.db, `rooms/${code}/answers/${a.uid}`), { nomi: `${L}nomi1`, cose: `${L}cose1`, citta: `${L}citta1` });
  await b.engine.pressStop(code, { nomi: `${L}nomi2` });
  // Bea scrive "Non vale" a nome suo e di un robot contro la parola giusta di Anna: con 4 giocatori basterebbero 2 voti.
  await set(ref(b.db, `rooms/${code}/votes/nomi/${a.uid}/${b.uid}`), true);
  await set(ref(b.db, `rooms/${code}/votes/nomi/${a.uid}/bot1`), true);
  await denied(set(ref(b.db, `rooms/${code}/answers/bot1`), null), 'le risposte dei robot non le cancella un umano');
  room = await a.read(`rooms/${code}`);
  const ids = Object.keys(room.players);
  const honest = JSON.parse(JSON.stringify(room.votes || {}));
  for (const cat of Object.keys(honest)) for (const t of Object.keys(honest[cat])) for (const v of Object.keys(honest[cat][t])) if (v.startsWith('bot')) delete honest[cat][t][v];
  for (const v of botVotesFor(room, code, dict)) ((honest[v.cat] ||= {})[v.target] ||= {})[v.voter] = true;
  const expected = scoreRound(ids, ['nomi', 'cose', 'citta'], room.answers, honest, L).points[a.uid];
  for (let i = 0; i < 3; i++) await a.engine.nextCategory(code);
  assert.equal((await a.read(`rooms/${code}/round/points/${a.uid}`)), expected);
});

test('coda: chi annulla mentre organizza non lascia gli altri in una stanza che non parte', async () => {
  const [a, b] = await Promise.all(['Org', 'Altro'].map(phone));
  let release, called = false;
  const gate = new Promise((r) => { release = r; });
  const slow = { ...a.engine, now: a.engine.now, leaveRoom: a.engine.leaveRoom, createQuickRoom: async (p) => { called = true; await gate; return a.engine.createQuickRoom(p); } };
  const qa = createQueue(a.db, slow, a.uid, { waitMs: 1000 });
  const qb = createQueue(b.db, b.engine, b.uid, { waitMs: 10000 }); // Altro aspetta a lungo prima di organizzare da solo
  let bRoom = null;
  await qa.join(a.profile, () => {});
  await sleep(50);
  await qb.join(b.profile, (st) => { if (st.room) bRoom = st.room; });
  for (let i = 0; i < 40 && !called; i++) await sleep(100);
  assert.ok(called, 'Org ha cominciato a organizzare');
  await qa.leave();
  release();
  for (let i = 0; i < 200 && !bRoom; i++) await sleep(100);
  // Altro continua a cercare e, rimasto solo, diventa lui l'organizzatore: la stanza che riceve esiste ed è sua.
  assert.ok(bRoom, 'Altro non resta in coda per sempre');
  assert.equal(await b.read(`rooms/${bRoom}/hostId`), b.uid, 'non una stanza abbandonata da Org');
  await qb.leave();
});

test('coda: si assegna solo a una stanza veloce ancora in lobby', async () => {
  const [a, h] = await Promise.all(['Anna', 'Host'].map(phone));
  await set(ref(a.db, `queue/${a.uid}`), { name: 'Anna', color: 1, face: 1, at: serverTimestamp() });
  const normal = await makeRoom(h, false);
  await denied(set(ref(h.db, `queue/${a.uid}/room`), normal), 'stanza normale');
  const quick = await makeRoom(h, true);
  await set(ref(h.db, `rooms/${quick}/status`), 'spin').catch(() => {});
  if ((await h.read(`rooms/${quick}/status`)) !== 'lobby') await denied(set(ref(h.db, `queue/${a.uid}/room`), quick), 'stanza già partita');
  const fresh = await makeRoom(h, true);
  await set(ref(h.db, `queue/${a.uid}/room`), fresh);
  assert.equal(await a.read(`queue/${a.uid}/room`), fresh);
  await set(ref(a.db, `queue/${a.uid}`), null);
});

test('coda: rientrare con una voce vecchia ancora presente funziona', async () => {
  const a = await phone('Anna');
  await set(ref(a.db, `queue/${a.uid}`), { name: 'Anna', color: 1, face: 1, at: serverTimestamp() });
  const q = createQueue(a.db, a.engine, a.uid, { waitMs: 1000 });
  await q.join(a.profile, () => {});
  assert.ok(await a.read(`queue/${a.uid}`));
  await q.leave();
});

/** Scrive un percorso come amministratore (solo emulatore): per dare a un telefono accessori già comprati. */
const adminSet = (path, value) => fetch(`http://127.0.0.1:${process.env.DBP || 9100}/${path}.json?ns=${process.env.GCLOUD_PROJECT || 'demo-ncc'}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });

test('accessori: si mostrano solo quelli che l\'account possiede; inventati o altrui no', async () => {
  const [a, b] = await Promise.all(['Anna', 'Bea'].map(phone));
  await adminSet(`users/${a.uid}/owned`, { cilindro: true, occhiali_sole: true });
  const code = await a.engine.createRoom({ ...a.profile, acc: { cappello: 'cilindro', occhiali: 'occhiali_sole' } });
  await b.engine.joinRoom(code, { ...b.profile, acc: { cappello: 'trono' } });
  const room = await a.read(`rooms/${code}`);
  assert.deepEqual(room.players[a.uid].acc, { cappello: 'cilindro', occhiali: 'occhiali_sole' });
  assert.equal(room.players[b.uid].acc, undefined);
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/acc/cappello`), 'trono'));
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/acc/scarpe`), 'cilindro'));
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/acc/cappello`), 'cilindro'), 'Bea non possiede il cilindro');
  await denied(set(ref(b.db, `rooms/${code}/players/${b.uid}/acc/cappello`), 'corona_oro'), 'né l\'esclusivo');
  await adminSet(`users/${b.uid}/owned/cappellino`, true);
  await set(ref(b.db, `rooms/${code}/players/${b.uid}/acc/cappello`), 'cappellino');
});
