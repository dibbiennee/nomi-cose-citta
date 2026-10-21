// Tre sfide al giorno, uguali per tutti: una facile, una media, una difficile. Si scelgono dalla data.
// g = { mode: 'online' | 'veloce' | 'solo', won, unique, rank, players, humans } descrive una partita finita.

export const ALL_DONE_BONUS = 50; // se fai tutte e tre

const online = (g) => g.mode !== 'solo';

export const POOL = [
  { id: 's1', tier: 'facile', nome: 'Gioca una partita', reward: 15, test: () => true },
  { id: 's2', tier: 'facile', nome: 'Gioca con un amico', reward: 15, test: (g) => online(g) && g.humans >= 2 },
  { id: 's7', tier: 'facile', nome: 'Gioca una partita da solo', reward: 15, test: (g) => g.mode === 'solo' },
  { id: 's3', tier: 'media', nome: 'Scrivi 3 parole uniche', reward: 30, test: (g) => g.unique >= 3 },
  { id: 's4', tier: 'media', nome: 'Vinci una partita', reward: 30, test: (g) => online(g) && g.won },
  { id: 's8', tier: 'media', nome: 'Vinci con 5 parole uniche', reward: 30, test: (g) => online(g) && g.won && g.unique >= 5 },
  { id: 's5', tier: 'difficile', nome: 'Arriva nei primi 3', reward: 60, test: (g) => online(g) && g.players >= 3 && g.humans >= 2 && g.rank > 0 && g.rank <= 3 },
  { id: 's6', tier: 'difficile', nome: 'Scrivi 6 parole uniche', reward: 60, test: (g) => g.unique >= 6 },
];

const TIERS = ['facile', 'media', 'difficile'];
/** Giorni dall'epoca di una data AAAA-MM-GG. */
const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);

/** Le tre sfide di un giorno: la scelta dipende solo dalla data, quindi è la stessa per tutti. */
export function challengesFor(day) {
  const d = dayNumber(day);
  return TIERS.map((tier, i) => {
    const of = POOL.filter((c) => c.tier === tier);
    return of[(d + i) % of.length];
  });
}

/** Gli id delle sfide di `day` soddisfatte da questa partita. */
export const completed = (day, g) => challengesFor(day).filter((c) => c.test(g)).map((c) => c.id);
