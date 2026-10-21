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
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9000}?ns=${PROJECT}-default-rtdb` }, `v${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9099}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9000));
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
