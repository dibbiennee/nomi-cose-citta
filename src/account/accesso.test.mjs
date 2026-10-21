// Accesso con Google ed email collegando l'identità anonima, sull'emulatore di Auth (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, GoogleAuthProvider } from 'firebase/auth';
import { linkGoogleCredential, sendEmailLink, completeEmailLink, signOutToAnonymous, isRegistered } from './accesso.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const AUP = process.env.AUP || 9199;
const apps = [];
let n = 0;
async function phone() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, authDomain: 'demo-ncc.firebaseapp.com' }, `acc${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${AUP}`, { disableWarnings: true });
  await signInAnonymously(auth);
  return auth;
}
const google = (sub, email) => GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }));
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('Google collega l\'identità anonima: stesso uid, ora registrato', async () => {
  const auth = await phone();
  const uid = auth.currentUser.uid;
  assert.equal(isRegistered(auth.currentUser), false);
  const res = await linkGoogleCredential(auth, google('g-1', 'uno@example.com'));
  assert.deepEqual(res, { uid, merged: false });
  assert.equal(isRegistered(auth.currentUser), true);
});

test('Google già usato da un altro telefono: si entra in quell\'account, senza errori', async () => {
  const first = await phone();
  const { uid } = await linkGoogleCredential(first, google('g-2', 'due@example.com'));
  const second = await phone();
  const res = await linkGoogleCredential(second, google('g-2', 'due@example.com'));
  assert.deepEqual(res, { uid, merged: true });
  assert.equal(second.currentUser.uid, uid);
});

test('link via email: collega l\'anonimo', async () => {
  const auth = await phone();
  const uid = auth.currentUser.uid;
  const email = `tre${Date.now()}@example.com`;
  await sendEmailLink(auth, email, 'http://localhost/accesso', null);
  const codes = await fetch(`http://127.0.0.1:${AUP}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  const link = codes.oobCodes.filter((c) => c.email === email).at(-1).oobLink;
  const res = await completeEmailLink(auth, link, email);
  assert.deepEqual(res, { uid, merged: false });
  assert.equal(auth.currentUser.email, email);
});

test('uscendo si torna anonimi, con un uid nuovo', async () => {
  const auth = await phone();
  const { uid } = await linkGoogleCredential(auth, google('g-4', 'quattro@example.com'));
  await signOutToAnonymous(auth);
  assert.ok(auth.currentUser.isAnonymous);
  assert.notEqual(auth.currentUser.uid, uid);
});

test('all\'apertura del gioco un account registrato resta quello: niente nuovo anonimo al suo posto', async () => {
  const { ensureSignedIn } = await import('./accesso.js');
  const auth = await phone();
  const { uid } = await linkGoogleCredential(auth, google('g-5', 'cinque@example.com'));
  const user = await ensureSignedIn(auth);
  assert.equal(user.uid, uid);
  assert.equal(isRegistered(auth.currentUser), true);
});
