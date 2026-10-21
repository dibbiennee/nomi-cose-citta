// Robot nelle partite veloci online. Ogni telefono della stanza calcola gli stessi piani: la casualità si ricava
// da codice stanza, round e robot, non da Math.random. Così se l'host esce un altro telefono continua uguale.
// Funzioni pure: le scritture su Firebase le fa room.js (driveBots).
import { planBot, botVote, LEVELS, BOT_NAMES } from '../solo/robot.js';
import { normalize, startsWithLetter } from './rules.js';

/** Medio della partita da soli, ma con pochi dubbi: tra sconosciuti una parola giusta bocciata irrita di più. */
export const QUICK_LEVEL = { ...LEVELS.medio, doubtRate: 0.1 };

/** Sequenza casuale ripetibile a partire da un elenco di parti (hash cyrb53, poi mulberry32). */
export function seededRandom(...parts) {
  const str = parts.join('|');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  let a = h1 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const botIds = (room) => Object.keys(room.players || {}).filter((id) => room.players[id].bot);
const catKeys = (room) => room.settings.cats.map((c) => c.key);

/** Cosa scrive un robot in questo round e quando: uguale su ogni telefono. */
export function planFor(room, code, botId, dict) {
  const { n, letter, startsAt } = room.round;
  const quirk = (seededRandom(code, botId, 'carattere')() - 0.5) * 0.2; // ogni robot un po' diverso, sempre lo stesso
  return planBot({ ...room.players[botId], quirk }, catKeys(room), letter, QUICK_LEVEL, dict, seededRandom(code, n, letter, botId), startsAt);
}

/** Le risposte che il robot ha già "scritto" adesso; dopo lo STOP, solo quelle scritte prima. */
export function dueAnswers(room, code, botId, dict, now) {
  const cut = Math.min(now, room.round.stoppedAt || Infinity);
  const out = {};
  for (const w of planFor(room, code, botId, dict).writes) if (w.at <= cut) out[w.cat] = w.word;
  return out;
}

/** Il robot che deve premere STOP adesso (quello col momento più vicino già passato), o null. */
export function dueStop(room, code, dict, now) {
  if (room.status !== 'play' || room.round.stoppedBy) return null;
  let best = null;
  for (const id of botIds(room)) {
    const { stopAt } = planFor(room, code, id, dict);
    if (stopAt !== null && stopAt <= now && (!best || stopAt < best.at)) best = { id, at: stopAt };
  }
  return best ? best.id : null;
}

/** I "Non vale" dei robot in correzione: [{ cat, target, voter }]. */
export function botVotesFor(room, code, dict) {
  const out = [];
  const letter = room.round.letter;
  for (const cat of catKeys(room)) {
    for (const target of Object.keys(room.players)) {
      const text = (room.answers?.[target]?.[cat] || '').trim();
      if (!text) continue;
      const wrongLetter = !startsWithLetter(text, letter);
      const known = !wrongLetter && dict.has(cat, text);
      const isBot = !!room.players[target].bot;
      for (const voter of botIds(room)) {
        if (voter === target) continue;
        const random = seededRandom(code, room.round.n, 'voti', voter, cat, target);
        if (botVote(QUICK_LEVEL, { known, wrongLetter, authorIsBot: isBot, botError: isBot && !known }, random)) out.push({ cat, target, voter });
      }
    }
  }
  return out;
}

/** Robot per completare la stanza, con nomi diversi da quelli già presenti. */
export function pickBots(n, takenNames, random) {
  const taken = new Set(takenNames.map(normalize));
  const pool = BOT_NAMES.filter((name) => !taken.has(normalize(name)));
  return Array.from({ length: n }, (_, i) => ({
    id: `bot${i + 1}`,
    name: pool.splice(Math.floor(random() * pool.length), 1)[0],
    face: Math.floor(random() * 6),
    color: Math.floor(random() * 6),
  }));
}
