// Archivio dei verdetti: lo leggono tutti i telefoni autenticati, lo scrive solo il server (npm run test:room).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ncc';
const DBP = process.env.DBP || 9100;
const apps = [];
let n = 0;
async function phone({ anonimo = true } = {}) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, databaseURL: `http://127.0.0.1:${DBP}?ns=${PROJECT}-default-rtdb` }, `ar${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${process.env.AUP || 9199}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', +DBP);
  if (anonimo) await signInAnonymously(auth);
  return { db, auth };
}
const admin = (path, v) => fetch(`http://127.0.0.1:${DBP}/${path}.json?ns=${PROJECT}-default-rtdb`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(v) });
const denied = (p, msg) => assert.rejects(p, /permission|PERMISSION_DENIED/i, msg);
after(async () => { await Promise.all(apps.map((a) => deleteApp(a).catch(() => {}))); });

test('l\'archivio dei verdetti si legge da autenticati e non si scrive dai telefoni', async () => {
  await admin('giudizi/animali/aquila', { v: 'valida', m: 'haiku', at: 1, p: 1 });
  const a = await phone();
  assert.equal((await get(ref(a.db, 'giudizi/animali/aquila'))).val().v, 'valida');
  await denied(set(ref(a.db, 'giudizi/animali/aquila'), { v: 'non_valida' }), 'cambiare un verdetto');
  await denied(set(ref(a.db, 'giudizi/animali/lupo'), { v: 'valida' }), 'inventare un verdetto');
  await denied(remove(ref(a.db, 'giudizi/animali/aquila')), 'cancellare un verdetto');
  await denied(update(ref(a.db), { 'giudizi/citta/roma': { v: 'valida' } }), 'scrivere da un percorso più alto');
  assert.equal((await get(ref(a.db, 'giudizi/animali/aquila'))).val().v, 'valida', 'il verdetto è rimasto');
});

test('l\'archivio si legge per parola, ma non si può elencare né scaricare per intero', async () => {
  await admin('giudizi/animali/aquila', { v: 'valida', m: 'haiku', at: 1, p: 1 });
  const a = await phone();
  assert.equal((await get(ref(a.db, 'giudizi/animali/aquila'))).val().v, 'valida');
  await denied(get(ref(a.db, 'giudizi')), 'scaricare tutto l\'archivio');
  await denied(get(ref(a.db, 'giudizi/animali')), 'elencare una categoria');
});

test('senza accesso l\'archivio non si legge', async () => {
  const b = await phone({ anonimo: false });
  await denied(get(ref(b.db, 'giudizi/animali/aquila')));
});

test('i contatori del giorno si leggono da tutti e non si scrivono; interruttore e limiti sono solo del server', async () => {
  await admin('giudizi_meta/giorni/2026-10-22', { parole: 12, centesimi: 0.5 });
  await admin('giudizi_meta/attivo', true);
  await admin('giudizi_meta/limiti/ABCD/1', 2);
  const a = await phone();
  assert.equal((await get(ref(a.db, 'giudizi_meta/giorni/2026-10-22'))).val().parole, 12);
  await denied(set(ref(a.db, 'giudizi_meta/giorni/2026-10-22/parole'), 0), 'azzerare i contatori');
  await denied(set(ref(a.db, 'giudizi_meta/giorni/2026-10-23'), { parole: 1 }), 'scrivere un altro giorno');
  assert.equal((await get(ref(a.db, 'giudizi_meta/attivo'))).val(), true, 'l\'interruttore si legge: i telefoni sanno se il giudice è acceso');
  await denied(set(ref(a.db, 'giudizi_meta/attivo'), false), 'spegnere il servizio');
  await denied(get(ref(a.db, 'giudizi_meta/limiti/ABCD/1')), 'leggere i limiti');
  await denied(set(ref(a.db, 'giudizi_meta/limiti/ABCD/1'), 0), 'azzerare i limiti');
});
