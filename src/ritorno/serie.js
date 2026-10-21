// Serie di giorni di fila: logica pura, senza database. Il giorno è quello di Roma (AAAA-MM-GG, come dayKey).
// Una sola copia di queste regole: le usa il browser e le prove in Node.

/** Traguardi: giorno, monete e, dove previsto, un accessorio che esiste solo così. Dopo il 100: 3000 ogni 100. */
export const MILESTONES = [
  { n: 3, coins: 50 },
  { n: 7, coins: 150, item: 'cornice_scintille' },
  { n: 14, coins: 300 },
  { n: 30, coins: 800, item: 'mantello_notte' },
  { n: 50, coins: 1200 },
  { n: 100, coins: 3000, item: 'corona_fiamme' },
];
export const EVERY_AFTER_100 = { every: 100, coins: 3000 };

/** Il premio del giorno n della serie, o null se quel giorno non è un traguardo. */
export function milestoneFor(n) {
  const m = MILESTONES.find((x) => x.n === n);
  if (m) return m.item ? { coins: m.coins, item: m.item } : { coins: m.coins };
  if (n > 100 && n % EVERY_AFTER_100.every === 0) return { coins: EVERY_AFTER_100.coins };
  return null;
}

/** Il giorno n giorni prima di `day` (mezzogiorno UTC per non inciampare nell'ora legale). */
export function dayBefore(day, n = 1) {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/**
 * Avanza la serie al giorno `today`. state: { lastDay?, lastDaily?, streak?, migliorSerie?, serieId?, scudo? }.
 * Chi ha ancora solo lastDaily (prima di questo aggiornamento) continua la serie che aveva.
 * Un solo giorno saltato è coperto dallo scudo, una volta per mese di calendario (scudo = 'AAAA-MM' dell'ultimo uso).
 * Restituisce lo stato nuovo, cosa è successo e i traguardi raggiunti oggi.
 */
export function advanceStreak(state, today) {
  const last = state.lastDay || state.lastDaily || null;
  const streak = state.streak || 0;
  const best = state.migliorSerie || 0;
  if (last === today) return { state: { ...state }, event: 'stesso-giorno', reached: [] };
  const month = today.slice(0, 7);
  let event = 'nuovo';
  let next = 1;
  let serieId = today;
  let scudo = state.scudo;
  if (last && streak > 0) {
    if (last === dayBefore(today)) { event = 'continua'; next = streak + 1; serieId = state.serieId || last; }
    else if (last === dayBefore(today, 2) && state.scudo !== month) { event = 'scudo'; next = streak + 1; serieId = state.serieId || last; scudo = month; }
    else event = 'riparte';
  }
  const out = { ...state, lastDay: today, streak: next, migliorSerie: Math.max(best, next), serieId };
  if (scudo !== undefined) out.scudo = scudo;
  delete out.lastDaily; // il campo vecchio non entra nel nuovo stato: resta nel profilo com'è
  const reached = event === 'continua' || event === 'scudo' || event === 'nuovo' || event === 'riparte'
    ? (milestoneFor(next) ? [next] : []) : [];
  return { state: out, event, reached };
}
