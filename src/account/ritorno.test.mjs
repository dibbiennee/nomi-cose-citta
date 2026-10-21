// Serie di giorni, traguardi, sfide e scrigno con le loro regole, sull'emulatore (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, linkWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';
import { buyItem, createProfile, touchDay, claimMilestones, finishGame, claimChallenge, claimDaily, deleteProfile } from './profilo.js';
import { challengesFor, completed } from '../ritorno/sfide.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const DBP = process.env.DBP || 9100;
const apps = [];
let n = 0;
async function phone() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${DBP}?ns=${PROJECT}-default-rtdb` }, `ri${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +DBP);
  const { user } = await signInAnonymously(auth);
  const sub = `r-${n}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await linkWithCredential(user, GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true })));
  await user.getIdToken(true);
  return { uid: user.uid, db, read: (p) => get(ref(db, p)).then((s) => s.val()) };
}
const denied = (p, msg) => assert.rejects(p, /permission|PERMISSION_DENIED/i, msg);
const admin = (path, v) => fetch(`http://127.0.0.1:${DBP}/${path}.json?ns=${PROJECT}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(v) });
const adminGet = (path) => fetch(`http://127.0.0.1:${DBP}/${path}.json?ns=${PROJECT}-default-rtdb`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
const HOURS = 3600 * 1000;
/** Un account con profilo creato, "vecchio" di `days` giorni (così i tetti legati all'età non bloccano la prova). */
async function account(days = 120) {
  await admin('meta/iscritti', 500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  await admin(`users/${a.uid}/createdAt`, Date.now() - days * 24 * HOURS);
  return a;
}
const TS = { '.sv': 'timestamp' };
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('touchDay: primo giorno serie 1, il giorno dopo 2, lo stesso giorno di nuovo niente', async () => {
  const a = await account();
  const r1 = await touchDay(a.db, a.uid, '2026-10-20');
  assert.equal(r1.streak, 1);
  assert.equal(r1.event, 'nuovo');
  assert.equal(await touchDay(a.db, a.uid, '2026-10-20'), null, 'stesso giorno');
  await admin(`users/${a.uid}/lastDayAt`, Date.now() - 4 * HOURS);
  const r2 = await touchDay(a.db, a.uid, '2026-10-21');
  assert.equal(r2.streak, 2);
  const p = await a.read(`users/${a.uid}`);
  assert.deepEqual([p.lastDay, p.streak, p.migliorSerie, p.serieId], ['2026-10-21', 2, 2, '2026-10-20']);
});

test('touchDay: chi ha ancora solo lastDaily e streak continua la serie, senza perderla', async () => {
  const a = await account();
  await admin(`users/${a.uid}/lastDaily`, '2026-10-20');
  await admin(`users/${a.uid}/streak`, 5);
  const r = await touchDay(a.db, a.uid, '2026-10-21');
  assert.equal(r.streak, 6);
  assert.equal(await a.read(`users/${a.uid}/migliorSerie`), 6);
});

test('touchDay: un giorno saltato, scudo libero la serie continua; scudo già usato riparte', async () => {
  const a = await account();
  await admin(`users/${a.uid}`, { ...(await adminGet(`users/${a.uid}`)), lastDay: '2026-10-18', lastDayAt: Date.now() - 30 * HOURS, streak: 5, migliorSerie: 5, serieId: '2026-10-14' });
  const r = await touchDay(a.db, a.uid, '2026-10-20');
  assert.equal(r.event, 'scudo');
  assert.equal(r.streak, 6);
  assert.equal(await a.read(`users/${a.uid}/scudo`), '2026-10');
  await admin(`users/${a.uid}/lastDayAt`, Date.now() - 30 * HOURS);
  const r2 = await touchDay(a.db, a.uid, '2026-10-22');
  assert.equal(r2.event, 'riparte');
  assert.equal(r2.streak, 1);
  assert.equal(await a.read(`users/${a.uid}/migliorSerie`), 6, 'il record resta');
});

test('serie: le regole non lasciano barare (salti, età dell\'account, troppo presto, cancellazioni)', async () => {
  const a = await account(3);
  await touchDay(a.db, a.uid, '2026-10-20');
  const u = (v) => update(ref(a.db, `users/${a.uid}`), v);
  await denied(u({ streak: 3, lastDay: '2026-10-21', lastDayAt: TS }), 'più di un giorno alla volta');
  await denied(u({ lastDay: '2026-10-21', lastDayAt: TS }), 'troppo presto: sono passati pochi secondi');
  await denied(u({ streak: 50 }), 'oltre l\'età dell\'account');
  await denied(u({ migliorSerie: 90 }), 'record oltre l\'età dell\'account');
  for (const f of ['lastDay', 'lastDayAt', 'migliorSerie', 'serieId']) await denied(remove(ref(a.db, `users/${a.uid}/${f}`)), `cancellare ${f}`);
  await denied(u({ lastDay: '2026-10-19', lastDayAt: TS }), 'il giorno non torna indietro');
});

test('traguardi: monete una volta per serie, accessorio solo con la serie raggiunta', async () => {
  const a = await account();
  await admin(`users/${a.uid}`, { ...(await adminGet(`users/${a.uid}`)), lastDay: '2026-10-20', lastDayAt: Date.now() - 30 * HOURS, streak: 2, migliorSerie: 2, serieId: '2026-10-18' });
  const t = await touchDay(a.db, a.uid, '2026-10-21');
  assert.deepEqual(t.reached, [3]);
  const coins0 = await a.read(`users/${a.uid}/coins`);
  assert.deepEqual(await claimMilestones(a.db, a.uid, t.reached), { coins: 50, items: [] });
  assert.equal(await a.read(`users/${a.uid}/coins`), coins0 + 50);
  assert.deepEqual(await claimMilestones(a.db, a.uid, [3]), { coins: 0, items: [] }, 'già presa in questa serie');
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: coins0 + 600, [`claims/${a.uid}/m_2026-10-18_14`]: true }), 'traguardo 14 con la serie a 3');
  await denied(remove(ref(a.db, `claims/${a.uid}/m_2026-10-18_3`)), 'ripresa cancellando il segno');
  await denied(set(ref(a.db, `claims/${a.uid}/m_2026-10-18_3`), true), 'riscritto sopra');
  // serie a 14: solo monete (gli accessori di serie si provano con il catalogo, nel test degli accessori)
  await admin(`users/${a.uid}`, { ...(await adminGet(`users/${a.uid}`)), lastDay: '2026-10-21', lastDayAt: Date.now() - 30 * HOURS, streak: 13, migliorSerie: 13 });
  const t14 = await touchDay(a.db, a.uid, '2026-10-22');
  assert.deepEqual(t14.reached, [14]);
  const c1 = await a.read(`users/${a.uid}/coins`);
  assert.deepEqual(await claimMilestones(a.db, a.uid, t14.reached), { coins: 300, items: [] });
  assert.equal(await a.read(`users/${a.uid}/coins`), c1 + 300);
});

