// Serie di giorni, traguardi, sfide e scrigno con le loro regole, sull'emulatore (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, linkWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';
import { buyItem, createProfile, touchDay, claimMilestones, claimHomeBonus, HOME_BONUS, missingMilestones, finishGame, claimChallenge, claimDaily, deleteProfile } from './profilo.js';
import { challengesFor, completed } from '../ritorno/sfide.js';
import { toDayN } from '../ritorno/serie.js';

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
/** Una data di Roma, oggi più/meno `off` giorni. Le regole accettano solo il giorno vero di oggi, per questo i giorni passati si preparano da amministratore. */
const rome = (off = 0) => new Date(Date.now() + off * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const N = (off = 0) => toDayN(rome(off));
const TODAY = rome();
/** Prepara lo stato del profilo come amministratore (per simulare i giorni passati). */
async function setState(a, over) { await admin(`users/${a.uid}`, { ...(await adminGet(`users/${a.uid}`)), ...over }); }
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('touchDay: primo giorno serie 1, stesso giorno niente, il giorno dopo serie 2 senza attese', async () => {
  const a = await account();
  const r1 = await touchDay(a.db, a.uid, TODAY);
  assert.deepEqual([r1.streak, r1.event], [1, 'nuovo']);
  assert.equal(await touchDay(a.db, a.uid, TODAY), null, 'stesso giorno');
  await setState(a, { lastDay: N(-1) }); // come se l'ultima apertura fosse di ieri: nessun blocco di ore
  const r2 = await touchDay(a.db, a.uid, TODAY);
  assert.equal(r2.streak, 2);
  const p = await a.read(`users/${a.uid}`);
  assert.deepEqual([p.lastDay, p.streak, p.migliorSerie, p.serieId], [N(), 2, 2, N()]);
});

test('touchDay: chi ha ancora solo lastDaily e streak continua la serie, senza perderla', async () => {
  const a = await account();
  await setState(a, { lastDaily: rome(-1), streak: 5 });
  const r = await touchDay(a.db, a.uid, TODAY);
  assert.equal(r.streak, 6);
  assert.equal(await a.read(`users/${a.uid}/migliorSerie`), 6);
});

test('touchDay: un giorno saltato con lo scudo libero la serie continua; scudo già usato riparte', async () => {
  const a = await account();
  await setState(a, { lastDay: N(-2), streak: 5, migliorSerie: 5, serieId: N(-6) });
  const r = await touchDay(a.db, a.uid, TODAY);
  assert.equal(r.event, 'scudo');
  assert.equal(r.streak, 6);
  assert.equal(await a.read(`users/${a.uid}/scudo`), TODAY.slice(0, 7));
  await setState(a, { lastDay: N(-2) });
  const r2 = await touchDay(a.db, a.uid, TODAY);
  assert.deepEqual([r2.event, r2.streak], ['riparte', 1]);
  assert.equal(await a.read(`users/${a.uid}/migliorSerie`), 6, 'il record resta');
  assert.equal(await a.read(`users/${a.uid}/serieId`), N(), 'serie nuova');
});

test('serie: la serie sale solo con un giorno vero nuovo (niente rubinetto di traguardi)', async () => {
  const a = await account(3);
  await touchDay(a.db, a.uid, TODAY);
  const u = (v) => update(ref(a.db, `users/${a.uid}`), v);
  await denied(u({ streak: 2 }), 'più uno senza un giorno nuovo');
  await denied(u({ migliorSerie: 2 }), 'record più uno senza un giorno nuovo');
  await denied(u({ serieId: N() - 5, streak: 1 }), 'serie nuova inventata');
  await denied(u({ lastDay: N() + 1, streak: 2 }), 'giorno di domani');
  await denied(u({ lastDay: N() + 400, streak: 2 }), 'giorno nel futuro');
  await denied(u({ streak: 50 }), 'oltre l\'età dell\'account');
  await denied(u({ migliorSerie: 90 }), 'record oltre l\'età dell\'account');
  for (const f of ['lastDay', 'migliorSerie', 'serieId']) await denied(remove(ref(a.db, `users/${a.uid}/${f}`)), `cancellare ${f}`);
  // la sequenza usata per "stampare" monete: serie nuove inventate e traguardo 3 riscosso ogni volta
  const b = await account(120);
  await denied(update(ref(b.db, `users/${b.uid}`), { streak: 1, serieId: N() - 9 }), 'serie senza giorno nuovo, account vecchio');
  await denied(update(ref(b.db, `users/${b.uid}`), { lastDay: N(-1), streak: 1, serieId: N(-1) }), 'un giorno passato non è oggi');
});

test('traguardi: monete una volta per serie, il traguardo perso si recupera', async () => {
  const a = await account();
  await setState(a, { lastDay: N(-1), streak: 2, migliorSerie: 2, serieId: N(-3) });
  const t = await touchDay(a.db, a.uid, TODAY);
  assert.deepEqual(t.reached, [3]);
  const coins0 = await a.read(`users/${a.uid}/coins`);
  assert.deepEqual(await claimMilestones(a.db, a.uid, t.reached), { coins: 50, items: [] });
  assert.equal(await a.read(`users/${a.uid}/coins`), coins0 + 50);
  assert.deepEqual(await claimMilestones(a.db, a.uid, [3]), { coins: 0, items: [] }, 'già presa in questa serie');
  const sid = N(-3);
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: coins0 + 600, [`claims/${a.uid}/m_${sid}_14`]: true }), 'traguardo 14 con la serie a 3');
  await denied(remove(ref(a.db, `claims/${a.uid}/m_${sid}_3`)), 'ripresa cancellando il segno');
  await denied(set(ref(a.db, `claims/${a.uid}/m_${sid}_3`), true), 'riscritto sopra');
  await setState(a, { lastDay: N(-1), streak: 13, migliorSerie: 13 });
  const t14 = await touchDay(a.db, a.uid, TODAY);
  assert.deepEqual(t14.reached, [14]);
  const c1 = await a.read(`users/${a.uid}/coins`);
  assert.deepEqual(await claimMilestones(a.db, a.uid, t14.reached), { coins: 300, items: [] });
  assert.equal(await a.read(`users/${a.uid}/coins`), c1 + 300);
  // un traguardo mancato per la rete si recupera alla prossima apertura (serie 14, il 7 non è mai stato preso)
  assert.deepEqual(await missingMilestones(a.db, a.uid), [7], 'il 3 e il 14 ci sono, il 7 no');
  assert.deepEqual((await claimMilestones(a.db, a.uid, [7])).items, ['cornice_scintille']);
  assert.deepEqual(await missingMilestones(a.db, a.uid), []);
});

