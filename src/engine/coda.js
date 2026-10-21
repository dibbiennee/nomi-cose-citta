// Coda della partita veloce. Chi cerca partita scrive la sua voce in queue/{uid}; tutti leggono la coda, quindi
// tutti sanno chi organizza: la voce libera più vecchia. L'organizzatore crea la stanza veloce e assegna i giocatori
// con una transazione su queue/{uid}/room, che riesce solo se è vuota: nessuno finisce in due stanze.
import { ref, onValue, set, remove, runTransaction, onDisconnect, serverTimestamp } from 'firebase/database';

export const QUICK_SIZE = 4;
export const BOT_WAIT_MS = 20000; // dopo questa attesa della voce più vecchia si parte con chi c'è, e i robot completano
export const JOIN_WAIT_MS = 10000; // l'host aspetta al massimo questo tempo chi è stato assegnato

export const STALE_EXTRA_MS = 5000; // una voce libera oltre attesa + questo margine è di un telefono che non risponde

/** Voci libere in ordine di arrivo. Con `now`, senza quelle ferme da troppo (il loro telefono non organizza più). */
const free = (queue, now, waitMs = BOT_WAIT_MS) => Object.entries(queue || {})
  .filter(([, e]) => e && !e.room && typeof e.at === 'number' && (now === undefined || now - e.at <= waitMs + STALE_EXTRA_MS))
  .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));

/** Chi organizza la prossima partita: la voce libera più vecchia (a parità, uid minore). */
export function organizer(queue, now, waitMs = BOT_WAIT_MS) {
  const list = free(queue, now, waitMs);
  return list.length ? list[0][0] : null;
}

/** Il gruppo da mettere in stanza adesso, oppure null se conviene aspettare ancora. */
export function nextGroup(queue, now, waitMs = BOT_WAIT_MS) {
  const list = free(queue, now, waitMs);
  if (list.length >= QUICK_SIZE) return list.slice(0, QUICK_SIZE).map(([uid]) => uid);
  if (list.length && now - list[0][1].at >= waitMs) return list.map(([uid]) => uid);
  return null;
}

/**
 * La coda per questo telefono. join(profile, onState) entra e chiama onState({ waiting, oldestAt, room }):
 * room è il codice della stanza quando questo telefono è stato assegnato. leave() esce dalla coda.
 * isOrganizer(queue, now) si può sostituire nei test per far organizzare due telefoni insieme.
 */
export function createQueue(db, engine, uid, { waitMs = BOT_WAIT_MS, isOrganizer } = {}) {
  // Organizza sempre una sola voce: la più vecchia tra quelle che rispondono (vedi free).
  const shouldOrganize = isOrganizer || ((queue, now) => organizer(queue, now, waitMs) === uid);
  const entry = (p) => ({
    name: String(p.name || 'Giocatore').trim().slice(0, 14) || 'Giocatore', color: p.color | 0, face: p.face | 0,
    ...(p.char ? { char: p.char } : {}), at: serverTimestamp(),
  });
  const me = ref(db, `queue/${uid}`);
  let off = null, timer = null, busy = false, last = null, profile = null, done = false;

  async function organize(queue) {
    const group = nextGroup(queue, engine.now(), waitMs);
    if (!group || busy || done) return;
    busy = true;
    try {
      const code = await engine.createQuickRoom(profile);
      if (done) { await engine.leaveRoom(code).catch(() => {}); return; } // ha annullato mentre preparavo la stanza
      const claim = (u) => runTransaction(ref(db, `queue/${u}/room`), (cur) => (cur === null ? code : undefined), { applyLocally: false })
        .then((r) => r.committed, () => false);
      // Prima gli altri, tutti insieme, e per ultimo sé stesso: finché la propria voce è libera si resta
      // l'organizzatore, così nessun altro telefono crea nel frattempo una seconda stanza per le stesse persone.
      const others = (await Promise.all(group.filter((u) => u !== uid).map(claim))).filter(Boolean).length;
      // Ha annullato durante le assegnazioni: esco dalla stanza (se resta vuota si chiude e gli altri tornano in coda).
      if (done) { await engine.leaveRoom(code).catch(() => {}); return; }
      const mine = group.includes(uid) ? await claim(uid) : false;
      if (!mine) {
        // Un altro organizzatore mi ha assegnato alla sua stanza mentre preparavo la mia. Se nella mia ho già messo
        // qualcuno resto con loro (correggo la mia voce: nell'altra stanza il mio posto lo prende un robot);
        // se la mia è vuota la chiudo e vado nell'altra.
        if (others > 0) await set(ref(db, `queue/${uid}/room`), code).catch(() => {});
        else await engine.leaveRoom(code).catch(() => {});
      }
    } catch (e) { /* si riprova al prossimo giro */ } finally { busy = false; }
  }

  function check(onState) {
    if (done || !last || busy) return; // mentre organizzo non mi considero ancora assegnato
    const mine = last[uid];
    if (mine?.room) { done = true; stop(); onState({ waiting: 0, room: mine.room }); return; }
    // La mia voce è ferma da troppo (app in secondo piano): rientro in coda con una voce nuova.
    if (mine && !mine.room && engine.now() - mine.at > waitMs + STALE_EXTRA_MS && !busy) {
      busy = true;
      remove(me).then(() => set(me, entry(profile))).catch(() => {}).finally(() => { busy = false; });
      return;
    }
    const list = free(last, engine.now(), waitMs);
    onState({ waiting: list.length, oldestAt: list.length ? list[0][1].at : null, room: null });
    if (shouldOrganize(last, engine.now())) organize(last);
  }

  function stop() {
    if (off) off();
    off = null;
    clearInterval(timer);
    timer = null;
  }

  return {
    async join(p, onState) {
      profile = p;
      done = false;
      await onDisconnect(me).remove();
      await remove(me).catch(() => {}); // una voce vecchia (pagina ricaricata) non deve bloccare il rientro
      await set(me, entry(p));
      off = onValue(ref(db, 'queue'), (s) => { last = s.val() || {}; check(onState); });
      // Anche senza novità nella coda il tempo passa: ogni secondo si ricontrolla l'attesa.
      timer = setInterval(() => check(onState), 1000);
    },
    /** Assegnato a una stanza che non si raggiunge: si torna in coda con la stessa voce. */
    async requeue(onState) {
      done = false;
      await remove(ref(db, `queue/${uid}/room`)).catch(() => {});
      off = onValue(ref(db, 'queue'), (s) => { last = s.val() || {}; check(onState); });
      timer = setInterval(() => check(onState), 1000);
    },
    async leave() {
      done = true;
      stop();
      await onDisconnect(me).cancel().catch(() => {});
      await remove(me).catch(() => {});
    },
  };
}