test('scrigno: partita e scrigno in una scrittura, tetti di monete e di scrigni al giorno', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, '2026-10-21');
  const c0 = await a.read(`users/${a.uid}/coins`);
  const r = await finishGame(a.db, a.uid, { result: { won: true, unique: 2, mode: 'online', rank: 1, players: 3, humans: 3 }, today: '2026-10-21', rng: () => 0.5 });
  assert.equal(r.chest.kind, 'monete');
  assert.ok(r.chest.coins >= 5 && r.chest.coins <= 40);
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + 12 + r.chest.coins);
  assert.equal((await a.read(`users/${a.uid}/scrigni`)).n, 1);
  const day = '2026-10-21';
  const expected = completed(day, { won: true, unique: 2, mode: 'online', rank: 1, players: 3, humans: 3 });
  assert.deepEqual([...r.done].sort(), [...expected].sort());
  const prog = await a.read(`users/${a.uid}/sfideFatte/${day}`);
  assert.deepEqual(Object.keys(prog || {}).sort(), [...expected].sort(), 'il progresso delle sfide si salva');
  // fino a 10 scrigni al giorno
  for (let i = 2; i <= 10; i++) {
    await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
    await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 4, players: 4, humans: 1 }, today: day, rng: () => 0.5 });
  }
  assert.equal((await a.read(`users/${a.uid}/scrigni`)).n, 10);
  await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
  const before = await a.read(`users/${a.uid}/coins`);
  const r11 = await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 4, players: 4, humans: 1 }, today: day, rng: () => 0.5 });
  assert.equal(r11.chest, null, 'l\'undicesimo scrigno non arriva: solo le monete della partita');
  assert.equal(await a.read(`users/${a.uid}/coins`), before + 5);
  // trucchi
  await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
  await denied(update(ref(a.db, `users/${a.uid}`), { coins: before + 500, lastEarn: TS }), 'troppe monete a partita');
  await denied(remove(ref(a.db, `users/${a.uid}/scrigni`)), 'azzerare il conto degli scrigni');
  await denied(update(ref(a.db, `users/${a.uid}`), { 'scrigni/n': 1 }), 'abbassare il conto degli scrigni');
});

test('scrigno: senza il giorno registrato la partita dà comunque le sue monete', async () => {
  const a = await account();
  const c0 = await a.read(`users/${a.uid}/coins`);
  const r = await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 2, players: 4, humans: 1 }, today: '2026-10-21', rng: () => 0.5 });
  assert.equal(r.chest, null);
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + 5);
});

