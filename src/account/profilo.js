// Nelle transazioni il primo giro può arrivare con cur === null (dato non ancora letto): si restituisce null e
// Firebase riprova con il valore vero; restituire undefined annullerebbe tutto.
//
// Profilo dell'account in users/{uid}: monete, accessori, username, inviti. Lo scrive il telefono e lo controllano
// le regole del database (aumenti limitati, spese al prezzo di catalogo). È estetica, non soldi: quando la vendita
// vera partirà, monete e acquisti passeranno a funzioni server.
import { ref, get, set, update, remove, runTransaction, serverTimestamp } from 'firebase/database';
import { EARN, ITEMS, itemById, isBuyable, TIPI } from '../shop/catalogo.js';
import { advanceStreak, milestoneFor } from '../ritorno/serie.js';
import { challengesFor, completed, ALL_DONE_BONUS } from '../ritorno/sfide.js';
import { rollChest } from '../ritorno/scrigno.js';

const userRef = (db, uid) => ref(db, `users/${uid}`);
const USERNAME = /^[A-Za-z0-9_]{5,14}$/;

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

/** Accredita monete (al massimo 20, e non più di una volta al minuto). Restituisce il nuovo saldo. */
export async function earnCoins(db, uid, amount) {
  const add = Math.min(20, Math.max(0, amount | 0));
  const res = await runTransaction(userRef(db, uid), (cur) => (cur ? { ...cur, coins: cur.coins + add, lastEarn: serverTimestamp() } : cur), { applyLocally: false });
  if (!res.committed) throw new Error('nessun profilo');
  return res.snapshot.val().coins;
}

/** Monete di fine partita. Rifiutato se arriva entro un minuto dall'ultima. Restituisce il nuovo saldo. */
export const earnGame = (db, uid, result) => earnCoins(db, uid, gameCoins(result));

/**
 * Bonus del giorno: 20, +10 per ogni giorno di fila fino a 70. null se già preso oggi.
 * I giorni di fila li tiene touchDay (campo streak): qui si leggono soltanto, senza cambiarli.
 */
export async function claimDaily(db, uid, today) {
  let out = null;
  const res = await runTransaction(userRef(db, uid), (cur) => {
    if (cur === null) return null; // primo giro senza dati: Firebase riprova con il valore vero
    if (cur.lastDaily === today) { out = null; return undefined; }
    const streak = Math.max(1, cur.streak || 1);
    const amount = Math.min(EARN.giornalieroMax, EARN.giornaliero + EARN.serie * (streak - 1));
    out = { amount, streak };
    return { ...cur, coins: cur.coins + amount, lastDaily: today, lastDailyAt: serverTimestamp() };
  }, { applyLocally: false }).catch(() => ({ committed: false }));
  return res.committed ? out : null;
}

