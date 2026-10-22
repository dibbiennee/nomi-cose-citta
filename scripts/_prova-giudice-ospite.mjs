// Aiuto di scripts/prova-giudice-ia.py: tre telefoni "robot" (Bea, Dani, Elia) entrano nella stanza creata dal browser
// e giocano via motore sull'emulatore. Comandi da stdin, risposte JSON su stdout:
//   "unisciti CODICE" -> { ok }
//   "gioca"           -> { L, vera, nuova, falsa } (aspetta la partita, scrivono: Bea una città vera del dizionario, Dani una
//                        parola che il dizionario non ha, Elia un'altra; poi STOP di Bea)
import readline from 'node:readline';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import { createEngine } from '../src/engine/room.js';
import { LISTE } from '../src/giudice/liste/index.js';
import { normalize } from '../src/engine/rules.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function phone(i, name) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-ncc', databaseURL: 'http://127.0.0.1:9100?ns=demo-ncc-default-rtdb' }, `os${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9100);
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, db, engine: createEngine(db, user.uid), profile: { name, color: i % 6, face: i % 6 } };
}
const out = (o) => console.log(JSON.stringify(o));
const paso = async (nome, p) => { try { return await p; } catch (e) { console.error(`passo "${nome}" fallito: ${e.message}`); throw e; } };
let bea, dani, elia, code;
let robot = [];
for await (const line of readline.createInterface({ input: process.stdin })) {
  const [cmd, arg] = line.trim().split(' ');
  if (cmd === 'unisciti') {
    code = arg;
    [bea, dani, elia] = await Promise.all([phone(11, 'Bea'), phone(12, 'Dani'), phone(13, 'Elia')]);
    for (const x of [bea, dani, elia]) await paso(`entra ${x.profile.name}`, x.engine.joinRoom(code, x.profile));
    out({ ok: true });
  } else if (cmd === 'folla') {
    // "folla CODICE N": N telefoni robot entrano nella stanza (per misurare le schermate con tante persone)
    code = arg;
    const NOMI = ['Bea', 'Dani', 'Elia', 'Fabio', 'Gaia', 'Ivan', 'Lia', 'Marco', 'Nora'];
    const quanti = Number(line.trim().split(' ')[2] || 3);
    robot = await Promise.all(Array.from({ length: quanti }, (_, k) => phone(21 + k, NOMI[k % NOMI.length])));
    for (const x of robot) await paso(`entra ${x.profile.name}`, x.engine.joinRoom(code, x.profile));
    out({ ok: true, robot: robot.length });
  } else if (cmd === 'folla-gioca') {
    // tutti i robot scrivono una parola vera per ogni categoria (qualcuno uguale a un altro) e uno preme STOP
    const room = async () => (await get(ref(robot[0].db, `rooms/${code}`))).val();
    for (let i = 0; i < 120 && (await room()).status !== 'play'; i++) { await robot[0].engine.goPlay(code).catch(() => {}); await sleep(250); }
    const stato = await room();
    const L = stato.round.letter;
    const per = (cat) => (LISTE[cat] || []).filter((w) => normalize(w).startsWith(normalize(L)) && w.length <= 20);
    const parola = (cat, k) => { const l = per(cat); return l.length ? l[(k % 2 ? k - 1 : k) % l.length] : `${L}aaa`; };
    for (const [k, x] of robot.entries()) {
      const risposte = Object.fromEntries(stato.settings.cats.map((c) => [c.key, parola(c.key, k)]));
      await paso(`risposte ${x.profile.name}`, x.engine.saveAnswers(code, risposte));
    }
    const prima = Object.fromEntries(stato.settings.cats.map((c) => [c.key, parola(c.key, 0)]));
    await paso('STOP', robot[0].engine.pressStop(code, prima));
    out({ L });
  } else if (cmd === 'gioca') {
    const room = async () => (await get(ref(bea.db, `rooms/${code}`))).val();
    for (let i = 0; i < 120 && (await room()).status !== 'play'; i++) { await bea.engine.goPlay(code).catch(() => {}); await sleep(250); }
    const stato = await room();
    const L = stato.round.letter;
    const vera = LISTE.citta.find((w) => normalize(w).startsWith(normalize(L)) && !/\s/.test(w));
    const nuova = `${L}oxqa`;
    const falsa = `${L}zzzx`;
    await paso('risposte Bea', bea.engine.saveAnswers(code, { nomi: '', cose: '', citta: vera }));
    await paso('risposte Dani', dani.engine.saveAnswers(code, { nomi: '', cose: '', citta: nuova }));
    await paso('risposte Elia', elia.engine.saveAnswers(code, { nomi: '', cose: '', citta: falsa }));
    await paso('STOP', bea.engine.pressStop(code, { nomi: '', cose: '', citta: vera }));
    out({ L, vera, nuova, falsa });
  } else if (cmd === 'fine') { out({ ok: true }); process.exit(0); }
}
