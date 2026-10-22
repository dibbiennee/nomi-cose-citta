// Aiuto di scripts/prova-giudice-voto.py: quattro telefoni "robot" (Anna host, Bea, Dani, Elia) giocano via motore sull'emulatore.
// Comandi da stdin, risposte JSON su stdout: "crea" -> { code }; "via" -> { L, protette: [3 parole], falsa }
// (parte la partita: Anna, Bea e Dani scrivono tre animali veri diversi, Elia una parola finta; STOP).
import readline from 'node:readline';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import { createEngine, SPIN_MS, COUNTDOWN_MS } from '../src/engine/room.js';
import { LISTE } from '../src/giudice/liste/index.js';
import { normalize } from '../src/engine/rules.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function phone(i, name) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-ncc', databaseURL: 'http://127.0.0.1:9100?ns=demo-ncc-default-rtdb' }, `st${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9100);
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, db, engine: createEngine(db, user.uid), profile: { name, color: i, face: i } };
}
const out = (o) => console.log(JSON.stringify(o));
let a, b, d, e, code;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const cmd = line.trim();
  if (cmd === 'crea') {
    [a, b, d, e] = await Promise.all([phone(1, 'Anna'), phone(2, 'Bea'), phone(3, 'Dani'), phone(4, 'Elia')]);
    code = await a.engine.createRoom(a.profile, { cats: [{ key: 'animali', label: 'Animali' }, { key: 'nomi', label: 'Nomi' }], rounds: 1, maxPlayers: 8, timer: 60, hard: true });
    await Promise.all([b, d, e].map((x) => x.engine.joinRoom(code, x.profile)));
    out({ code });
  } else if (cmd === 'via') {
    await a.engine.startGame(code);
    const room = async () => (await get(ref(a.db, `rooms/${code}`))).val();
    const L = (await room()).round.letter;
    const protette = LISTE.animali.filter((w) => normalize(w).startsWith(normalize(L)) && !/\s/.test(w)).slice(0, 3);
    const falsa = `${L}zzzx`;
    await sleep(SPIN_MS + COUNTDOWN_MS + 200);
    for (let i = 0; i < 40 && (await room()).status !== 'play'; i++) { await b.engine.goPlay(code).catch(() => {}); await sleep(150); }
    await a.engine.saveAnswers(code, { animali: protette[0], nomi: '' });
    await b.engine.saveAnswers(code, { animali: protette[1], nomi: '' });
    await d.engine.saveAnswers(code, { animali: protette[2], nomi: '' });
    await e.engine.saveAnswers(code, { animali: falsa, nomi: '' });
    await a.engine.pressStop(code, { animali: protette[0], nomi: '' });
    out({ L, protette, falsa });
  } else if (cmd === 'voti') {
    out({ voti: (await get(ref(a.db, `rooms/${code}/votes`))).val() });
  } else if (cmd === 'fine') { out({ ok: true }); process.exit(0); }
}
