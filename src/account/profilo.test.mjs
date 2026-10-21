// Profilo, monete, username, inviti e lista d'attesa con le loro regole, sull'emulatore (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, linkWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';
import { createProfile, earnGame, claimDaily, buyItem, equip, setUsername, claimInvites, joinWaitlist, leaveWaitlist, isOnWaitlist, deleteProfile, earnCoins, gameCoins } from './profilo.js';
import { EARN } from '../shop/catalogo.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const apps = [];
let n = 0;
/** Telefono con l'account (Google, come dopo l'accesso); { anonimo: true } per chi gioca senza account. */
async function phone({ anonimo = false } = {}) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${process.env.DBP || 9100}?ns=${PROJECT}-default-rtdb` }, `pr${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +(process.env.DBP || 9100));
  const { user } = await signInAnonymously(auth);
  if (!anonimo) {
    const sub = `g-${n}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await linkWithCredential(user, GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true })));
    await user.getIdToken(true);
  }
  return { uid: user.uid, db, read: (p) => get(ref(db, p)).then((s) => s.val()) };
}
const denied = (p) => assert.rejects(p, /permission|PERMISSION_DENIED/i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Legge un percorso come amministratore (solo emulatore). */
const adminRead = (path) => fetch(`http://127.0.0.1:${process.env.DBP || 9100}/${path}.json?ns=${PROJECT}-default-rtdb`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
/** Scrive un percorso come amministratore (solo emulatore). */
const adminSet = (path, v) => fetch(`http://127.0.0.1:${process.env.DBP || 9100}/${path}.json?ns=${PROJECT}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(v) });
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

// Difetti trovati nella revisione finale: ogni prova qui sotto, prima della correzione, passava dalle regole.

test('cancellare i campi di controllo non riapre le monete', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  await earnGame(a.db, a.uid, { won: false, unique: 0 });
  await claimDaily(a.db, a.uid, '2026-10-21');
  await denied(remove(ref(a.db, `users/${a.uid}/lastEarn`)), 'via lastEarn, poi +20 senza aspettare');
  await denied(remove(ref(a.db, `users/${a.uid}/lastDailyAt`)), 'via lastDailyAt, poi +70');
  await denied(remove(ref(a.db, `users/${a.uid}/invitesClaimed`)), 'via il conto degli inviti');
});

test('un invito si riscuote una volta sola, anche riscrivendo il profilo', async () => {
  await setIscritti(500);
  const [a, b] = await Promise.all([phone(), phone()]);
  await createProfile(a.db, a.uid, {});
  await createProfile(b.db, b.uid, { invitedBy: a.uid });
  assert.equal(await claimInvites(a.db, a.uid), 200);
  assert.equal(await a.read(`invites/${a.uid}/${b.uid}`), 'preso');
  const p = await a.read(`users/${a.uid}`);
  await denied(update(ref(a.db, `users/${a.uid}`), { coins: p.coins + 200, invitesClaimed: p.invitesClaimed + 1, lastInvite: b.uid }), 'stesso amico di nuovo');
  await denied(set(ref(a.db, `invites/${a.uid}/${b.uid}`), true), 'l\'invito non torna da riscuotere');
});

test('profilo cancellato: non si ricrea con un altro benvenuto', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  await deleteProfile(a.db, a.uid);
  await assert.rejects(createProfile(a.db, a.uid, {}));
  assert.equal(await a.read(`users/${a.uid}`), null);
});

test('contatore dei primi 100: niente account senza contarsi, e gli anonimi non lo toccano', async () => {
  await setIscritti(50);
  const anon = await phone({ anonimo: true });
  await denied(set(ref(anon.db, 'meta/iscritti'), 51), 'anonimo che brucia i posti');
  await assert.rejects(createProfile(anon.db, anon.uid, {}), 'il profilo serve a chi ha l\'account');
  const a = await phone();
  await denied(set(ref(a.db, 'meta/iscritti'), 51), '+1 senza creare il proprio profilo');
  await denied(set(ref(a.db, `users/${a.uid}`), { coins: 1000, createdAt: { '.sv': 'timestamp' }, primi100: true }), 'primi 100 senza contarsi');
  assert.equal(await a.read('meta/iscritti'), 50);
  assert.deepEqual(await createProfile(a.db, a.uid, {}), { primi100: true, coins: 1000 });
  assert.equal(await a.read('meta/iscritti'), 51);
});

test('invito da un codice che non è un account: niente 200 monete', async () => {
  await setIscritti(500);
  const a = await phone();
  assert.equal((await createProfile(a.db, a.uid, { invitedBy: 'NessunoQuiDentro123' })).coins, 300);
  const b = await phone();
  await denied(update(ref(b.db), {
    'meta/iscritti': 502, [`iscritti/${b.uid}`]: 502,
    [`users/${b.uid}`]: { coins: 500, createdAt: { '.sv': 'timestamp' }, primi100: false, invitesClaimed: 0, invitedBy: 'NessunoQuiDentro123' },
  }));
});

test('username: niente prenotazioni a raffica, e cambiandolo il vecchio si libera', async () => {
  await setIscritti(500);
  const anon = await phone({ anonimo: true });
  const t = Date.now() % 100000;
  await denied(set(ref(anon.db, `usernames/anon_${t}`), anon.uid), 'anonimo');
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  await denied(set(ref(a.db, `usernames/extra_${t}`), a.uid), 'nome non legato al profilo');
  assert.equal(await setUsername(a.db, a.uid, `Primo_${t}`), 'ok');
  assert.equal(await setUsername(a.db, a.uid, `Secondo_${t}`), 'ok');
  assert.equal(await a.read(`usernames/primo_${t}`), null);
  assert.equal(await a.read(`usernames/secondo_${t}`), a.uid);
  assert.equal(await setUsername(a.db, a.uid, `SECONDO_${t}`), 'ok', 'cambiare solo le maiuscole');
  assert.equal(await a.read(`users/${a.uid}/username`), `SECONDO_${t}`);
});

// Minori della revisione

test('monete da accreditare (ultima partita, o partita offline): al massimo 20 e non due volte in un minuto', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  assert.equal(await earnCoins(a.db, a.uid, 12), 312);
  await assert.rejects(earnCoins(a.db, a.uid, 12));
  assert.equal(await a.read(`users/${a.uid}/coins`), 312);
});

test('cancellando l\'account spariscono anche gli inviti dove compare', async () => {
  await setIscritti(500);
  const [a, b] = await Promise.all([phone(), phone()]);
  await createProfile(a.db, a.uid, {});
  await createProfile(b.db, b.uid, { invitedBy: a.uid });
  assert.equal(await a.read(`invites/${a.uid}/${b.uid}`), true);
  await deleteProfile(b.db, b.uid);
  assert.equal(await a.read(`invites/${a.uid}/${b.uid}`), null, 'chi è stato invitato cancella il proprio invito');
  const c = await phone();
  await createProfile(c.db, c.uid, { invitedBy: a.uid });
  await deleteProfile(a.db, a.uid);
  assert.equal(await adminRead(`invites/${a.uid}`), null, 'chi invita cancella i propri inviti');
  const d = await phone();
  await denied(set(ref(d.db, `invites/${a.uid}/${c.uid}`), null), 'un estraneo non cancella gli inviti degli altri');
});

test('lista d\'attesa: si legge se ci sono, e si esce', async () => {
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  assert.equal(await isOnWaitlist(a.db, a.uid), false);
  await joinWaitlist(a.db, a.uid, { email: 'a@example.com', product: 'monete_500', consent: true });
  assert.equal(await isOnWaitlist(a.db, a.uid), true);
  await leaveWaitlist(a.db, a.uid);
  assert.equal(await isOnWaitlist(a.db, a.uid), false);
});

test('bonus del giorno: anche cambiando la data del telefono, non prima di 20 ore dall\'ultimo', async () => {
  await setIscritti(500);
  const a = await phone();
  await createProfile(a.db, a.uid, {});
  await claimDaily(a.db, a.uid, '2026-10-20');
  await adminSet(`users/${a.uid}/streak`, 2);
  await adminSet(`users/${a.uid}/lastDailyAt`, Date.now() - 5 * 3600 * 1000);
  assert.equal(await claimDaily(a.db, a.uid, '2026-10-21'), null, 'cinque ore dopo: troppo presto');
  await adminSet(`users/${a.uid}/lastDailyAt`, Date.now() - 21 * 3600 * 1000);
  assert.deepEqual(await claimDaily(a.db, a.uid, '2026-10-21'), { amount: 30, streak: 2 }, 'ventuno ore dopo: va bene, e la serie continua');
});
