// Regole del gioco: funzioni pure, senza Firebase. Si possono usare e testare ovunque.

export const HARD_LETTERS = ['H', 'J', 'K', 'Q', 'W', 'X', 'Y'];
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const DEFAULT_CATEGORIES = [
  { key: 'nomi', label: 'Nomi', color: '#FF8A65' },
  { key: 'cose', label: 'Cose', color: '#5CD0FF' },
  { key: 'citta', label: 'Città', color: '#B79CFF' },
  { key: 'animali', label: 'Animali', color: '#6EE7A8' },
  { key: 'cibi', label: 'Cibi', color: '#FFB547' },
  { key: 'mestieri', label: 'Mestieri', color: '#FF7EB6' },
  { key: 'film', label: 'Film', color: '#9AA8FF' },
  { key: 'calciatori', label: 'Calciatori', color: '#E8E46A' },
];

export const DEFAULT_SETTINGS = {
  cats: DEFAULT_CATEGORIES.slice(0, 3),
  rounds: 3,
  maxPlayers: 8,
  timer: 90, // secondi; 0 = senza tempo, finisce solo con STOP
  hard: true, // true = esclude le lettere difficili
};

/** Minuscole, senza accenti, senza spazi ai bordi: "  Città " -> "citta" */
export function normalize(text) {
  return (text || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

export function startsWithLetter(text, letter) {
  const n = normalize(text);
  return n.length > 0 && n.charAt(0) === normalize(letter);
}

/** Codice stanza di 4 caratteri, senza lettere/numeri ambigui (0/O, 1/I). */
export function makeCode(random = Math.random) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += abc.charAt(Math.floor(random() * abc.length));
  return code;
}

/** Lettera casuale non ancora usata. Se sono finite, ricomincia dal mazzo intero. */
export function pickLetter(used = [], excludeHard = true, random = Math.random) {
  const deck = ALPHABET.filter((l) => !excludeHard || !HARD_LETTERS.includes(l));
  let pool = deck.filter((l) => !used.includes(l));
  if (pool.length === 0) pool = deck;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Una risposta è bocciata se vota contro PIÙ DI METÀ degli altri giocatori
 * (l'autore non vota sulla propria parola).
 */
export function isRejected(votesAgainst, playerCount) {
  const voters = Math.max(1, playerCount - 1);
  return votesAgainst > voters / 2;
}

/**
 * Punteggio di una categoria.
 * @param {string[]} playerIds   tutti i giocatori del round
 * @param {Object} answers       { [playerId]: "parola" }
 * @param {Object} votes         { [targetPlayerId]: { [voterId]: true } }
 * @param {string} letter
 * @returns {Object} { [playerId]: { text, points, status } }
 *   status: 'empty' | 'wrongLetter' | 'rejected' | 'solo' | 'duplicate' | 'unique'
 *   punti:   0         0               0            20       5             10
 */
export function scoreCategory(playerIds, answers = {}, votes = {}, letter) {
  const rows = playerIds.map((id) => {
    const text = (answers[id] || '').trim();
    const against = Object.keys(votes[id] || {}).filter((v) => v !== id && playerIds.includes(v)).length;
    let status = null;
    if (!text) status = 'empty';
    else if (!startsWithLetter(text, letter)) status = 'wrongLetter';
    else if (isRejected(against, playerIds.length)) status = 'rejected';
    return { id, text, norm: normalize(text), status, against };
  });
  const valid = rows.filter((r) => r.status === null);
  const out = {};
  for (const r of rows) {
    let status = r.status;
    if (status === null) {
      if (valid.length === 1) status = 'solo';
      else if (valid.filter((v) => v.norm === r.norm).length > 1) status = 'duplicate';
      else status = 'unique';
    }
    const points = { solo: 20, unique: 10, duplicate: 5 }[status] || 0;
    out[r.id] = { text: r.text, points, status, votesAgainst: r.against };
  }
  return out;
}

/**
 * Punteggio dell'intero round.
 * @param {Object} answers { [playerId]: { [catKey]: "parola" } }
 * @param {Object} votes   { [catKey]: { [targetPlayerId]: { [voterId]: true } } }
 * @returns {{ points: Object, stats: Object, byCategory: Object }}
 *   points: { [playerId]: puntiDelRound }
 *   stats:  { [playerId]: { uniq, dup } }  (per i premi finali)
 */
export function scoreRound(playerIds, catKeys, answers = {}, votes = {}, letter) {
  const points = {}, stats = {}, byCategory = {};
  for (const id of playerIds) { points[id] = 0; stats[id] = { uniq: 0, dup: 0 }; }
  for (const cat of catKeys) {
    const catAnswers = {};
    for (const id of playerIds) catAnswers[id] = (answers[id] || {})[cat] || '';
    const res = scoreCategory(playerIds, catAnswers, votes[cat] || {}, letter);
    byCategory[cat] = res;
    for (const id of playerIds) {
      points[id] += res[id].points;
      if (res[id].status === 'unique' || res[id].status === 'solo') stats[id].uniq++;
      if (res[id].status === 'duplicate') stats[id].dup++;
    }
  }
  return { points, stats, byCategory };
}

/** Classifica: dal punteggio più alto, a parità chi è entrato prima. */
export function ranking(players) {
  return Object.entries(players || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.joinedAt || 0) - (b.joinedAt || 0));
}

/** Premi finali: Fulmine (più STOP), Originale (più uniche), Copione (più doppie). */
export function computeAwards(players) {
  const list = Object.entries(players || {}).map(([id, p]) => ({ id, stats: { stops: 0, uniq: 0, dup: 0, ...(p.stats || {}) }, joinedAt: p.joinedAt || 0 }));
  const best = (k) => list.slice().sort((a, b) => b.stats[k] - a.stats[k] || a.joinedAt - b.joinedAt)[0];
  const make = (key, stat) => { const w = best(stat); return w ? { key, playerId: w.id, value: w.stats[stat] } : null; };
  return [make('fulmine', 'stops'), make('originale', 'uniq'), make('copione', 'dup')].filter(Boolean);
}

/** Nuovo host quando quello attuale esce: il giocatore online entrato per primo. */
export function nextHost(players, leavingId) {
  const rest = Object.entries(players || {})
    .filter(([id, p]) => id !== leavingId && p.online !== false)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  return rest.length ? rest[0][0] : null;
}

/** Controlli sulle impostazioni prima di salvarle. */
export function sanitizeSettings(s = {}) {
  const cats = (Array.isArray(s.cats) ? s.cats : DEFAULT_SETTINGS.cats)
    .filter((c) => c && c.key && c.label)
    .slice(0, 12)
    .map((c) => ({ key: String(c.key), label: String(c.label).slice(0, 16), color: c.color || '#FFFFFF' }));
  const clamp = (v, min, max, d) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.round(+v))) : d);
  return {
    cats: cats.length >= 2 ? cats : DEFAULT_SETTINGS.cats,
    rounds: clamp(s.rounds, 1, 10, 3),
    maxPlayers: clamp(s.maxPlayers, 2, 12, 8),
    timer: [0, 60, 90, 120].includes(+s.timer) ? +s.timer : 90,
    hard: s.hard !== false,
  };
}
