// Coda della partita veloce. Chi cerca partita scrive la sua voce in queue/{uid}; tutti leggono la coda, quindi
// tutti sanno chi organizza: la voce libera più vecchia. L'organizzatore crea la stanza veloce e assegna i giocatori
// con una transazione su queue/{uid}/room, che riesce solo se è vuota: nessuno finisce in due stanze.
import { ref, onValue, set, remove, runTransaction, onDisconnect, serverTimestamp } from 'firebase/database';

export const QUICK_SIZE = 4;
export const BOT_WAIT_MS = 20000; // dopo questa attesa della voce più vecchia si parte con chi c'è, e i robot completano
export const JOIN_WAIT_MS = 10000; // l'host aspetta al massimo questo tempo chi è stato assegnato

const free = (queue) => Object.entries(queue || {})
  .filter(([, e]) => e && !e.room && typeof e.at === 'number')
  .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));

/** Chi organizza la prossima partita: la voce libera più vecchia (a parità, uid minore). */
export function organizer(queue) {
  const list = free(queue);
  return list.length ? list[0][0] : null;
}

/** Il gruppo da mettere in stanza adesso, oppure null se conviene aspettare ancora. */
export function nextGroup(queue, now, waitMs = BOT_WAIT_MS) {
  const list = free(queue);
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
  // Organizza la voce più vecchia. Se dopo l'attesa più 5 secondi non l'ha fatto (app in secondo piano, telefono
  // appeso), organizzano tutti: le transazioni su room impediscono comunque che qualcuno finisca in due stanze.
  const shouldOrganize = isOrganizer || ((queue, now) => {
    if (organizer(queue) === uid) return true;
    const list = free(queue);
    return list.length > 0 && now - list[0][1].at > waitMs + 5000;
  });
  const me = ref(db, `queue/${uid}`);
  let off = null, timer = null, busy = false, last = null, profile = null, done = false;

  async function organize(queue) {
    const group = nextGroup(queue, engine.now(), waitMs);
    if (!group || busy || done) return;
    busy = true;
    try {
      const code = await engine.createQuickRoom(profile);
      let mine = false;
      for (const u of group) {
        const res = await runTransaction(ref(db, `queue/${u}/room`), (cur) => (cur === null ? code : undefined), { applyLocally: false }).catch(() => null);
        if (u === uid && res?.committed) mine = true;
      }
      // Un altro organizzatore mi ha preso prima: la stanza creata resta vuota, la chiudo.
      if (!mine) await engine.leaveRoom(code).catch(() => {});
    } catch (e) { /* si riprova al prossimo giro */ } finally { busy = false; }
  }

  function check(onState) {
    if (done || !last) return;
    const mine = last[uid];
    if (mine?.room) { done = true; stop(); onState({ waiting: 0, room: mine.room }); return; }
    const list = free(last);
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
      await set(me, {
        name: String(p.name || 'Giocatore').trim().slice(0, 14) || 'Giocatore', color: p.color | 0, face: p.face | 0,
        ...(p.char ? { char: p.char } : {}), at: serverTimestamp(),
      });
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
