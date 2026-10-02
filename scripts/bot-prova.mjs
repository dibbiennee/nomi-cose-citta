// Giocatori automatici per provare la partita in locale, SOLO sull'emulatore Firebase.
// Uso:  node scripts/bot-prova.mjs CODICE
// Entrano nella stanza, scrivono parole, votano e uno dei due preme STOP dopo 25 secondi.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, onValue } from 'firebase/database';
import { createEngine } from '../src/engine/room.js';

const CODE = (process.argv[2] || '').toUpperCase();
if (!/^[A-Z2-9]{4}$/.test(CODE)) { console.error('Uso: node scripts/bot-prova.mjs CODICE'); process.exit(1); }

const PAROLE = {
  nomi: ['Marta', 'Matteo', 'Sofia', 'Simone', 'Paolo', 'Pietro', 'Bianca', 'Bruno', 'Chiara', 'Carlo', 'Luca', 'Laura', 'Tommaso', 'Teresa', 'Rebecca', 'Riccardo', 'Francesca', 'Filippo', 'Giorgia', 'Gabriele', 'Anna', 'Elena', 'Davide', 'Dario', 'Nicola', 'Nora', 'Ugo', 'Vera', 'Zeno', 'Irene', 'Olga'],
  cose: ['Martello', 'Matita', 'Sedia', 'Sapone', 'Penna', 'Piatto', 'Borsa', 'Bicchiere', 'Cuscino', 'Chiave', 'Lampada', 'Libro', 'Tavolo', 'Tazza', 'Radio', 'Righello', 'Forbici', 'Frigo', 'Gomma', 'Guanto', 'Ago', 'Ombrello', 'Dado', 'Divano', 'Ventaglio', 'Uovo', 'Zaino', 'Imbuto', 'Elmo', 'Nastro'],
  citta: ['Milano', 'Modena', 'Siena', 'Savona', 'Palermo', 'Pisa', 'Bologna', 'Bari', 'Catania', 'Como', 'Livorno', 'Lecce', 'Torino', 'Trieste', 'Roma', 'Rimini', 'Firenze', 'Ferrara', 'Genova', 'Gorizia', 'Ancona', 'Asti', 'Empoli', 'Enna', 'Napoli', 'Novara', 'Udine', 'Venezia', 'Verona', 'Imola', 'Orvieto', 'Domodossola'],
  animali: ['Mucca', 'Merlo', 'Serpente', 'Scoiattolo', 'Pecora', 'Pinguino', 'Balena', 'Bue', 'Cane', 'Cavallo', 'Leone', 'Lupo', 'Tigre', 'Topo', 'Rana', 'Renna', 'Foca', 'Falco', 'Gatto', 'Giraffa', 'Aquila', 'Asino', 'Elefante', 'Delfino', 'Daino', 'Volpe', 'Orso', 'Oca', 'Zebra', 'Istrice'],
};
const parola = (cat, letter, i) => {
  const list = (PAROLE[cat.key] || PAROLE.cose).filter((w) => w[0] === letter);
  return list[i % Math.max(1, list.length)] || '';
};

async function bot(name, color, face) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-ncc', databaseURL: 'http://127.0.0.1:9000?ns=demo-ncc-default-rtdb' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const { user } = await signInAnonymously(auth);
  const engine = createEngine(db, user.uid);
  await engine.joinRoom(CODE, { name, color, face });
  console.log(`${name} è entrato`);
  return { name, uid: user.uid, engine, db };
}

const bots = [await bot('Marco', 1, 1), await bot('Giulia', 2, 5)];
const [marco, giulia] = bots;
const done = {};

onValue(ref(marco.db, `rooms/${CODE}`), async (snap) => {
  const room = snap.val();
  if (!room) { console.log('Stanza chiusa'); process.exit(0); }
  const r = room.round;
  const key = r ? `${r.n}:${r.letter}:${room.status}` : room.status;
  if (done[key]) return;
  done[key] = true;

  if (room.status === 'play') {
    const cats = room.settings.cats;
    // Scrivono una categoria alla volta, così si vede il conteggio salire.
    bots.forEach((b, bi) => cats.forEach((c, ci) => setTimeout(() => {
      const answers = {};
      cats.slice(0, ci + 1).forEach((cc, k) => { answers[cc.key] = parola(cc, r.letter, bi + k + (k === 1 ? 0 : bi)); });
      b.engine.saveAnswers(CODE, answers).catch(() => {});
    }, 2500 + ci * 2500 + bi * 1200)));
    setTimeout(() => giulia.engine.pressStop(CODE).then((ok) => ok && console.log('Giulia ha premuto STOP')).catch(() => {}), 25000);
  }

  if (room.status === 'review' && (r.reviewIdx || 0) === 0) {
    // Bocciano la prima parola dell'host (2 voti su 2 altri), e reagiscono.
    const cat = room.settings.cats[0].key;
    setTimeout(() => marco.engine.vote(CODE, cat, room.hostId, true).catch(() => {}), 2500);
    setTimeout(() => giulia.engine.vote(CODE, cat, room.hostId, true).catch(() => {}), 4000);
    setTimeout(() => marco.engine.react(CODE, 'Ahah').catch(() => {}), 3000);
    setTimeout(() => giulia.engine.react(CODE, 'Non esiste').catch(() => {}), 4500);
  }
});

process.on('SIGINT', async () => { await Promise.all(bots.map((b) => b.engine.leaveRoom(CODE).catch(() => {}))); process.exit(0); });
