// Contatori di gioco e presenza dal vivo, sull'emulatore Firebase (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, goOffline } from 'firebase/database';
import { STAT_KEYS, dayKey, track, setLive } from './stats.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
async function phone() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9000}?ns=${PROJECT}-default-rtdb` }, `s${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9099}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9000));
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, db, read: (path) => get(ref(db, path)).then((s) => s.val()) };
}
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('il giorno è quello italiano', () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 21, 22, 30)), '2026-10-22', 'alle 00:30 in Italia è già il 22');
  assert.equal(dayKey(Date.UTC(2026, 9, 21, 10, 0)), '2026-10-21');
});

test('contatori: salgono di uno da ogni telefono, niente aumenti truccati né contatori inventati', async () => {
  const [a, b] = await Promise.all([phone(), phone()]);
  const day = dayKey(Date.now());
  await track(a.db, 'stanze_create');
  await track(b.db, 'stanze_create');
  await track(a.db, 'solo_medio');
  assert.equal(await a.read(`stats/days/${day}/stanze_create`), 2);
  assert.equal(await b.read(`stats/days/${day}/solo_medio`), 1);
  await denied(set(ref(a.db, `stats/days/${day}/stanze_create`), 50));
  await denied(set(ref(a.db, `stats/days/${day}/stanze_create`), 1));
  await denied(set(ref(a.db, `stats/days/${day}/hacker`), 1));
  await denied(set(ref(a.db, 'stats/days/ieri/stanze_create'), 1));
  await denied(set(ref(a.db, `stats/days/${day}`), null));
  assert.ok(STAT_KEYS.includes('installazioni') && STAT_KEYS.includes('solo_impossibile'));
});

test('dal vivo: ognuno scrive solo la propria presenza, e sparisce quando si scollega', async () => {
  const [a, b] = await Promise.all([phone(), phone()]);
  await setLive(a.db, a.uid, 'home');
  await setLive(a.db, a.uid, 'solo');
  assert.equal((await b.read(`live/${a.uid}`)).where, 'solo');
  await denied(set(ref(b.db, `live/${a.uid}`), { where: 'home', at: Date.now() }));
  await denied(setLive(b.db, b.uid, 'ovunque'));
  await denied(set(ref(b.db, `live/${b.uid}/extra`), 1));
  goOffline(a.db);
  for (let i = 0; i < 30 && (await b.read(`live/${a.uid}`)); i++) await sleep(200);
  assert.equal(await b.read(`live/${a.uid}`), null);
});
