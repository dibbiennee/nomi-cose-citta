// Motore multiplayer su Firebase Realtime Database (SDK modulare v9+).
// Uso: const engine = createEngine(db, uid)  — db = getDatabase(app), uid = auth.currentUser.uid (va bene l'accesso anonimo).
//
// Struttura dati  rooms/{CODE}:
//   hostId, status ('lobby'|'spin'|'play'|'review'|'round'|'awards'|'final'), createdAt
//   settings   { cats:[{key,label,color}], rounds, maxPlayers, timer, hard }
//   players    { [uid]: { name, color, face, online, joinedAt, score, stats:{stops,uniq,dup}, waiting } }
//   round      { n, letter, used:[...], startsAt, endsAt, stoppedBy, reviewIdx, points:{[uid]:n} }
//   answers    { [uid]: { [catKey]: "parola" } }
//   votes      { [catKey]: { [targetUid]: { [voterUid]: true } } }
//   reactions  { [pushId]: { uid, text, at } }

import {
  ref, get, set, update, remove, push, onValue, onDisconnect, runTransaction, serverTimestamp,
} from 'firebase/database';
import {
  DEFAULT_SETTINGS, makeCode, pickLetter, scoreRound, nextHost, sanitizeSettings,
} from './rules.js';

export const COUNTDOWN_MS = 3200; // 3, 2, 1, Via!
export const SPIN_MS = 2000; // durata dell'animazione della lettera

export class RoomError extends Error {
  /** code: 'notfound' | 'full' | 'kicked' | 'nothost' */
  constructor(code) { super(code); this.code = code; }
}

