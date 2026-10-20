// Aiuti condivisi dai test della partita da soli (non finiscono nel sito).

/** Casualità ripetibile, così i test danno sempre lo stesso risultato. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** localStorage finto; `broken` simula uno storage che dà errore (navigazione privata, spazio pieno). */
export function fakeStorage(broken = false) {
  const m = new Map();
  const guard = () => { if (broken) throw new Error('storage non disponibile'); };
  return {
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: (k) => { guard(); m.delete(k); },
    has: (k) => m.has(k),
  };
}
