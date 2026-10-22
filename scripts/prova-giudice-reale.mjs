// Prova REALE del giudice in produzione: tre telefoni anonimi giocano un round, l'host chiede i verdetti a /api/giudica
// (modelli veri, costo di pochi centesimi di centesimo) e si leggono gli esiti. Serve giudizi_meta/attivo = true.
//   node scripts/prova-giudice-reale.mjs [https://nomicosecitta.pro]
// Usa solo la configurazione pubblica del client (.env.production). Lascia nel database una stanza di prova.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get } from 'firebase/database';
import { createEngine, SPIN_MS, COUNTDOWN_MS } from '../src/engine/room.js';
import { LISTE } from '../src/giudice/liste/index.js';
import { normalize } from '../src/engine/rules.js';
import { chiaveParola } from '../src/giudice/chiave.mjs';

globalThis.NCC_TEST = true; // la prova non conta nelle statistiche
const SITO = process.argv[2] || 'https://nomicosecitta.pro';
const env = Object.fromEntries(readFileSync(new URL('../.env.production', import.meta.url), 'utf8').split('\n').filter((r) => r.includes('=')).map((r) => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1).replace(/^"|"$/g, '')]));
const config = { apiKey: env.REACT_APP_FIREBASE_API_KEY, authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN, databaseURL: env.REACT_APP_FIREBASE_DATABASE_URL, projectId: env.REACT_APP_FIREBASE_PROJECT_ID, appId: env.REACT_APP_FIREBASE_APP_ID };
const RARE = { A: ['Axolotl', 'Anoplo'], B: ['Bongo', 'Basilisco'], C: ['Caracal', 'Cobo'], D: ['Dugongo', 'Dingo'], E: ['Echidna', 'Eurasiatico'], F: ['Fossa', 'Fennec'],
  G: ['Gerenuk', 'Gnu'], I: ['Indri', 'Iguanodonte'], L: ['Lemming', 'Lori'], M: ['Margay', 'Mangusta'], N: ['Numbat', 'Nandu'], O: ['Okapi', 'Orice'],
  P: ['Pangolino', 'Pudu'], R: ['Rinopiteco', 'Ratel'], S: ['Suricato', 'Saiga'], T: ['Tarsio', 'Tapiro'], U: ['Uacari', 'Urubu'], V: ['Vombato', 'Vicuna'], Z: ['Zibetto', 'Zorilla'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function phone(name) {
  const app = initializeApp(config, `reale${n++}`);
  const auth = getAuth(app);
  const { user } = await signInAnonymously(auth);
  const db = getDatabase(app);
  return { name, user, db, engine: createEngine(db, user.uid), profile: { name, color: n % 6, face: n % 6 } };
}

const [a, b, c] = await Promise.all([phone('Prova1'), phone('Prova2'), phone('Prova3')]);
const code = await a.engine.createRoom(a.profile, { cats: [{ key: 'animali', label: 'Animali' }, { key: 'nomi', label: 'Nomi' }], rounds: 1, maxPlayers: 8, timer: 60, hard: true });
await Promise.all([b, c].map((x) => x.engine.joinRoom(code, x.profile)));
await a.engine.startGame(code);
const room = async () => (await get(ref(a.db, `rooms/${code}`))).val();
const L = (await room()).round.letter;
const fuoriDizionario = (w) => !LISTE.animali.some((x) => normalize(x) === normalize(w));
const vera = (RARE[L] || []).find(fuoriDizionario);
if (!vera) { console.log(`Lettera ${L}: nessuna parola rara pronta, rilancia la prova.`); process.exit(2); }
const falsa = `${L}razzulo`;
console.log('lettera', L, '| vera (fuori dizionario):', vera, '| falsa:', falsa);
await sleep(SPIN_MS + COUNTDOWN_MS + 200);
for (let i = 0; i < 40 && (await room()).status !== 'play'; i++) { await b.engine.goPlay(code).catch(() => {}); await sleep(150); }
await a.engine.saveAnswers(code, { animali: vera, nomi: '' });
await b.engine.saveAnswers(code, { animali: falsa, nomi: '' });
await c.engine.saveAnswers(code, { animali: '', nomi: '' });
await a.engine.pressStop(code, { animali: vera, nomi: '' });
await sleep(3500);
const t0 = Date.now();
const res = await fetch(`${SITO}/api/giudica`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await a.user.getIdToken()}` },
  body: JSON.stringify({ codice: code, round: 1, parole: [{ cat: 'animali', testo: vera }, { cat: 'animali', testo: falsa }] }) });
console.log('risposta', res.status, JSON.stringify(await res.json()), `${Date.now() - t0} ms`);
for (const w of [vera, falsa]) console.log(w, '=>', JSON.stringify((await get(ref(a.db, `giudizi/animali/${chiaveParola(w)}`))).val()));
const giorno = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
console.log('contatori di oggi', JSON.stringify((await get(ref(a.db, `giudizi_meta/giorni/${giorno}`))).val()));
process.exit(0);
