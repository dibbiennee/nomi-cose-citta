// Chiave di una parola nell'archivio dei verdetti (giudizi/{categoria}/{chiave}). Pura: la usano il telefono, il server
// e gli script, così la stessa parola ha sempre la stessa chiave.
import { normalize } from '../engine/rules.js';

/** Normalizzata come nel gioco (maiuscole, accenti, spazi), apostrofi tipografici dritti, spazi in "_", senza i caratteri
 * che il database non ammette nelle chiavi (. $ # [ ] /) né quelli di controllo, al massimo 60 caratteri. */
export function chiaveParola(testo) {
  return normalize(String(testo ?? '').replace(/[’‘`´]/g, "'"))
    .replace(/[.$#[\]/\u0000-\u001f\u007f]/g, '')
    .replace(/ /g, '_')
    .slice(0, 60);
}

export const percorsoGiudizio = (cat, testo) => `giudizi/${cat}/${chiaveParola(testo)}`;
