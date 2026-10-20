// Dizionario della partita da soli: le parole che i robot conoscono, per categoria e lettera.
// Funzioni pure, senza window: girano nel browser e nei test su Node. La casualità si passa da fuori.
//
// Formato di una lista: { [lettera]: [[parola, rarità], ...] }, rarità 0 = comune, 1 = media, 2 = rara.
import { normalize, startsWithLetter } from '../engine/rules.js';

const any = (arr, random) => arr[Math.floor(random() * arr.length)];

export function createDictionary(lists) {
  // Per categoria: le parole normalizzate (per has) e, per lettera, le parole divise per rarità (per pick).
  const known = {};
  const byLetter = {};
  for (const [cat, list] of Object.entries(lists)) {
    known[cat] = new Set();
    byLetter[cat] = {};
    for (const [letter, words] of Object.entries(list)) {
      const tiers = [[], [], []];
      for (const [word, rarity] of words) {
        known[cat].add(normalize(word));
        tiers[rarity].push(word);
      }
      byLetter[cat][letter.toUpperCase()] = tiers;
    }
  }

  return {
    has: (cat, text) => Boolean(known[cat]?.has(normalize(text))),

    /** Prima la rarità coi pesi, poi una parola a caso di quella rarità; se la rarità è vuota, le altre. */
    pick(cat, letter, weights, random, exclude = new Set()) {
      const tiers = byLetter[cat]?.[String(letter).toUpperCase()];
      if (!tiers) return null;
      const free = tiers.map((t) => t.filter((w) => !exclude.has(normalize(w))));
      const total = weights.reduce((sum, w, i) => sum + (free[i].length ? w : 0), 0);
      if (total > 0) {
        let r = random() * total;
        for (let i = 0; i < 3; i++) {
          if (!free[i].length) continue;
          r -= weights[i];
          if (r < 0) return any(free[i], random);
        }
      }
      const rest = free.flat();
      return rest.length ? any(rest, random) : null;
    },

    /** Una parola vera della categoria che non comincia con la lettera: gli errori dei robot facili. */
    wrong(cat, letter, random) {
      const words = Object.values(byLetter[cat] || {}).flat(2).filter((w) => !startsWithLetter(w, letter));
      return words.length ? any(words, random) : null;
    },
  };
}
