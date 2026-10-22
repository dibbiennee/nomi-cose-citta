// Strumento per correggere a mano l'archivio dei verdetti del giudice. Gira solo nel tuo terminale, con la chiave
// del servizio Firebase (FIREBASE_SERVICE_ACCOUNT, il JSON intero) e REACT_APP_FIREBASE_DATABASE_URL.
//   node scripts/giudizio.mjs get <categoria> <parola>
//   node scripts/giudizio.mjs set <categoria> <parola> <valida|non_valida|incerta>
//   node scripts/giudizio.mjs togli <categoria> <parola>
//   node scripts/giudizio.mjs conta [giorno]      (contatori del giorno, default oggi)
import { cert, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { chiaveParola } from '../src/giudice/chiave.mjs';

const [, , cmd, a, b, c] = process.argv;
const USO = 'Uso: get|togli <categoria> <parola>, set <categoria> <parola> <valida|non_valida|incerta>, conta [giorno]';
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Manca FIREBASE_SERVICE_ACCOUNT nel terminale.'); process.exit(1); }
const app = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
});
const db = getDatabase(app);
const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

async function main() {
  if (cmd === 'conta') {
    const r = (await db.ref(`giudizi_meta/giorni/${a || oggi}`).get()).val();
    console.log(r || 'Nessun dato per quel giorno.');
    return;
  }
  if (!['get', 'set', 'togli'].includes(cmd) || !a || !b) { console.error(USO); process.exit(1); }
  const r = db.ref(`giudizi/${a}/${chiaveParola(b)}`);
  if (cmd === 'get') { console.log((await r.get()).val() || 'Nessun verdetto in archivio.'); return; }
  if (cmd === 'togli') { await r.remove(); console.log('Tolto.'); return; }
  if (!['valida', 'non_valida', 'incerta'].includes(c)) { console.error(USO); process.exit(1); }
  // m: 'mano' segna il verdetto come deciso da una persona: il servizio non lo rifà mai, nemmeno se cambia il prompt.
  await r.set({ v: c, m: 'mano', at: Date.now(), p: 0 });
  console.log(`Fatto: ${b} (${a}) = ${c}`);
}
main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
