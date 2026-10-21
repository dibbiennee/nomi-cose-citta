// Profilo, monete, username, inviti e lista d'attesa con le loro regole, sull'emulatore (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update } from 'firebase/database';
import { createProfile, earnGame, claimDaily, buyItem, equip, setUsername, claimInvites, joinWaitlist, leaveWaitlist, deleteProfile, gameCoins } from './profilo.js';
import { EARN } from '../shop/catalogo.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
async function phone() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9100}?ns=${PROJECT}-default-rtdb` }, `pr${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9100));
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, db, read: (p) => get(ref(db, p)).then((s) => s.val()) };
}
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Imposta il contatore degli iscritti come amministratore (solo emulatore). */
async function setIscritti(v) {
  await fetch(`http://127.0.0.1:${process.env.DBP || 9100}/meta/iscritti.json?ns=${PROJECT}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(v) });
}
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('monete di una partita: 5, +5 se vinci, +1 per parola unica fino a +10', () => {
  assert.equal(gameCoins({ won: false, unique: 0 }), 5);
  assert.equal(gameCoins({ won: true, unique: 3 }), 13);
  assert.equal(gameCoins({ won: true, unique: 40 }), 20);
});

test('benvenuto: 1000 e accessori esclusivi ai primi 100, 300 dopo; più le monete dell\'ultima partita', async () => {
  await setIscritti(98);
  const a = await phone();
  const ra = await createProfile(a.db, a.uid, { pendingCoins: 12 });
  assert.deepEqual(ra, { primi100: true, coins: 1012 });
  const pa = await a.read(`users/${a.uid}`);
  assert.equal(pa.owned.corona_oro, true);
  await setIscritti(100);
  const b = await phone();
  assert.deepEqual(await createProfile(b.db, b.uid, { pendingCoins: 50 }), { primi100: false, coins: 320 }, 'in sospeso al massimo 20');
  assert.equal((await b.read(`users/${b.uid}/owned`)), null);
  await denied(set(ref(b.db, `users/${b.uid}/primi100`), true));
  const c = await phone();
  await denied(set(ref(c.db, `users/${c.uid}`), { coins: 5000, createdAt: Date.now(), primi100: false }), 'benvenuto gonfiato');
});

test('partita finita: al massimo 20 monete, e non due volte in un minuto', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  assert.equal(await earnGame(a.db, a.uid, { won: true, unique: 2 }), 300 + 12);
  await assert.rejects(earnGame(a.db, a.uid, { won: false, unique: 0 }));
  assert.equal(await a.read(`users/${a.uid}/coins`), 312);
  await denied(update(ref(a.db, `users/${a.uid}`), { coins: 400, lastEarn: { '.sv': 'timestamp' } }), 'più di 20 alla volta');
});

test('bonus del giorno: una volta sola, anche da due telefoni dello stesso account', async () => {
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  const first = await claimDaily(a.db, a.uid, '2026-10-21');
  assert.deepEqual(first, { amount: EARN.giornaliero, streak: 1 });
  assert.equal(await claimDaily(a.db, a.uid, '2026-10-21'), null);
  await denied(update(ref(a.db, `users/${a.uid}`), { coins: 9999, lastDailyAt: { '.sv': 'timestamp' }, lastDaily: '2026-10-22', streak: 2 }));
});

test('comprare: doppio tocco con monete per uno solo, una spesa; esclusivi e indossare', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  const results = await Promise.all([buyItem(a.db, a.uid, 'cappellino'), buyItem(a.db, a.uid, 'berretto')]);
  assert.deepEqual(results.sort(), ['ok', 'poveri'], '300 monete: o 150+300 non ci stanno insieme');
  const p = await a.read(`users/${a.uid}`);
  assert.ok(p.coins >= 0);
  assert.equal(await buyItem(a.db, a.uid, Object.keys(p.owned)[0]), 'già');
  await denied(update(ref(a.db, `users/${a.uid}`), { 'owned/corona_oro': true }), 'esclusivo senza primi 100');
  await denied(update(ref(a.db, `users/${a.uid}`), { 'owned/cilindro': true }), 'senza pagare');
  await equip(a.db, a.uid, 'cappello', Object.keys(p.owned)[0]);
  await denied(set(ref(a.db, `users/${a.uid}/equipped/cappello`), 'cilindro'), 'non posseduto');
  await equip(a.db, a.uid, 'cappello', null);
  assert.equal(await a.read(`users/${a.uid}/equipped/cappello`), null);
});

test('username unico, anche con maiuscole diverse; troppo corto non valido', async () => {
  const [a, b] = await Promise.all([phone(), phone()]);
  await createProfile(a.db, a.uid, {});
  await createProfile(b.db, b.uid, {});
  const name = `Marco_${Date.now() % 100000}`;
  assert.equal(await setUsername(a.db, a.uid, name), 'ok');
  assert.equal(await setUsername(b.db, b.uid, name.toLowerCase()), 'preso');
  assert.equal(await setUsername(b.db, b.uid, 'Ugo'), 'non valido');
  assert.equal(await setUsername(b.db, b.uid, 'ciao ciao'), 'non valido');
  assert.equal(await a.read(`users/${a.uid}/username`), name);
  await denied(set(ref(b.db, `usernames/${name.toLowerCase()}`), b.uid));
});

test('invito: 200 a chi arriva e 200 a chi invita, una volta sola', async () => {
  await setIscritti(500);
  const [a, b] = await Promise.all([phone(), phone()]);
  await createProfile(a.db, a.uid, {});
  const rb = await createProfile(b.db, b.uid, { invitedBy: a.uid });
  assert.equal(rb.coins, 300 + 200);
  assert.equal(await claimInvites(a.db, a.uid), 200);
  assert.equal(await claimInvites(a.db, a.uid), 0);
  assert.equal(await a.read(`users/${a.uid}/coins`), 500);
  await denied(set(ref(b.db, `invites/${b.uid}/${a.uid}`), true), 'non si inventano inviti');
});

test('lista d\'attesa: solo con consenso, leggibile solo dal proprietario; cancellazione dell\'account', async () => {
  const [a, b] = await Promise.all([phone(), phone()]);
  await createProfile(a.db, a.uid, {});
  await denied(joinWaitlist(a.db, a.uid, { email: 'a@example.com', product: 'monete_500', consent: false }));
  await joinWaitlist(a.db, a.uid, { email: 'a@example.com', product: 'monete_500', consent: true });
  await joinWaitlist(a.db, a.uid, { email: 'a@example.com', product: 'username_corto', consent: true });
  const w = await a.read(`waitlist/${a.uid}`);
  assert.deepEqual(Object.keys(w.products).sort(), ['monete_500', 'username_corto']);
  await denied(get(ref(b.db, `waitlist/${a.uid}`)));
  await denied(get(ref(b.db, `users/${a.uid}`)), 'il profilo lo legge solo il proprietario');
  await leaveWaitlist(a.db, a.uid);
  assert.equal(await a.read(`waitlist/${a.uid}`), null);
  const name = `Lucia_${Date.now() % 100000}`;
  await setUsername(a.db, a.uid, name);
  await joinWaitlist(a.db, a.uid, { email: 'a@example.com', product: 'monete_500', consent: true });
  await deleteProfile(a.db, a.uid);
  assert.equal(await a.read(`users/${a.uid}`), null);
  assert.equal(await a.read(`usernames/${name.toLowerCase()}`), null);
  assert.equal(await a.read(`waitlist/${a.uid}`), null);
});
