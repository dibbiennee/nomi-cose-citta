// Statistiche del gioco su Firebase: contatori per giorno e chi c'è adesso. Niente dati personali, solo numeri;
// la pagina /statistiche li legge dal vivo. Le regole (database.rules.json, stats e live) accettano solo
// aumenti di uno sui contatori di questo elenco, e la presenza di ognuno solo da lui stesso.
import { ref, runTransaction, set, remove, onDisconnect, serverTimestamp } from 'firebase/database';

const LEVELS = ['facile', 'medio', 'difficile', 'impossibile'];
export const STAT_KEYS = [
  // chi arriva e chi torna (src/visite.js)
  'aperture', 'telefoni_nuovi', 'telefoni_tornati', 'tornati_d1', 'tornati_d7',
  ...Array.from({ length: 24 }, (_, h) => `ora_${String(h).padStart(2, '0')}`), // aperture per fascia oraria
  'da_link', 'da_icona', 'diretta', // da dove si apre: link a una stanza, icona sulla Home, sito
  // il percorso
  'scelta_online', 'scelta_solo',
  // online
  'stanze_create', 'stanze_avviate', // create, e quelle che sono davvero partite
  'partite_online', 'partite_online_finite', 'rivincite',
  'giocatori_online', 'giocatori_al_podio', // ogni telefono conta sé stesso
  'giocatori_2', 'giocatori_3', 'giocatori_4', 'giocatori_5piu', // persone per partita (le conta l'host)
  'inviti_whatsapp', 'link_copiati', 'ingressi_link', 'ingressi_codice',
  'errori_non_trovata', 'errori_piena', 'errori_iniziata', 'errori_rete',
  // da soli
  ...LEVELS.flatMap((l) => [`solo_${l}`, `solo_${l}_finite`, `solo_${l}_vinte`]),
  'solo_finite', 'record_battuti',
  // il resto
  'fondatore_attivato', 'raffaella_scelta', 'guida_aperta', 'installazioni',
  'partite_veloci', // partite formate dalla coda della partita veloce
  // account e richiesta dei prodotti a soldi veri (ancora in vetrina)
  'account_creati', 'lista_attesa',
  'richiesta_monete_500', 'richiesta_monete_1200', 'richiesta_monete_3500', 'richiesta_username_corto',
  // ritorno giornaliero: traguardi raggiunti, serie perse, scudi, sfide riscosse (per livello) e scrigni
  'serie_3', 'serie_7', 'serie_14', 'serie_30', 'serie_50', 'serie_100', 'serie_persa', 'scudo_usato',
  'sfida_facile', 'sfida_media', 'sfida_difficile', 'sfide_tutte', 'scrigni_aperti', 'scrigni_rari',
];
/** Contatori che si sommano a minuti (fino a 120 alla volta) invece che di uno. */
export const MINUTE_KEYS = ['minuti_online', 'minuti_solo'];
export const LIVE_PLACES = ['home', 'stanza', 'solo', 'coda'];

/** Il giorno in Italia, AAAA-MM-GG: le statistiche si leggono con l'orario di chi gioca. */
export const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

// Lo stesso contatore dallo stesso telefono si manda uno alla volta: due transazioni insieme sullo stesso percorso
// farebbero un salto di due, che le regole (solo +1) respingono.
const queues = new Map();
function inLine(path, run) {
  const next = (queues.get(path) || Promise.resolve()).catch(() => {}).then(run);
  queues.set(path, next);
  return next;
}

/** Minuti di gioco da sommare per oggi (durata delle partite). */
export function trackMinutes(db, key, minutes) {
  const m = Math.min(120, Math.max(1, Math.round(minutes)));
  if (!MINUTE_KEYS.includes(key)) return Promise.resolve();
  const path = `stats/days/${dayKey(Date.now())}/${key}`;
  return inLine(path, () => runTransaction(ref(db, path), (v) => (v || 0) + m, { applyLocally: false }));
}

/** Un contatore in più per oggi. Se non c'è rete, si perde: sono statistiche, non devono disturbare il gioco. */
export function track(db, key) {
  if (!STAT_KEYS.includes(key)) return Promise.resolve();
  const path = `stats/days/${dayKey(Date.now())}/${key}`;
  return inLine(path, () => runTransaction(ref(db, path), (v) => (v || 0) + 1, { applyLocally: false }));
}

/** Dove si trova questo telefono adesso (home, stanza, solo, coda). La voce sparisce da sola quando si scollega. */
export async function setLive(db, uid, where) {
  const me = ref(db, `live/${uid}`);
  await onDisconnect(me).remove();
  await set(me, { where, at: serverTimestamp() });
}
export const clearLive = (db, uid) => remove(ref(db, `live/${uid}`));