test('scrigno: partita e scrigno in una scrittura, tetti di monete e di scrigni al giorno', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, TODAY);
  const c0 = await a.read(`users/${a.uid}/coins`);
  const g = { won: true, unique: 2, mode: 'online', rank: 1, players: 3, humans: 3 };
  const r = await finishGame(a.db, a.uid, { result: g, today: TODAY, rng: () => 0.5 });
  assert.equal(r.chest.kind, 'monete');
  assert.ok(r.chest.coins >= 5 && r.chest.coins <= 40);
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + 12 + r.chest.coins);
  assert.equal((await a.read(`users/${a.uid}/scrigni`)).n, 1);
  const expected = completed(TODAY, g);
  assert.deepEqual([...r.done].sort(), [...expected].sort());
  const prog = await a.read(`users/${a.uid}/sfideFatte/d${N()}`);
  assert.deepEqual(Object.keys(prog || {}).sort(), [...expected].sort(), 'il progresso delle sfide si salva');
  const solo = { won: false, unique: 0, mode: 'solo', rank: 4, players: 4, humans: 1 };
  for (let i = 2; i <= 10; i++) {
    await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
    await finishGame(a.db, a.uid, { result: solo, today: TODAY, rng: () => 0.5 });
  }
  assert.equal((await a.read(`users/${a.uid}/scrigni`)).n, 10);
  await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
  const before = await a.read(`users/${a.uid}/coins`);
  const r11 = await finishGame(a.db, a.uid, { result: solo, today: TODAY, rng: () => 0.5 });
  assert.equal(r11.chest, null, 'l\'undicesimo scrigno non arriva: solo le monete della partita');
  assert.equal(await a.read(`users/${a.uid}/coins`), before + 5);
  await admin(`users/${a.uid}/lastEarn`, Date.now() - 2 * 60 * 1000);
  await denied(update(ref(a.db, `users/${a.uid}`), { coins: before + 500, lastEarn: TS }), 'troppe monete a partita');
  await denied(remove(ref(a.db, `users/${a.uid}/scrigni`)), 'azzerare il conto degli scrigni');
  await denied(update(ref(a.db, `users/${a.uid}`), { 'scrigni/n': 1 }), 'abbassare il conto degli scrigni');
});

test('scrigno: senza il giorno registrato la partita dà comunque le sue monete', async () => {
  const a = await account();
  const c0 = await a.read(`users/${a.uid}/coins`);
  const r = await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 2, players: 4, humans: 1 }, today: TODAY, rng: () => 0.5 });
  assert.equal(r.chest, null);
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + 5);
});

test('sfide: si riscuotono una volta, con bonus sull\'ultima, e solo le tre di oggi', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, TODAY);
  const today = challengesFor(TODAY);
  const notToday = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].filter((id) => !today.some((c) => c.id === id));
  await admin(`users/${a.uid}/sfideFatte/d${N()}`, Object.fromEntries(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => [id, true])));
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, 's99'), 'non fatta');
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, notToday[0]), 'non fatta', 'non è una sfida di oggi');
  const c = await a.read(`users/${a.uid}/coins`);
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: c + 65, [`users/${a.uid}/lastSfida`]: TS, [`users/${a.uid}/ultimaSfida`]: `s_${N()}_${notToday[0]}`, [`claims/${a.uid}/s_${N()}_${notToday[0]}`]: true }), 'una sfida che oggi non c\'è');
  const c0 = await a.read(`users/${a.uid}/coins`);
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, today[0].id), 'ok');
  assert.equal(await a.read(`users/${a.uid}/coins`), c0 + today[0].reward);
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, today[0].id), 'già');
  await denied(remove(ref(a.db, `users/${a.uid}/lastSfida`)), 'cancellare lastSfida per riscuotere subito');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, today[1].id), 'ok');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  const c2 = await a.read(`users/${a.uid}/coins`);
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, today[2].id), 'ok');
  assert.equal(await a.read(`users/${a.uid}/coins`), c2 + today[2].reward + 50, 'bonus per averle fatte tutte e tre');
  await denied(remove(ref(a.db, `claims/${a.uid}/s_${N()}_${today[0].id}`)), 'ripresa cancellando il segno');
});

