// Contatori di gioco e presenza dal vivo, sull'emulatore Firebase (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, goOffline } from 'firebase/database';
import { STAT_KEYS, dayKey, track, trackMinutes, setLive, leggiFonte, FONTI } from './stats.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
async function phone() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9100}?ns=${PROJECT}-default-rtdb` }, `s${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9100));
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, db, read: (path) => get(ref(db, path)).then((s) => s.val()) };
}
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('contatori del ritorno giornaliero: traguardi, serie perse, scudi, sfide e scrigni', () => {
  const keys = ['serie_3', 'serie_7', 'serie_14', 'serie_30', 'serie_50', 'serie_100', 'serie_persa', 'scudo_usato',
    'sfida_facile', 'sfida_media', 'sfida_difficile', 'sfide_tutte', 'scrigni_aperti', 'scrigni_rari'];
  for (const k of keys) assert.ok(STAT_KEYS.includes(k), k);
});

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

test('ogni contatore dell\'elenco è accettato dalle regole, e le fasce orarie solo da 00 a 23', async () => {
  const a = await phone();
  const day = dayKey(Date.now());
  for (const k of STAT_KEYS) await track(a.db, k);
  assert.equal(await a.read(`stats/days/${day}/ora_23`), 1);
  assert.equal(await a.read(`stats/days/${day}/giocatori_5piu`), 1);
  assert.equal(await a.read(`stats/days/${day}/solo_medio_vinte`), 1);
  await denied(set(ref(a.db, `stats/days/${day}/ora_24`), 1));
  assert.ok(STAT_KEYS.length > 60);
});

test('minuti di gioco: si sommano, ma non più di 120 alla volta e mai all\'indietro', async () => {
  const [a, b] = await Promise.all([phone(), phone()]);
  const day = dayKey(Date.now());
  await trackMinutes(a.db, 'minuti_online', 12);
  await trackMinutes(b.db, 'minuti_online', 7);
  assert.equal(await a.read(`stats/days/${day}/minuti_online`), 19);
  await denied(set(ref(a.db, `stats/days/${day}/minuti_online`), 500));
  await denied(set(ref(a.db, `stats/days/${day}/minuti_online`), 3));
  await denied(set(ref(a.db, `stats/days/${day}/aperture`), 9), 'gli altri contatori restano a +1');
});

test('lo stesso telefono conta lo stesso contatore più volte di fila senza perderne nessuno', async () => {
  const a = await phone();
  const day = dayKey(Date.now());
  const g0 = (await a.read(`stats/days/${day}/guida_aperta`)) || 0;
  const m0 = (await a.read(`stats/days/${day}/minuti_solo`)) || 0;
  await Promise.all([1, 2, 3, 4, 5].map(() => track(a.db, 'guida_aperta')));
  await Promise.all([3, 4].map((m) => trackMinutes(a.db, 'minuti_solo', m)));
  assert.equal(await a.read(`stats/days/${day}/guida_aperta`), g0 + 5);
  assert.equal(await a.read(`stats/days/${day}/minuti_solo`), m0 + 7);
});

test('la fonte di una visita si legge da ?s= e si ricorda per la sessione; il resto è "altro"', () => {
  assert.equal(leggiFonte('?s=tiktok', null), 'tiktok');
  assert.equal(leggiFonte('?s=TikTok&x=1', null), 'tiktok', 'maiuscole');
  assert.equal(leggiFonte('?s=boh', null), 'altro', 'una fonte sconosciuta conta come altro');
  assert.equal(leggiFonte('', null), null, 'senza parametro niente fonte');
  assert.equal(leggiFonte('', 'instagram'), 'instagram', 'dentro la stessa sessione resta quella della prima pagina');
  assert.equal(leggiFonte('?s=youtube', 'instagram'), 'youtube', 'un parametro nuovo vince');
  for (const f of FONTI) assert.ok(STAT_KEYS.includes(`fonte_${f}`) && STAT_KEYS.includes(`nuovi_${f}`), f);
});

test('le fonti arrivano nei contatori del giorno, quelle inventate no', async () => {
  const a = await phone();
  const day = dayKey(Date.now());
  const f0 = (await a.read(`stats/days/${day}/fonte_tiktok`)) || 0;
  await track(a.db, 'fonte_tiktok');
  await track(a.db, 'nuovi_tiktok');
  assert.equal(await a.read(`stats/days/${day}/fonte_tiktok`), f0 + 1);
  await denied(set(ref(a.db, `stats/days/${day}/fonte_inventata`), 1));
});

test('un telefono di prova (?test=1) non conta nelle statistiche né nella presenza dal vivo', async () => {
  const a = await phone();
  const day = dayKey(Date.now());
  const q0 = (await a.read(`stats/days/${day}/guida_aperta`)) || 0;
  globalThis.NCC_TEST = true;
  try {
    await track(a.db, 'guida_aperta');
    await trackMinutes(a.db, 'minuti_solo', 5);
    await setLive(a.db, a.uid, 'home');
  } finally { globalThis.NCC_TEST = false; }
  assert.equal((await a.read(`stats/days/${day}/guida_aperta`)) || 0, q0, 'contatore intatto');
  assert.equal(await a.read(`live/${a.uid}`), null, 'nessuna presenza');
  await track(a.db, 'guida_aperta');
  assert.equal(await a.read(`stats/days/${day}/guida_aperta`), q0 + 1, 'tolto il flag, torna a contare');
});