test('sfide: si riscuotono una volta, con bonus sull\'ultima, e le regole reggono', async () => {
  const a = await account();
  const day = '2026-10-21';
  await touchDay(a.db, a.uid, day);
  const today = challengesFor(day);
  await admin(`users/${a.uid}/sfideFatte/${day}`, Object.fromEntries(today.map((c) => [c.id, true])));
  assert.equal(await claimChallenge(a.db, a.uid, day, 's99'), 'non fatta');
  const notToday = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].find((id) => !today.some((c) => c.id === id));
  assert.equal(await claimChallenge(a.db, a.uid, day, notToday), 'non fatta', 'non è una sfida di oggi');
  const c0 = await a.read(`users/${a.uid}/coins`);
  assert.equal(await claimChallenge(a.db, a.uid, day, today[0].id), 'ok');
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + today[0].reward);
  assert.equal(await claimChallenge(a.db, a.uid, day, today[0].id), 'già');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  assert.equal(await claimChallenge(a.db, a.uid, day, today[1].id), 'ok');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  const c2 = await a.read(`users/${a.uid}/coins`);
  assert.equal(await claimChallenge(a.db, a.uid, day, today[2].id), 'ok');
  assert.equal(await a.read(`users/${a.uid}/coins`), c2 + today[2].reward + 50, 'bonus per averle fatte tutte e tre');
  await denied(remove(ref(a.db, `users/${a.uid}/lastSfida`)), 'cancellare lastSfida per riscuotere subito');
  const c3 = await a.read(`users/${a.uid}/coins`);
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: c3 + 110, [`users/${a.uid}/lastSfida`]: TS, [`claims/${a.uid}/s_${day}_s9`]: true }), 'sfida fuori dall\'elenco');
  await denied(remove(ref(a.db, `claims/${a.uid}/s_${day}_${today[0].id}`)), 'ripresa cancellando il segno');
});

test('sfide: due riscossioni a meno di 20 secondi, e più di quanto vale, sono respinte', async () => {
  const a = await account();
  const day = '2026-10-21';
  await touchDay(a.db, a.uid, day);
  const today = challengesFor(day);
  await admin(`users/${a.uid}/sfideFatte/${day}`, Object.fromEntries(today.map((c) => [c.id, true])));
  assert.equal(await claimChallenge(a.db, a.uid, day, today[0].id), 'ok');
  await assert.rejects(claimChallenge(a.db, a.uid, day, today[1].id), /permission|PERMISSION_DENIED/i, 'subito dopo');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  const c = await a.read(`users/${a.uid}/coins`);
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: c + 100, [`users/${a.uid}/lastSfida`]: TS, [`users/${a.uid}/ultimaSfida`]: `s_${day}_${today[0].id}x`, [`claims/${a.uid}/s_${day}_${today[1].id}`]: true }), 'monete oltre il valore della sfida');
});

test('bonus del giorno: usa la serie del profilo e non la cambia', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, '2026-10-20');
  await admin(`users/${a.uid}/streak`, 3);
  const d = await claimDaily(a.db, a.uid, '2026-10-21');
  assert.deepEqual(d, { amount: 40, streak: 3 });
  assert.equal(await a.read(`users/${a.uid}/streak`), 3);
});

test('account cancellato e ricreato: nessuna serie, traguardo o segno di riscossione resta', async () => {
  const a = await account();
  const day = '2026-10-21';
  await touchDay(a.db, a.uid, day);
  await admin(`users/${a.uid}/sfideFatte/${day}`, { s1: true });
  await claimChallenge(a.db, a.uid, day, challengesFor(day)[0].id).catch(() => {});
  await deleteProfile(a.db, a.uid);
  assert.equal(await adminGet(`users/${a.uid}`), null);
  assert.equal(await adminGet(`claims/${a.uid}`), null);
});

test('accessori della serie: solo con la serie raggiunta; i rari solo nella scrittura di fine partita; non si comprano', async () => {
  const a = await account();
  const u = (v) => update(ref(a.db), v);
  await denied(u({ [`users/${a.uid}/owned/cornice_scintille`]: true }), 'senza la serie a 7');
  await denied(u({ [`users/${a.uid}/owned/cappello_mago`]: true }), 'raro fuori da una partita');
  await admin(`users/${a.uid}/lastDay`, '2026-10-21');
  await admin(`users/${a.uid}/streak`, 7);
  await admin(`users/${a.uid}/migliorSerie`, 7);
  await admin(`users/${a.uid}/serieId`, '2026-10-15');
  const c = await a.read(`users/${a.uid}/coins`);
  await u({ [`users/${a.uid}/owned/cornice_scintille`]: true });
  assert.equal(await a.read(`users/${a.uid}/owned/cornice_scintille`), true);
  await denied(u({ [`users/${a.uid}/owned/mantello_notte`]: true }), 'il 30 con la serie a 7');
  await u({ [`users/${a.uid}/coins`]: c, [`users/${a.uid}/owned/cappello_mago`]: true, [`users/${a.uid}/lastEarn`]: TS });
  assert.equal(await a.read(`users/${a.uid}/owned/cappello_mago`), true);
  for (const id of ['cornice_scintille', 'mantello_notte', 'corona_fiamme', 'cappello_mago', 'occhiali_arcobaleno', 'collare_gemme']) {
    assert.equal(await buyItem(a.db, a.uid, id), 'poveri', `${id} non si compra`);
  }
});

test('scrigno con raro: quando esce, arriva nella stessa scrittura della partita', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, '2026-10-21');
  const r = await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 3, players: 4, humans: 1 }, today: '2026-10-21', rng: () => 0.99 });
  assert.equal(r.chest.kind, 'raro');
  assert.equal(await a.read(`users/${a.uid}/owned/${r.chest.item}`), true);
});
