// Statistiche del gioco su Firebase: contatori per giorno e chi c'è adesso. Niente dati personali, solo numeri;
// la pagina /statistiche li legge dal vivo. Le regole (database.rules.json, stats e live) accettano solo
// aumenti di uno sui contatori di questo elenco, e la presenza di ognuno solo da lui stesso.
import { ref, runTransaction, set, remove, onDisconnect, serverTimestamp } from 'firebase/database';

export const STAT_KEYS = [
  'stanze_create', // chi crea una stanza
  'partite_online', // partite online iniziate (le conta l'host)
  'partite_online_finite', // arrivate al podio (le conta l'host)
  'giocatori_online', // ogni telefono che gioca una partita online si conta da solo
  'solo_facile', 'solo_medio', 'solo_difficile', 'solo_impossibile', // partite da soli iniziate
  'solo_finite', // partite da soli arrivate al podio
  'installazioni', // gioco aggiunto alla schermata Home
  'partite_veloci', // partite formate dalla coda della partita veloce
];
export const LIVE_PLACES = ['home', 'stanza', 'solo', 'coda'];

/** Il giorno in Italia, AAAA-MM-GG: le statistiche si leggono con l'orario di chi gioca. */
export const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Un contatore in più per oggi. Se non c'è rete, si perde: sono statistiche, non devono disturbare il gioco. */
export function track(db, key) {
  if (!STAT_KEYS.includes(key)) return Promise.resolve();
  return runTransaction(ref(db, `stats/days/${dayKey(Date.now())}/${key}`), (v) => (v || 0) + 1, { applyLocally: false });
}

/** Dove si trova questo telefono adesso (home, stanza, solo, coda). La voce sparisce da sola quando si scollega. */
export async function setLive(db, uid, where) {
  const me = ref(db, `live/${uid}`);
  await onDisconnect(me).remove();
  await set(me, { where, at: serverTimestamp() });
}
export const clearLive = (db, uid) => remove(ref(db, `live/${uid}`));
