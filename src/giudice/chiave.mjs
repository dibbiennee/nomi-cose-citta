// Chiave di una parola nell'archivio dei verdetti (giudizi/{categoria}/{chiave}). Pura: la usano il telefono, il server
// e gli script, così la stessa parola ha sempre la stessa chiave.
import { normalize } from '../engine/rules.js';

/** Normalizzata come nel gioco (maiuscole, accenti, spazi), apostrofi tipografici dritti, spazi in "_", senza i caratteri
 * che il database non ammette nelle chiavi (. $ # [ ] /) né quelli di controllo, al massimo 60 caratteri. */
export function chiaveParola(testo) {
  const normalizzato = normalize(String(testo ?? '').replace(/[’‘`´]/g, "'")).replace(/[.$#[\]/]/g, '');
  const senzaControllo = [...normalizzato].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('');
  return senzaControllo.replace(/ /g, '_').slice(0, 60);
}

export const percorsoGiudizio = (cat, testo) => `giudizi/${cat}/${chiaveParola(testo)}`;
