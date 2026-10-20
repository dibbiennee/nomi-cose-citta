// I robot della partita da soli: chi sono, cosa scrivono e quando, come votano.
// Funzioni pure, senza window: la casualità e l'ora di partenza si passano da fuori, così i test sono ripetibili.
import { normalize } from '../engine/rules.js';

export const DIFFICULTIES = ['facile', 'medio', 'difficile', 'impossibile'];

/**
 * Come gioca un robot a ogni difficoltà (valori di partenza della spec, da tarare giocando).
 * fill: quota di caselle che riempie · weights: probabilità di parola comune, media, rara
 * errorRate: parole sbagliate apposta · wordGapMs: pausa tra una casella e l'altra
 * stop: probabilità di premere STOP a caselle piene, e dopo quanto · doubtRate: quanto contesta le parole che non conosce
 */
export const LEVELS = {
  facile: { fill: [0.4, 0.6], weights: [0.85, 0.15, 0], errorRate: 0.15, wordGapMs: [8000, 15000], stop: { chance: 0.05, delayMs: [15000, 25000] }, doubtRate: 0.1 },
  medio: { fill: [0.7, 0.85], weights: [0.6, 0.35, 0.05], errorRate: 0.05, wordGapMs: [5000, 9000], stop: { chance: 0.3, delayMs: [8000, 15000] }, doubtRate: 0.25 },
  difficile: { fill: [0.9, 1], weights: [0.25, 0.5, 0.25], errorRate: 0.01, wordGapMs: [3000, 5000], stop: { chance: 0.8, delayMs: [1000, 3000] }, doubtRate: 0.4 },
  impossibile: { fill: [1, 1], weights: [0.05, 0.3, 0.65], errorRate: 0, wordGapMs: [600, 1200], stop: { chance: 1, delayMs: [0, 500] }, doubtRate: 0.55 },
};

export const BOT_NAMES = [
  'Giulia', 'Marco', 'Sara', 'Luca', 'Chiara', 'Andrea', 'Francesca', 'Matteo', 'Martina', 'Alessandro',
  'Elena', 'Davide', 'Valentina', 'Simone', 'Federica', 'Lorenzo', 'Alessia', 'Gabriele', 'Silvia', 'Riccardo',
  'Giorgia', 'Tommaso', 'Elisa', 'Stefano', 'Beatrice', 'Nicola', 'Ilaria', 'Filippo', 'Marta', 'Paolo',
  'Laura', 'Giacomo', 'Roberta', 'Emanuele', 'Camilla', 'Michele', 'Noemi', 'Pietro', 'Serena', 'Fabio',
  'Aurora', 'Daniele', 'Greta', 'Salvatore', 'Anna', 'Edoardo', 'Rebecca', 'Antonio', 'Sofia', 'Vincenzo',
];

const between = ([lo, hi], random) => lo + (hi - lo) * random();
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Robot con nomi diversi tra loro e da quello del giocatore. quirk sposta un po' quanto riempie e quanto è veloce. */
export function makeBots(n, playerName, random) {
  const pool = BOT_NAMES.filter((name) => normalize(name) !== normalize(playerName));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const name = pool.splice(Math.floor(random() * pool.length), 1)[0];
    bots.push({ id: `bot${i + 1}`, name, face: Math.floor(random() * 6), color: Math.floor(random() * 6), quirk: (random() - 0.5) * 0.2 });
  }
  return bots;
}

/**
 * Cosa scrive un robot in un round e quando. Le caselle si riempiono una alla volta a partire da startMs;
 * stopAt c'è solo se le ha riempite tutte e decide di fermare. Una casella senza parole possibili resta vuota.
 * Il quirk del robot sposta quantità e velocità, ma sempre dentro i limiti della difficoltà.
 */
export function planBot(bot, catKeys, letter, level, dict, random, startMs) {
  const fill = clamp(between(level.fill, random) + bot.quirk, level.fill);
  const order = catKeys.slice().sort(() => random() - 0.5);
  const wanted = order.slice(0, Math.round(catKeys.length * fill));
  const used = new Set();
  const writes = [];
  let at = startMs;
  for (const cat of wanted) {
    let word = random() < level.errorRate ? dict.wrong(cat, letter, random) : null;
    if (word && used.has(normalize(word))) word = null;
    if (!word) word = dict.pick(cat, letter, level.weights, random, used);
    if (!word) continue;
    used.add(normalize(word));
    at += Math.round(clamp(between(level.wordGapMs, random) * (1 + bot.quirk), level.wordGapMs));
    writes.push({ at, cat, word });
  }
  const full = writes.length === catKeys.length && writes.length > 0;
  const stopAt = full && random() < level.stop.chance ? at + Math.round(between(level.stop.delayMs, random)) : null;
  return { writes, stopAt };
}

/** Voto di un robot su una parola di un altro giocatore: true = "Non vale". */
export function botVote(level, { known, wrongLetter, authorIsBot, botError }, random) {
  if (botError || wrongLetter) return true; // gli errori voluti e le lettere sbagliate non passano mai
  if (known) return false; // quello che il dizionario conosce è valido
  if (authorIsBot) return false;
  return random() < level.doubtRate; // parola del giocatore che il dizionario non conosce
}
