// Scrigno a fine partita: quasi sempre poche monete, a volte di più, ogni tanto un accessorio raro.
// rng è una funzione che dà un numero tra 0 e 1 (Math.random, o un valore fisso nelle prove).

export const RARI = ['cappello_mago', 'occhiali_arcobaleno', 'collare_gemme'];
export const MAX_CHEST_COINS = 40;
export const RARE_FALLBACK_COINS = 50; // se hai già tutti i rari

/**
 * 70% da 5 a 15 monete, 25% da 20 a 40, 5% un accessorio raro che non hai ancora
 * (se li hai tutti, 50 monete fisse).
 */
export function rollChest(rng, owned = {}) {
  const r = rng();
  if (r >= 0.95) {
    const left = RARI.filter((id) => !owned[id]);
    if (!left.length) return { kind: 'monete', coins: RARE_FALLBACK_COINS };
    return { kind: 'raro', item: left[Math.min(left.length - 1, Math.floor(rng() * left.length))], coins: 0 };
  }
  if (r >= 0.7) return { kind: 'monete', coins: 20 + Math.floor(rng() * 21) };
  return { kind: 'monete', coins: 5 + Math.floor(rng() * 11) };
}
