// Parole protette. Una parola che il dizionario riconosce per quella categoria e quella lettera non si può togliere
// votando: due amici d'accordo non possono far perdere qualcuno per dispetto. Le parole che il dizionario non conosce
// si votano come sempre (nel dubbio mai bocciate in più). Funzioni pure, senza window: girano nel browser e su Node.
import { normalize, startsWithLetter } from '../engine/rules.js';

/** Le categorie del gioco (chiavi di DEFAULT_CATEGORIES). Le categorie inventate dall'host non sono mai protette. */
export const CATEGORIE_PROTETTE = ['nomi', 'cose', 'citta', 'animali', 'cibi', 'mestieri', 'film', 'calciatori'];

/** liste: { [categoria]: ['Parola', ...] }. `ha` è vero solo per le categorie del gioco e per testo e lettera esatti. */
export function creaDizionario(liste) {
  const note = {};
  for (const cat of CATEGORIE_PROTETTE) note[cat] = new Set((liste?.[cat] || []).map(normalize));
  return {
    ha: (cat, text, letter) => Boolean(note[cat]) && startsWithLetter(text, letter) && note[cat].has(normalize(text)),
  };
}

let dizionario = null;
/** Il dizionario caricato per questo telefono, o null per non proteggere niente (come prima di questa funzione). */
export function impostaDizionario(d) { dizionario = d || null; }
export const dizionarioPronto = () => dizionario !== null;
export const isProtetta = (cat, text, letter) => (dizionario ? dizionario.ha(cat, text, letter) : false);

/**
 * Copia dei voti senza quelli contro risposte protette.
 * votes = { [cat]: { [targetId]: { [voterId]: true } } }, answers = { [playerId]: { [cat]: text } }.
 */
export function senzaVotiProtetti(votes, answers, letter) {
  const out = JSON.parse(JSON.stringify(votes || {}));
  for (const cat of Object.keys(out)) {
    for (const target of Object.keys(out[cat] || {})) {
      const text = answers?.[target]?.[cat];
      if (text && isProtetta(cat, text, letter)) out[cat][target] = {};
    }
  }
  return out;
}

let caricamento = null;
/** Carica le liste solo quando servono (entrando in una stanza online). Un secondo tentativo se il primo fallisce. */
export function caricaDizionario() {
  if (dizionario) return Promise.resolve(true);
  if (!caricamento) {
    const prova = () => import('./liste/index.js').then((m) => { impostaDizionario(creaDizionario(m.LISTE)); return true; });
    caricamento = prova().catch(() => prova()).catch(() => false).then((ok) => { caricamento = null; return ok; });
  }
  return caricamento;
}