/** Compra un accessorio con le monete: 'ok', 'poveri' (monete insufficienti) o 'già' (già posseduto). */
export async function buyItem(db, uid, itemId) {
  const item = itemById(itemId);
  if (!item || !isBuyable(item)) return 'poveri';
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
export const isOnWaitlist = (db, uid) => get(ref(db, `waitlist/${uid}`)).then((s) => s.exists());

/** Cancella profilo, username, lista d'attesa e gli inviti dove compare (da invitato e da chi invita). */
export async function deleteProfile(db, uid) {
  const user = (await get(userRef(db, uid))).val() || {};
  const name = user.username;
  await update(ref(db), {
    [`users/${uid}`]: null, [`waitlist/${uid}`]: null, [`invites/${uid}`]: null, [`claims/${uid}`]: null,
    ...(user.invitedBy ? { [`invites/${user.invitedBy}/${uid}`]: null } : {}),
    ...(name ? { [`usernames/${name.toLowerCase()}`]: null } : {}),
  });
}

// ---- Ritorno giornaliero: serie di giorni, traguardi, sfide e scrigno ----

/**
 * Registra che oggi la persona ha aperto il gioco: fa avanzare la serie (con lo scudo, una volta al mese).
 * Restituisce { event, streak, reached } o null se oggi era già registrato o le regole rifiutano (per esempio
 * troppo presto dall'ultimo giorno registrato: si riprova all'apertura dopo).
 */
export async function touchDay(db, uid, today) {
  const cur = (await get(userRef(db, uid))).val();
  if (!cur) return null;
  const r = advanceStreak(cur, today);
  if (r.event === 'stesso-giorno') return null;
  const st = r.state;
  const write = { lastDay: st.lastDay, lastDayAt: serverTimestamp(), streak: st.streak, migliorSerie: st.migliorSerie, serieId: st.serieId };
  if (st.scudo !== undefined) write.scudo = st.scudo;
  try { await update(userRef(db, uid), write); } catch (e) { return null; }
  return { event: r.event, streak: st.streak, reached: r.reached };
}

/**
 * Riscuote i traguardi raggiunti: monete (e accessorio dove previsto), una volta per serie. Ogni traguardo è una
 * scrittura sola, con il segno claims/{uid}/m_{serieId}_{n} che impedisce di riscuoterlo di nuovo.
 */
export async function claimMilestones(db, uid, reached) {
  let coins = 0;
  const items = [];
  for (const n of reached) {
    const m = milestoneFor(n);
    const cur = (await get(userRef(db, uid))).val();
    if (!m || !cur || !cur.serieId) continue;
    const key = `m_${cur.serieId}_${n}`;
    if ((await get(ref(db, `claims/${uid}/${key}`))).exists()) continue;
    const write = { [`users/${uid}/coins`]: cur.coins + m.coins, [`claims/${uid}/${key}`]: true };
    if (m.item) write[`users/${uid}/owned/${m.item}`] = true;
    try { await update(ref(db), write); } catch (e) { continue; }
    coins += m.coins;
    if (m.item) items.push(m.item);
  }
  return { coins, items };
}

/**
 * Fine partita, in una scrittura sola: monete della partita, scrigno e progresso delle sfide di oggi.
 * result = { won, unique, mode, rank, players, humans }. Se lo scrigno non può arrivare (giorno non ancora
 * registrato, dieci scrigni già presi) si danno comunque le monete della partita e si segna il progresso.
 * Restituisce { coins, chest: {kind, coins, item?}|null, done: ids delle sfide completate }.
 */
export async function finishGame(db, uid, { result, today, rng = Math.random }) {
  const base = gameCoins(result);
  const attempt = async (withChest) => {
    let out = null;
    const res = await runTransaction(userRef(db, uid), (cur) => {
      if (!cur) return cur;
      const sameDay = cur.lastDay === today;
      const used = cur.scrigni && cur.scrigni.g === today ? cur.scrigni.n : 0;
      const chest = withChest && sameDay && used < EARN.scrigniGiorno ? rollChest(rng, cur.owned || {}) : null;
      const done = sameDay ? completed(today, result) : [];
      const next = { ...cur, coins: cur.coins + base + (chest ? chest.coins : 0), lastEarn: serverTimestamp() };
      if (chest) next.scrigni = { g: today, n: used + 1 };
      if (chest && chest.item) next.owned = { ...cur.owned, [chest.item]: true };
      if (done.length) next.sfideFatte = { ...cur.sfideFatte, [today]: { ...(cur.sfideFatte || {})[today], ...Object.fromEntries(done.map((id) => [id, true])) } };
      out = { coins: base + (chest ? chest.coins : 0), chest, done };
      return next;
    }, { applyLocally: false });
    if (!res.committed) throw new Error('nessun profilo');
    return out;
  };
  try { return await attempt(true); } catch (e) { return attempt(false); } // se le regole non accettano lo scrigno, resta la partita
}

/**
 * Riscuote una sfida di oggi già completata: 'ok', 'già' (presa) o 'non fatta' (non è una sfida di oggi o non è
 * stata completata). L'ultima delle tre porta anche il bonus. Il segno claims/{uid}/s_{giorno}_{id} impedisce il bis.
 */
export async function claimChallenge(db, uid, today, id) {
  const sfida = challengesFor(today).find((c) => c.id === id);
  const cur = (await get(userRef(db, uid))).val();
  if (!sfida || !cur || cur.lastDay !== today || !(cur.sfideFatte || {})[today]?.[id]) return 'non fatta';
  const key = `s_${today}_${id}`;
  const claimed = Object.keys((await get(ref(db, `claims/${uid}`))).val() || {});
  if (claimed.includes(key)) return 'già';
  const all = challengesFor(today).every((c) => c.id === id || claimed.includes(`s_${today}_${c.id}`));
  const coins = sfida.reward + (all ? ALL_DONE_BONUS : 0);
  await update(ref(db), {
    [`users/${uid}/coins`]: cur.coins + coins,
    [`users/${uid}/lastSfida`]: serverTimestamp(),
    [`users/${uid}/ultimaSfida`]: key,
    [`claims/${uid}/${key}`]: true,
  });
  return 'ok';
}
