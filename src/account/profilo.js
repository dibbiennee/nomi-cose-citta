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

/**
 * Crea il profilo alla registrazione: benvenuto (primi 100 o no), monete dell'ultima partita, invito.
 * Il profilo nasce nello stesso salvataggio che fa +1 al contatore degli iscritti e segna il posto di questo uid
 * (iscritti/{uid}): le regole così sanno se è davvero tra i primi 100, e un profilo cancellato non si ricrea.
 * Se due persone si iscrivono nello stesso istante una delle due viene rifiutata e riprova col numero nuovo.
 */
export async function createProfile(db, uid, { pendingCoins = 0, invitedBy = null } = {}) {
  const existing = (await get(userRef(db, uid))).val();
  if (existing) return { primi100: !!existing.primi100, coins: existing.coins };
  let invited = invitedBy && invitedBy !== uid ? invitedBy : null;
  if (invited && !(await get(ref(db, `iscritti/${invited}`)).catch(() => null))?.exists()) invited = null;
  for (let attempt = 0; ; attempt++) {
    const n = ((await get(ref(db, 'meta/iscritti'))).val() || 0) + 1;
    const primi100 = n <= EARN.primi;
    const coins = (primi100 ? EARN.benvenutoPrimi : EARN.benvenuto) + Math.min(20, Math.max(0, pendingCoins | 0)) + (invited ? EARN.invito : 0);
    try {
      await update(ref(db), {
        'meta/iscritti': n,
        [`iscritti/${uid}`]: n,
        [`users/${uid}`]: {
          coins, primi100, createdAt: serverTimestamp(), invitesClaimed: 0,
          ...(invited ? { invitedBy: invited } : {}),
          ...(primi100 ? { owned: Object.fromEntries(ITEMS.filter((i) => i.esclusivo).map((i) => [i.id, true])) } : {}),
        },
      });
    } catch (e) {
      if (attempt >= 4) throw e;
      continue;
    }
    if (invited) await set(ref(db, `invites/${invited}/${uid}`), true).catch(() => {});
    return { primi100, coins };
  }
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

/**
 * Username unico (confronto in minuscolo): 'ok', 'preso' o 'non valido'. Nome nuovo, profilo e nome vecchio cambiano
 * nello stesso salvataggio: le regole accettano un nome solo se il profilo lo usa, e liberano subito il vecchio.
 */
export async function setUsername(db, uid, name) {
  if (!USERNAME.test(name || '')) return 'non valido';
  const key = name.toLowerCase();
  const owner = (await get(ref(db, `usernames/${key}`))).val();
  if (owner && owner !== uid) return 'preso';
  const old = (await get(ref(db, `users/${uid}/username`))).val();
  const oldKey = old ? old.toLowerCase() : null;
  try {
    await update(ref(db), {
      [`users/${uid}/username`]: name,
      ...(owner ? {} : { [`usernames/${key}`]: uid }),
      ...(oldKey && oldKey !== key ? { [`usernames/${oldKey}`]: null } : {}),
    });
  } catch (e) { return 'preso'; } // qualcuno l'ha preso un attimo prima
  return 'ok';
}

/**
 * Riscuote gli inviti andati a buon fine (200 monete ciascuno, al massimo 20). Restituisce le monete ricevute.
 * L'invito riscosso passa da true a 'preso' nello stesso salvataggio delle monete, e da lì non torna indietro.
 */
export async function claimInvites(db, uid) {
  const all = (await get(ref(db, `invites/${uid}`))).val() || {};
  let total = 0;
  for (const friend of Object.keys(all).filter((f) => all[f] === true)) {
    const cur = (await get(userRef(db, uid))).val();
    if (!cur || (cur.invitesClaimed || 0) >= EARN.maxInviti) break;
    const ok = await update(ref(db), {
      [`users/${uid}/coins`]: cur.coins + EARN.invito,
      [`users/${uid}/invitesClaimed`]: (cur.invitesClaimed || 0) + 1,
      [`users/${uid}/lastInvite`]: friend,
      [`invites/${uid}/${friend}`]: 'preso',
    }).then(() => true, () => false);
    if (ok) total += EARN.invito;
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