export function createEngine(db, uid) {
  const roomRef = (code, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);
  let serverOffset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { serverOffset = s.val() || 0; });
  /** Ora del server: usala per il timer, così è uguale su tutti i telefoni. */
  const now = () => Date.now() + serverOffset;

  const newPlayer = (profile, extra = {}) => ({
    name: String(profile.name || 'Giocatore').slice(0, 14),
    color: profile.color | 0, face: profile.face | 0,
    online: true, joinedAt: serverTimestamp(), score: 0,
    stats: { stops: 0, uniq: 0, dup: 0 }, ...extra,
  });

  async function readRoom(code) {
    const snap = await get(roomRef(code));
    if (!snap.exists()) throw new RoomError('notfound');
    return snap.val();
  }
  async function requireHost(code) {
    const room = await readRoom(code);
    if (room.hostId !== uid) throw new RoomError('nothost');
    return room;
  }
  /** Segna il giocatore offline se chiude la pagina o perde la connessione. */
  function trackPresence(code) {
    const online = roomRef(code, `players/${uid}/online`);
    onDisconnect(online).set(false);
    return onValue(ref(db, '.info/connected'), (s) => { if (s.val() === true) { onDisconnect(online).set(false); set(online, true); } });
  }

  return {
    now,

    /** Crea una stanza e ne restituisce il codice. */
    async createRoom(profile, settings = DEFAULT_SETTINGS) {
      for (let i = 0; i < 8; i++) {
        const code = makeCode();
        const res = await runTransaction(roomRef(code), (cur) => {
          if (cur !== null) return; // codice già in uso: riprova con un altro
          return {
            hostId: uid, status: 'lobby', createdAt: serverTimestamp(),
            settings: sanitizeSettings(settings),
            players: { [uid]: newPlayer(profile) },
          };
        });
        if (res.committed) { trackPresence(code); return code; }
      }
      throw new Error('Impossibile creare la stanza, riprova');
    },

    /** Entra in una stanza (da codice o da link /r/CODICE). Lancia RoomError('notfound'|'full'). */
    async joinRoom(code, profile) {
      code = String(code || '').toUpperCase();
      const room = await readRoom(code);
      const players = room.players || {};
      if (!players[uid]) {
        if (Object.keys(players).length >= (room.settings?.maxPlayers || 8)) throw new RoomError('full');
        // Chi arriva a partita iniziata aspetta e gioca dal round successivo.
        await set(roomRef(code, `players/${uid}`), newPlayer(profile, { waiting: room.status !== 'lobby' }));
      } else {
        await update(roomRef(code, `players/${uid}`), { online: true });
      }
      trackPresence(code);
      return { code, waiting: room.status !== 'lobby' && !players[uid] };
    },

    /** Ascolta la stanza in tempo reale. onChange(room | null); null = stanza chiusa. Restituisce la funzione per smettere. */
    subscribe(code, onChange) {
      return onValue(roomRef(code), (snap) => {
        const room = snap.val();
        if (room && room.hostId && room.players && room.players[room.hostId]?.online === false) {
          // L'host è caduto: il primo giocatore online prende il suo posto.
          const heir = nextHost(room.players, room.hostId);
          if (heir === uid) update(roomRef(code), { hostId: uid });
        }
        onChange(room);
      });
    },

    async updateProfile(code, profile) {
      await update(roomRef(code, `players/${uid}`), { name: String(profile.name || '').slice(0, 14), color: profile.color | 0, face: profile.face | 0 });
    },

    async leaveRoom(code) {
      const room = await readRoom(code).catch(() => null);
      if (!room) return;
      const others = Object.keys(room.players || {}).filter((id) => id !== uid);
      if (others.length === 0) { await remove(roomRef(code)); return; }
      const patch = { [`players/${uid}`]: null, [`answers/${uid}`]: null };
      if (room.hostId === uid) patch.hostId = nextHost(room.players, uid) || others[0];
      await update(roomRef(code), patch);
    },

    // ---------- solo host ----------

    async updateSettings(code, settings) {
      await requireHost(code);
      await set(roomRef(code, 'settings'), sanitizeSettings(settings));
    },

    async kickPlayer(code, playerId) {
      await requireHost(code);
      await update(roomRef(code), { [`players/${playerId}`]: null, [`answers/${playerId}`]: null, [`kicked/${playerId}`]: true });
    },

    /** Avvia la partita (o la rivincita): azzera i punteggi ed estrae la prima lettera. */
    async startGame(code) {
      const room = await requireHost(code);
      const patch = {};
      for (const id of Object.keys(room.players || {})) {
        patch[`players/${id}/score`] = 0;
        patch[`players/${id}/stats`] = { stops: 0, uniq: 0, dup: 0 };
        patch[`players/${id}/waiting`] = null;
      }
      await update(roomRef(code), patch);
      await this.drawLetter(code, 1, []);
    },

    /** Estrae la lettera e fissa per tutti l'orario di inizio e di fine del round. */
    async drawLetter(code, n, used) {
      const room = await requireHost(code);
      const letter = pickLetter(used, room.settings.hard);
      const startsAt = now() + SPIN_MS + COUNTDOWN_MS;
      const patch = { status: 'spin', answers: null, votes: null, reactions: null,
        round: { n, letter, used: [...used, letter], startsAt, endsAt: room.settings.timer ? startsAt + room.settings.timer * 1000 : 0, stoppedBy: null, reviewIdx: 0 } };
      for (const id of Object.keys(room.players || {})) patch[`players/${id}/waiting`] = null;
      await update(roomRef(code), patch);
      // Ogni telefono mostra animazione e conto alla rovescia, e passa alla schermata di gioco quando now() >= round.startsAt.
      setTimeout(() => update(roomRef(code), { status: 'play' }), SPIN_MS + COUNTDOWN_MS);
    },

    // ---------- tutti i giocatori ----------

    /** Salva le risposte mentre si scrive (chiamala con un ritardo di ~300 ms dopo l'ultimo tasto). */
    async saveAnswers(code, answers) {
      await set(roomRef(code, `answers/${uid}`), answers);
    },

    /** STOP: vince il primo che arriva. Restituisce true se sei stato tu a fermare il round. */
    async pressStop(code) {
      const res = await runTransaction(roomRef(code, 'round/stoppedBy'), (cur) => (cur ? undefined : uid));
      if (!res.committed) return false;
      await update(roomRef(code), { status: 'review' });
      await runTransaction(roomRef(code, `players/${uid}/stats/stops`), (n) => (n || 0) + 1);
      return true;
    },

    /** Tempo scaduto: lo chiama qualunque telefono quando now() >= round.endsAt. Ne passa solo uno. */
    async timeUp(code) {
      const res = await runTransaction(roomRef(code, 'round/stoppedBy'), (cur) => (cur ? undefined : 'time'));
      if (res.committed) await update(roomRef(code), { status: 'review' });
    },

    /** Vota "non vale" (o toglie il voto) sulla parola di un altro. */
    async vote(code, catKey, targetId, against) {
      if (targetId === uid) return;
      await set(roomRef(code, `votes/${catKey}/${targetId}/${uid}`), against ? true : null);
    },

    async react(code, text) {
      await push(roomRef(code, 'reactions'), { uid, text: String(text).slice(0, 20), at: serverTimestamp() });
    },

    // ---------- solo host: avanzamento ----------

    /** Categoria successiva nella correzione; dopo l'ultima calcola i punti e mostra "Fine round". */
    async nextCategory(code) {
      const room = await requireHost(code);
      const cats = room.settings.cats;
      const idx = room.round.reviewIdx || 0;
      if (idx < cats.length - 1) { await update(roomRef(code), { 'round/reviewIdx': idx + 1 }); return; }
      const ids = Object.keys(room.players || {}).filter((id) => !room.players[id].waiting);
      const { points, stats } = scoreRound(ids, cats.map((c) => c.key), room.answers || {}, room.votes || {}, room.round.letter);
      const patch = { status: 'round', 'round/points': points };
      for (const id of ids) {
        const p = room.players[id];
        patch[`players/${id}/score`] = (p.score || 0) + points[id];
        patch[`players/${id}/stats/uniq`] = (p.stats?.uniq || 0) + stats[id].uniq;
        patch[`players/${id}/stats/dup`] = (p.stats?.dup || 0) + stats[id].dup;
      }
      await update(roomRef(code), patch);
    },

    /** Lettera successiva, oppure i premi se era l'ultimo round. */
    async nextRound(code) {
      const room = await requireHost(code);
      if (room.round.n < room.settings.rounds) await this.drawLetter(code, room.round.n + 1, room.round.used || []);
      else await update(roomRef(code), { status: 'awards' });
    },

    async showPodium(code) { await requireHost(code); await update(roomRef(code), { status: 'final' }); },
    async rematch(code) { await this.startGame(code); },
    async backToLobby(code) { await requireHost(code); await update(roomRef(code), { status: 'lobby', round: null, answers: null, votes: null, reactions: null }); },
  };
}
