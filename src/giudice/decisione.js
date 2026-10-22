// Cosa succede a una risposta: protetta dal dizionario, verificata dal giudice, bocciata dal giudice o votata come
// sempre. Funzioni pure, la stessa per il punteggio (room.js) e per lo schermo (Review.js).
import { startsWithLetter } from '../engine/rules.js';
import { chiaveParola } from './chiave.mjs';

/**
 * 'dizionario' | 'verificata' | 'non_esiste' | 'voto'.
 * voce = { v } dall'archivio (o undefined). La lettera sbagliata e la risposta vuota restano a 'voto': ci pensa il
 * punteggio. Un verdetto 'valida' non vale se la parola è nel dizionario di un'altra categoria.
 */
export function statoRisposta({ cat, testo, lettera, voce, dizionario }) {
  if (!dizionario || !testo || !String(testo).trim() || !startsWithLetter(testo, lettera)) return 'voto'; // senza dizionario si vota come oggi
  if (dizionario.ha(cat, testo, lettera)) return 'dizionario';
  if (voce?.v === 'valida' && !dizionario.haAltraCategoria(cat, testo)) return 'verificata';
  if (voce?.v === 'non_valida') return 'non_esiste';
  return 'voto';
}

/**
 * Copia dei voti dopo il giudizio: le risposte 'dizionario' e 'verificata' perdono i voti contro; quelle 'non_esiste'
 * ricevono il voto di tutti gli altri giocatori. votes = { [cat]: { [targetId]: { [voterId]: true } } },
 * answers = { [playerId]: { [cat]: testo } }, archivio = { [cat]: { [chiave]: { v } } }.
 */
export function applicaGiudizio(votes, answers, letter, archivio, playerIds, dizionario) {
  const out = JSON.parse(JSON.stringify(votes || {}));
  for (const pid of Object.keys(answers || {})) {
    for (const [cat, testo] of Object.entries(answers[pid] || {})) {
      const voce = archivio?.[cat]?.[chiaveParola(testo)];
      const stato = statoRisposta({ cat, testo, lettera: letter, voce, dizionario });
      if (stato === 'dizionario' || stato === 'verificata') { if (out[cat]?.[pid]) out[cat][pid] = {}; }
      else if (stato === 'non_esiste') {
        (out[cat] ||= {})[pid] = Object.fromEntries((playerIds || []).filter((id) => id !== pid).map((id) => [id, true]));
      }
    }
  }
  return out;
}
