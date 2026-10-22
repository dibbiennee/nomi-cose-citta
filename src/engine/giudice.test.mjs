// Le parole del dizionario non si possono bocciare votando (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import { createEngine, SPIN_MS, COUNTDOWN_MS } from './room.js';
import { creaDizionario, impostaDizionario } from '../giudice/protezione.js';
import { chiaveParola } from '../giudice/chiave.mjs';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
async function phone(name) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9100}?ns=${PROJECT}-default-rtdb` }, `g${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9100));
  const { user } = await signInAnonymously(auth);
  return { name, uid: user.uid, db, engine: createEngine(db, user.uid), profile: { name, color: n % 6, face: n % 6 }, room: (code) => get(ref(db, `rooms/${code}`)).then((s) => s.val()) };
}
/** Esegue un passo e, se fallisce, dice quale. */
const passo = (nome, p) => Promise.resolve(p).catch((e) => { e.message = `${nome}: ${e.message}`; throw e; });
/** Scrive nell'archivio dei verdetti come farebbe il server (solo emulatore). */
const scriviArchivio = (path, v) => fetch(`http://127.0.0.1:${process.env.DBP || 9100}/${path}.json?ns=${PROJECT}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(v) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

/** Un round di Animali tra tre telefoni: Anna scrive una parola del dizionario, Bea una che non c'è, Ciro un'altra. */
async function partita(withDictionary, archivio = {}, mestieri = []) {
  const [a, b, c] = await Promise.all(['Anna', 'Bea', 'Ciro'].map(phone));
  const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'animali', label: 'Animali' }, { key: 'nomi', label: 'Nomi' }], rounds: 1, maxPlayers: 8, timer: 60, hard: true });
  await b.engine.joinRoom(code, b.profile);
  await c.engine.joinRoom(code, c.profile);
  await passo('startGame', a.engine.startGame(code));
  const L = (await a.room(code)).round.letter;
  impostaDizionario(withDictionary ? creaDizionario({ animali: [`${L}ontra`], mestieri: mestieri.map((m) => L + m) }) : null);
  for (const [parola, voce] of Object.entries(archivio)) await scriviArchivio(`giudizi/animali/${chiaveParola(L + parola)}`, voce);
  await sleep(SPIN_MS + COUNTDOWN_MS + 100);
  await passo('goPlay', b.engine.goPlay(code));
  for (let i = 0; i < 40 && (await a.room(code)).status !== 'play'; i++) { await sleep(150); await b.engine.goPlay(code).catch(() => {}); }
  assert.equal((await a.room(code)).status, 'play');
  await passo('saveAnswers a', a.engine.saveAnswers(code, { animali: `${L}ontra`, nomi: '' }));
  await passo('saveAnswers b', b.engine.saveAnswers(code, { animali: `${L}zzzx`, nomi: '' }));
  await passo('saveAnswers c', c.engine.saveAnswers(code, { animali: `${L}upo`, nomi: '' }));
  await passo('pressStop', a.engine.pressStop(code, { animali: `${L}ontra`, nomi: '' }));
  assert.equal((await a.room(code)).status, 'review');
  // Bea e Ciro votano contro la parola di Anna; Anna e Ciro contro quella di Bea
  await passo('voto b su a', b.engine.vote(code, 'animali', a.uid, true));
  await c.engine.vote(code, 'animali', a.uid, true);
  await a.engine.vote(code, 'animali', b.uid, true);
  await c.engine.vote(code, 'animali', b.uid, true);
  await passo('nextCategory', a.engine.nextCategory(code)); // Animali -> Nomi
  await passo('nextCategory 2', a.engine.nextCategory(code)); // Nomi -> punteggi
  const room = await a.room(code);
  assert.equal(room.status, 'round');
  return { points: room.round.points, a, b, c };
}

test('una parola del dizionario resta valida anche se due su due la votano contro; quella che non c\'è viene bocciata come prima', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(true);
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [10, 0, 10], 'Anna protetta (10), Bea bocciata (0), Ciro unica (10)');
});

test('senza dizionario caricato si vota come oggi: la parola di Anna è bocciata e Ciro è solo a rispondere', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(false);
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [0, 0, 20]);
});

const VALIDA = { v: 'valida', m: 'haiku', at: Date.now(), p: 1 };
const NON_VALIDA = { v: 'non_valida', m: 'entrambi', at: Date.now(), p: 1 };

test('verdetto "valida" dell\'archivio: la parola resta valida anche con due voti contro', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(true, { zzzx: VALIDA });
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [10, 10, 10], 'Anna (dizionario), Bea (verificata) e Ciro: tre parole valide e diverse');
});

test('verdetto "non_valida" dell\'archivio: la parola è bocciata anche senza nessun voto', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(true, { upo: NON_VALIDA });
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [20, 0, 0], 'Anna sola valida (20), Bea bocciata dai voti, Ciro dal giudice');
});

test('verdetto "valida" ma la parola è nel dizionario di un\'altra categoria: non protegge', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(true, { zzzx: VALIDA }, ['zzzx']);
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [10, 0, 10], 'la parola di Bea è un mestiere: si vota e viene bocciata');
});

test('senza dizionario caricato i verdetti dell\'archivio non contano: si vota come oggi', { timeout: 40000 }, async () => {
  const { points, a, b, c } = await partita(false, { zzzx: VALIDA, upo: NON_VALIDA });
  assert.deepEqual([points[a.uid], points[b.uid], points[c.uid]], [0, 0, 20]);
});
