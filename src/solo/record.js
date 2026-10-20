// Record della partita da soli, per difficoltà, salvati sul telefono.
// Funzioni pure: lo storage si passa da fuori (localStorage nel browser, uno finto nei test).
// La struttura { migliore, giocate, vinte } per difficoltà è quella che il progetto degli account manderà online.

export const RECORD_KEY = 'ncc-solo-record';
const EMPTY = { migliore: null, giocate: 0, vinte: 0 };

/** Una partita lampo contro un solo robot non vale quanto una vera. */
export const countsForRecord = (settings, botCount) => settings.cats.length >= 3 && botCount >= 2;

/** Il punteggio dipende da quante categorie e round: il record è la media di punti a parola, con un decimale. */
export const pointsPerWord = (total, catCount, rounds) => Math.round((total / (catCount * rounds)) * 10) / 10;

export const formatPpw = (n) => n.toFixed(1).replace('.', ',');

export function createRecordStore(storage) {
  const readAll = () => {
    try {
      const all = JSON.parse(storage?.getItem(RECORD_KEY));
      return all && typeof all === 'object' ? all : {};
    } catch (e) { return {}; }
  };
  return {
    get: (difficulty) => ({ ...EMPTY, ...readAll()[difficulty] }),
    save(difficulty, { ppw, won }) {
      const all = readAll();
      const cur = { ...EMPTY, ...all[difficulty] };
      const beaten = cur.migliore === null || ppw > cur.migliore;
      all[difficulty] = { migliore: beaten ? ppw : cur.migliore, giocate: cur.giocate + 1, vinte: cur.vinte + (won ? 1 : 0) };
      try { storage?.setItem(RECORD_KEY, JSON.stringify(all)); } catch (e) { /* si gioca lo stesso, solo non si salva */ }
      return { beaten };
    },
  };
}
