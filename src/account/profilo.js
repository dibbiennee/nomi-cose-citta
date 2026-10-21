// Nelle transazioni il primo giro può arrivare con cur === null (dato non ancora letto): si restituisce null e
// Firebase riprova con il valore vero; restituire undefined annullerebbe tutto.
//
// Profilo dell'account in users/{uid}: monete, accessori, username, inviti. Lo scrive il telefono e lo controllano
// le regole del database (aumenti limitati, spese al prezzo di catalogo). È estetica, non soldi: quando la vendita
// vera partirà, monete e acquisti passeranno a funzioni server.
import { ref, get, set, update, remove, runTransaction, serverTimestamp } from 'firebase/database';
import { EARN, ITEMS, itemById, TIPI } from '../shop/catalogo.js';

const userRef = (db, uid) => ref(db, `users/${uid}`);
const USERNAME = /^[A-Za-z0-9_]{5,14}$/;
const prevDay = (d) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

/** Monete di una partita finita: 5, +5 se vinci, +1 per parola unica fino a +10. */
export const gameCoins = ({ won, unique }) => Math.min(20, EARN.base + (won ? EARN.vittoria : 0) + Math.min(EARN.maxUniche, (unique | 0) * EARN.perUnica));

/** Crea il profilo alla registrazione: benvenuto (primi 100 o no), monete dell'ultima partita, invito. */
export async function createProfile(db, uid, { pendingCoins = 0, invitedBy = null } = {}) {
  const existing = (await get(userRef(db, uid))).val();
  if (existing) return { primi100: !!existing.primi100, coins: existing.coins };
  const res = await runTransaction(ref(db, 'meta/iscritti'), (v) => (v || 0) + 1, { applyLocally: false });
  const primi100 = res.snapshot.val() <= EARN.primi;
  const invited = invitedBy && invitedBy !== uid ? invitedBy : null;
  const coins = (primi100 ? EARN.benvenutoPrimi : EARN.benvenuto) + Math.min(20, Math.max(0, pendingCoins | 0)) + (invited ? EARN.invito : 0);
  await set(userRef(db, uid), {
    coins, primi100, createdAt: serverTimestamp(), invitesClaimed: 0,
    ...(invited ? { invitedBy: invited } : {}),
    ...(primi100 ? { owned: Object.fromEntries(ITEMS.filter((i) => i.esclusivo).map((i) => [i.id, true])) } : {}),
  });
  if (invited) await set(ref(db, `invites/${invited}/${uid}`), true).catch(() => {});
  return { primi100, coins };
}

/** Monete di fine partita. Rifiutato se arriva entro un minuto dall'ultima. Restituisce il nuovo saldo. */
export async function earnGame(db, uid, result) {
  const amount = gameCoins(result);
  const res = await runTransaction(userRef(db, uid), (cur) => (cur ? { ...cur, coins: cur.coins + amount, lastEarn: serverTimestamp() } : cur), { applyLocally: false });
  if (!res.committed) throw new Error('nessun profilo');
  return res.snapshot.val().coins;
}

/** Bonus del giorno: 20, +10 per ogni giorno consecutivo fino a 70. null se già preso oggi. */
export async function claimDaily(db, uid, today) {
  let out = null;
  const res = await runTransaction(userRef(db, uid), (cur) => {
    if (cur === null) return null; // primo giro senza dati: Firebase riprova con il valore vero
    if (cur.lastDaily === today) { out = null; return undefined; }
    const streak = cur.lastDaily === prevDay(today) ? (cur.streak || 0) + 1 : 1;
    const amount = Math.min(EARN.giornalieroMax, EARN.giornaliero + EARN.serie * (streak - 1));
    out = { amount, streak };
    return { ...cur, coins: cur.coins + amount, lastDaily: today, lastDailyAt: serverTimestamp(), streak };
  }, { applyLocally: false }).catch(() => ({ committed: false }));
  return res.committed ? out : null;
}

/** Compra un accessorio con le monete: 'ok', 'poveri' (monete insufficienti) o 'già' (già posseduto). */
export async function buyItem(db, uid, itemId) {
  const item = itemById(itemId);
  if (!item || item.esclusivo) return 'poveri';
  let why = 'poveri';
  const res = await runTransaction(userRef(db, uid), (cur) => {
    if (!cur) return cur;
    if (cur.owned?.[itemId]) { why = 'già'; return undefined; }
    if (cur.coins < item.prezzo) { why = 'poveri'; return undefined; }
    return { ...cur, coins: cur.coins - item.prezzo, owned: { ...cur.owned, [itemId]: true } };
  }, { applyLocally: false });
  return res.committed ? 'ok' : why;
}

/** Indossa (o toglie, con null) un accessorio posseduto, uno per tipo. */
export async function equip(db, uid, tipo, itemId) {
  if (!TIPI.includes(tipo)) return;
  await set(ref(db, `users/${uid}/equipped/${tipo}`), itemId || null);
}

/** Username unico (confronto in minuscolo): 'ok', 'preso' o 'non valido'. */
export async function setUsername(db, uid, name) {
  if (!USERNAME.test(name || '')) return 'non valido';
  const key = name.toLowerCase();
  const res = await runTransaction(ref(db, `usernames/${key}`), (cur) => (cur === null || cur === uid ? uid : undefined), { applyLocally: false })
    .catch(() => ({ committed: false }));
  if (!res.committed) return 'preso';
  const old = (await get(ref(db, `users/${uid}/username`))).val();
  await set(ref(db, `users/${uid}/username`), name);
  if (old && old.toLowerCase() !== key) await remove(ref(db, `usernames/${old.toLowerCase()}`)).catch(() => {});
  return 'ok';
}

/** Riscuote gli inviti andati a buon fine (200 monete ciascuno, al massimo 20). Restituisce le monete ricevute. */
export async function claimInvites(db, uid) {
  const invites = Object.keys((await get(ref(db, `invites/${uid}`))).val() || {});
  let total = 0;
  for (const friend of invites) {
    const res = await runTransaction(userRef(db, uid), (cur) => {
      if (cur === null) return null; // primo giro senza dati: Firebase riprova con il valore vero
      if (cur.claimed?.[friend] || (cur.invitesClaimed || 0) >= EARN.maxInviti) return undefined;
      return { ...cur, coins: cur.coins + EARN.invito, invitesClaimed: (cur.invitesClaimed || 0) + 1, lastInvite: friend, claimed: { ...cur.claimed, [friend]: true } };
    }, { applyLocally: false }).catch(() => ({ committed: false }));
    if (res.committed) total += EARN.invito;
  }
  return total;
}

/** Lista d'attesa per i prodotti a soldi veri: email e consenso esplicito. */
export async function joinWaitlist(db, uid, { email, product, consent }) {
  await update(ref(db, `waitlist/${uid}`), { email: String(email || '').trim().slice(0, 120), consent: consent === true, at: serverTimestamp(), [`products/${product}`]: true });
}
export const leaveWaitlist = (db, uid) => remove(ref(db, `waitlist/${uid}`));

/** Cancella profilo, username e lista d'attesa. */
export async function deleteProfile(db, uid) {
  const name = (await get(ref(db, `users/${uid}/username`))).val();
  await update(ref(db), { [`users/${uid}`]: null, [`waitlist/${uid}`]: null, ...(name ? { [`usernames/${name.toLowerCase()}`]: null } : {}) });
}