test('sfide: due riscossioni a meno di 20 secondi, e più di quanto vale, sono respinte', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, TODAY);
  const today = challengesFor(TODAY);
  await admin(`users/${a.uid}/sfideFatte/d${N()}`, Object.fromEntries(today.map((c) => [c.id, true])));
  assert.equal(await claimChallenge(a.db, a.uid, TODAY, today[0].id), 'ok');
  await assert.rejects(claimChallenge(a.db, a.uid, TODAY, today[1].id), /permission|PERMISSION_DENIED/i, 'subito dopo');
  await admin(`users/${a.uid}/lastSfida`, Date.now() - 60 * 1000);
  const c = await a.read(`users/${a.uid}/coins`);
  await denied(update(ref(a.db), { [`users/${a.uid}/coins`]: c + 100, [`users/${a.uid}/lastSfida`]: TS, [`users/${a.uid}/ultimaSfida`]: `s_${N()}_${today[1].id}`, [`claims/${a.uid}/s_${N()}_${today[1].id}`]: true }), 'monete oltre il valore della sfida');
});

test('bonus del giorno: usa la serie del profilo e non la cambia', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, TODAY);
  await admin(`users/${a.uid}/streak`, 3);
  const d = await claimDaily(a.db, a.uid, TODAY);
  assert.deepEqual(d, { amount: 40, streak: 3 });
  assert.equal(await a.read(`users/${a.uid}/streak`), 3);
});

test('account cancellato: nessuna serie, traguardo o segno di riscossione resta', async () => {
  const a = await account();
  await touchDay(a.db, a.uid, TODAY);
  await admin(`users/${a.uid}/sfideFatte/d${N()}`, { [challengesFor(TODAY)[0].id]: true });
  await claimChallenge(a.db, a.uid, TODAY, challengesFor(TODAY)[0].id);
  assert.ok(await adminGet(`claims/${a.uid}`));
  await deleteProfile(a.db, a.uid);
  assert.equal(await adminGet(`users/${a.uid}`), null);
  assert.equal(await adminGet(`claims/${a.uid}`), null);
});

test('accessori della serie: solo con la serie raggiunta; i rari solo nella scrittura di fine partita; non si comprano', async () => {
  const a = await account();
  const u = (v) => update(ref(a.db), v);
  await denied(u({ [`users/${a.uid}/owned/cornice_scintille`]: true }), 'senza la serie a 7');
  await denied(u({ [`users/${a.uid}/owned/cappello_mago`]: true }), 'raro fuori da una partita');
  await setState(a, { lastDay: N(), streak: 7, migliorSerie: 7, serieId: N(-6) });
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
  await touchDay(a.db, a.uid, TODAY);
  const r = await finishGame(a.db, a.uid, { result: { won: false, unique: 0, mode: 'solo', rank: 3, players: 4, humans: 1 }, today: TODAY, rng: () => 0.99 });
  assert.equal(r.chest.kind, 'raro');
  assert.equal(await a.read(`users/${a.uid}/owned/${r.chest.item}`), true);
});

test('bonus "gioco sulla Home": 100 monete una volta per account, e solo con il segno h_home', async () => {
  const a = await account();
  const coins0 = await a.read(`users/${a.uid}/coins`);
  assert.equal(HOME_BONUS, 100);
  assert.equal(await claimHomeBonus(a.db, a.uid), 100);
  assert.equal(await a.read(`users/${a.uid}/coins`), coins0 + 100);
  assert.equal(await a.read(`claims/${a.uid}/h_home`), true);
  assert.equal(await claimHomeBonus(a.db, a.uid), 0, 'una volta sola');
  assert.equal(await a.read(`users/${a.uid}/coins`), coins0 + 100, 'saldo invariato');
  const b = await account();
  const b0 = await b.read(`users/${b.uid}/coins`);
  await denied(update(ref(b.db), { [`users/${b.uid}/coins`]: b0 + 100 }), 'monete senza il segno');
  await denied(update(ref(b.db), { [`users/${b.uid}/coins`]: b0 + 1000, [`claims/${b.uid}/h_home`]: true }), 'più di 100');
  await denied(update(ref(b.db), { [`claims/${b.uid}/h_inventato`]: true }), 'segni inventati');
  await denied(remove(ref(a.db, `claims/${a.uid}/h_home`)), 'ripresa cancellando il segno');
  assert.equal(await claimHomeBonus(b.db, b.uid), 100, 'il bonus regolare funziona');
});
