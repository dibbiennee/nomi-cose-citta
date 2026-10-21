// Motore multiplayer su Firebase Realtime Database (SDK modulare v9+).
// Uso: const engine = createEngine(db, uid)  (db = getDatabase(app), uid = auth.currentUser.uid, va bene l'accesso anonimo).
//
// Struttura dati  rooms/{CODE}:
//   hostId, status ('lobby'|'spin'|'play'|'review'|'round'|'awards'|'final'), createdAt
//   settings   { cats:[{key,label,color}], rounds, maxPlayers, timer, hard }
//   players    { [uid]: { name, color, face, joinedAt, score, stats:{stops,uniq,dup}, waiting } }
//   presence   { [uid]: true | false }   online/offline, in un ramo a parte (vedi trackPresence)
//   round      { n, letter, used:[...], startsAt, endsAt, stoppedBy, stoppedAt, stepAt, reviewIdx, points:{[uid]:n} }
//              stepAt = ora dell'ultimo passo della partita: serve a capire se l'host si è fermato
//   answers    { [uid]: { [catKey]: "parola" } }
//   votes      { [catKey]: { [targetUid]: { [voterUid]: true } } }
//   reactions  { [uid]: { text, at } }      una alla volta per giocatore
//   kicked     { [uid]: true }

import {
  ref, get, set, update, remove, onValue, query, orderByChild, limitToFirst, onDisconnect, runTransaction, serverTimestamp,
} from 'firebase/database';
import {
  DEFAULT_SETTINGS, DEFAULT_CATEGORIES, makeCode, pickLetter, scoreRound, nextHost, sanitizeSettings,
} from './rules.js';
import { isReservedCode } from '../club/fondatore.js';
import { CHARACTER_IDS } from '../club/contenuti.js';
import { dueAnswers, dueStop, botVotesFor, pickBots, seededRandom } from './robotOnline.js';

export const SPIN_MS = 2000; // la lettera che gira
export const COUNTDOWN_MS = 3200; // 3, 2, 1, Via!
export const STOP_GRACE_MS = 3000; // dopo lo STOP si possono ancora salvare le ultime lettere scritte
export const HOST_GRACE_MS = 4000; // l'host che ricarica la pagina non perde il posto
export const IDLE_MS = 60000; // l'host collegato che non va avanti per un minuto passa il posto (lo stesso valore è in database.rules.json)
/** Fasi in cui la partita aspetta l'host. */
export const HOST_STEPS = ['review', 'round', 'awards'];

export class RoomError extends Error {
  /** code: 'notfound' | 'full' | 'kicked' | 'nothost' | 'few' */
  constructor(code) { super(code); this.code = code; }
}

/** Impostazioni della partita veloce: fisse, nessuno le sceglie. */
export const QUICK_SETTINGS = { cats: DEFAULT_CATEGORIES.slice(0, 3), rounds: 3, timer: 90, hard: true, maxPlayers: 4 };

/** Giocatori umani (senza i robot della partita veloce), con presence: i robot non diventano mai host. */
function humans(room) {
  return Object.fromEntries(Object.entries(withPresence(room)).filter(([, p]) => !p.bot));
}

/** Giocatori con il campo `online` preso da presence. Chi non ha presence conta come online. */
export function withPresence(room) {
  const out = {};
  for (const [id, p] of Object.entries(room?.players || {})) {
    out[id] = { ...p, online: room.presence?.[id] !== false };
  }
  return out;
}

/** Chi gioca il round: in stanza, non in attesa, online. Gli altri prendono 0. */
export function activeIds(room) {
  return Object.entries(withPresence(room)).filter(([, p]) => !p.waiting && p.online).map(([id]) => id);
}

export function createEngine(db, uid) {
  const roomRef = (code, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);
  let serverOffset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { serverOffset = s.val() || 0; });
  /** Ora del server: usala per il timer, così è uguale su tutti i telefoni. */
  const now = () => Date.now() + serverOffset;

  const newPlayer = (profile, extra = {}) => ({
    name: String(profile.name || 'Giocatore').trim().slice(0, 14) || 'Giocatore',
    color: profile.color | 0, face: profile.face | 0,
    joinedAt: serverTimestamp(), score: 0,
    stats: { stops: 0, uniq: 0, dup: 0 },
    ...(CHARACTER_IDS.includes(profile.char) ? { char: profile.char } : {}), // personaggio del club, se scelto
    ...extra,
  });

  async function readRoom(code) {
    const snap = await get(roomRef(code));
    if (!snap.exists() || !snap.val().players) throw new RoomError('notfound');
    return snap.val();
  }
  async function requireHost(code) {
    const room = await readRoom(code);
    if (room.hostId !== uid) throw new RoomError('nothost');
    return room;
  }

  // Nelle transazioni, cur === null al primo giro vuol dire "non ancora letto": si restituisce null
  // e Firebase riprova con il valore vero del server. Restituire undefined annullerebbe tutto.

  // Presenza: un solo ascolto alla volta. Sta in presence/{uid} e non dentro players/{uid}:
  // così chi esce o viene rimosso non viene ricreato a metà quando si disconnette.
  let presence = null;
  function trackPresence(code) {
    stopPresence();
    const me = roomRef(code, `presence/${uid}`);
    let connected = false;
    const offConn = onValue(ref(db, '.info/connected'), (s) => {
      connected = s.val() === true;
      if (!connected) return;
      onDisconnect(me).set(false).then(() => set(me, true)).catch(() => {});
    });
    // Ricaricando la pagina, il "false" della connessione vecchia può arrivare dopo il "true" di quella nuova:
    // se mi vedo offline mentre sono collegato, mi rimetto online.
    const offSelf = onValue(me, (s) => {
      if (connected && s.val() === false) set(me, true).catch(() => {});
    });
    presence = { me, off: () => { offConn(); offSelf(); } };
  }
  function stopPresence() {
    if (!presence) return;
    presence.off();
    onDisconnect(presence.me).cancel().catch(() => {});
    presence = null;
  }

  /** Pulizia senza server: chi crea una stanza cancella fino a 5 stanze create più di 12 ore fa. */
  const OLD_MS = 12 * 3600 * 1000;
  async function cleanOldRooms() {
    try {
      // Le regole permettono solo di leggere le 5 stanze più vecchie; si cancellano quelle oltre le 12 ore.
      const snap = await get(query(ref(db, 'rooms'), orderByChild('createdAt'), limitToFirst(5)));
      const patch = {};
      snap.forEach((r) => { if ((r.val().createdAt || 0) < now() - OLD_MS - 60000) patch[r.key] = null; });
      // Una cancellazione alla volta: se una fallisce (stanza appena toccata) le altre passano lo stesso.
      await Promise.all(Object.keys(patch).map((k) => remove(roomRef(k)).catch(() => {})));
      return Object.keys(patch).length;
    } catch (e) { return 0; }
  }

  return {
    uid,
    now,
    cleanOldRooms,

    /** Crea una stanza e ne restituisce il codice. */
    async createRoom(profile, settings = DEFAULT_SETTINGS, quick = false) {
      for (let i = 0; i < 8; i++) {
        const code = makeCode();
        if (isReservedCode(code)) continue; // CANT e gli altri codici speciali non diventano mai stanze
        const res = await runTransaction(roomRef(code), (cur) => {
          if (cur !== null) return; // codice già in uso: riprova con un altro
          return {
            hostId: uid, status: 'lobby', createdAt: serverTimestamp(),
            settings: sanitizeSettings(settings),
            players: { [uid]: newPlayer(profile) },
            presence: { [uid]: true },
            ...(quick ? { quick: true } : {}),
          };
        }, { applyLocally: false });
        if (res.committed) { trackPresence(code); cleanOldRooms(); return code; }
      }
      throw new Error('Impossibile creare la stanza, riprova');
    },

    /** Stanza della partita veloce: impostazioni fisse e segno quick (permette i robot). */
    createQuickRoom(profile) { return this.createRoom(profile, QUICK_SETTINGS, true); },

    /** Solo host, partita veloce: completa la stanza con n robot (bot1..botN), sempre online. */
    async addBots(code, count) {
      const room = await requireHost(code);
      if (!room.quick || count <= 0) return;
      const names = Object.values(room.players).map((p) => p.name);
      const patch = {};
      pickBots(count, names, seededRandom(code, 'robot')).forEach((b) => {
        patch[`players/${b.id}`] = { ...newPlayer(b), bot: true };
        patch[`presence/${b.id}`] = true;
      });
      await update(roomRef(code), patch);
    },

    /**
     * Partita veloce: tocca a questo telefono far giocare i robot? All'host, se è collegato; se l'host è
     * scollegato, al primo umano online. Se le scritture dovute dei robot sono in ritardo, a tutti gli umani
     * (scrivono le stesse cose, quindi scriverle due volte non cambia niente).
     */
    shouldDriveBots(code, room, at, dict) {
      if (!room?.quick || !room.players?.[uid] || room.players[uid].bot) return false;
      const bots = Object.keys(room.players).filter((id) => room.players[id].bot);
      if (!bots.length || !['play', 'review'].includes(room.status)) return false;
      if (room.hostId === uid && room.presence?.[uid] !== false) return true;
      if (room.presence?.[room.hostId] === false || !room.players[room.hostId]) return nextHost(humans(room), room.hostId) === uid;
      // Host collegato ma fermo (app in secondo piano): se da 4 secondi mancano risposte dovute, scrivono tutti.
      if (!dict || room.status !== 'play') return false;
      return bots.some((id) => Object.keys(dueAnswers(room, code, id, dict, at - 4000)).length > Object.keys(room.answers?.[id] || {}).length);
    },

    /** Scrive quello che i robot devono aver fatto adesso: risposte, STOP, voti. Si può chiamare più volte. */
    async driveBots(code, room, dict) {
      if (!room?.quick || !room.round) return;
      const t = now();
      const bots = Object.keys(room.players).filter((id) => room.players[id].bot);
      const inGrace = room.status === 'review' && (room.round.stoppedAt || 0) + 3000 > t;
      if (room.status === 'play' || inGrace) {
        for (const id of bots) {
          const due = dueAnswers(room, code, id, dict, t);
          if (Object.keys(due).length && JSON.stringify(due) !== JSON.stringify(room.answers?.[id] || {})) {
            await set(roomRef(code, `answers/${id}`), due).catch(() => {});
          }
        }
      }
      if (room.status === 'play') {
        const stopper = dueStop(room, code, dict, t);
        if (stopper) await this.closeRound(code, stopper).catch(() => {});
      }
      if (room.status === 'review') {
        for (const v of botVotesFor(room, code, dict)) {
          if (!room.votes?.[v.cat]?.[v.target]?.[v.voter]) await set(roomRef(code, `votes/${v.cat}/${v.target}/${v.voter}`), true).catch(() => {});
        }
      }
    },

    /** Legge la stanza senza entrare (per la schermata di invito). Lancia RoomError('notfound'). */
    peekRoom: readRoom,

    /** Entra in una stanza (da codice o da link /r/CODICE). Lancia RoomError('notfound'|'full'|'kicked'). */
    async joinRoom(code, profile) {
      code = String(code || '').toUpperCase();
      const room = await readRoom(code);
      const players = room.players || {};
      if (room.kicked?.[uid]) throw new RoomError('kicked');
      const waiting = !players[uid] && room.status !== 'lobby';
      if (!players[uid]) {
        if (Object.keys(players).length >= (room.settings?.maxPlayers || 8)) throw new RoomError('full');
        // Chi arriva a partita iniziata aspetta e gioca dal round successivo.
        await update(roomRef(code), {
          [`players/${uid}`]: newPlayer(profile, waiting ? { waiting: true } : {}),
          [`presence/${uid}`]: true,
        });
      } else {
        // Rientro (pagina ricaricata, link riaperto): il profilo nella stanza resta quello scelto entrando.
        await set(roomRef(code, `presence/${uid}`), true);
      }
      trackPresence(code);
      return { code, waiting };
    },

    /**
     * Ascolta la stanza in tempo reale. onChange(room | null); null = stanza chiusa.
     * Si occupa anche del cambio di host quando l'host resta offline. Restituisce la funzione per smettere.
     */
    subscribe(code, onChange) {
      let timer = null;
      const off = onValue(roomRef(code), (snap) => {
        const room = snap.val();
        clearTimeout(timer);
        if (room && room.players) {
          const hostGone = !room.players[room.hostId] || room.presence?.[room.hostId] === false;
          if (hostGone) {
            const oldHost = room.hostId;
            const heir = nextHost(humans(room), oldHost);
            // Aspetto un attimo: se l'host ha solo ricaricato la pagina torna online prima.
            if (heir === uid) timer = setTimeout(() => this.claimHost(code, oldHost), room.players[oldHost] ? HOST_GRACE_MS : 0);
          } else if (HOST_STEPS.includes(room.status) && room.round?.stepAt) {
            // L'host è collegato ma non va avanti: dopo un minuto il primo giocatore online dopo di lui prende il posto.
            const heir = nextHost(humans(room), room.hostId);
            if (heir === uid) {
              const wait = room.round.stepAt + IDLE_MS - now() + 500;
              timer = setTimeout(() => this.claimIdleHost(code, room.hostId, room.round.stepAt), Math.max(0, wait));
            }
          }
        }
        onChange(room);
      });
      return () => { clearTimeout(timer); off(); };
    },

    /** Diventa host al posto di oldHost, se nel frattempo nessuno l'ha già fatto. */
    async claimHost(code, oldHost) {
      const room = await readRoom(code).catch(() => null);
      if (!room || room.hostId !== oldHost) return;
      if (room.players[oldHost] && room.presence?.[oldHost] !== false) return; // è tornato
      if (nextHost(humans(room), oldHost) !== uid) return;
      await runTransaction(roomRef(code, 'hostId'), (cur) => (cur === null ? null : cur === oldHost ? uid : undefined));
    },

    /** Prende il posto di un host collegato ma fermo da più di un minuto. */
    async claimIdleHost(code, oldHost, stepAt) {
      const room = await readRoom(code).catch(() => null);
      if (!room || room.hostId !== oldHost || room.round?.stepAt !== stepAt || !HOST_STEPS.includes(room.status)) return;
      if (nextHost(humans(room), oldHost) !== uid) return;
      const res = await runTransaction(roomRef(code, 'hostId'), (cur) => (cur === null ? null : cur === oldHost ? uid : undefined));
      // Il nuovo host ha a sua volta un minuto pieno.
      if (res.committed) await set(roomRef(code, 'round/stepAt'), serverTimestamp()).catch(() => {});
    },

    async updateProfile(code, profile) {
      await update(roomRef(code, `players/${uid}`), {
        name: String(profile.name || '').trim().slice(0, 14) || 'Giocatore', color: profile.color | 0, face: profile.face | 0,
      });
    },

    async leaveRoom(code) {
      stopPresence();
      const room = await readRoom(code).catch(() => null);
      if (!room || !room.players?.[uid]) return;
      const others = Object.keys(humans(room)).filter((id) => id !== uid); // i robot non contano
      const patch = { [`players/${uid}`]: null, [`answers/${uid}`]: null, [`presence/${uid}`]: null };
      // L'ultimo a uscire chiude la stanza (solo l'host può cancellarla: se non lo è, esce e basta).
      if (others.length === 0 && room.hostId === uid) { await remove(roomRef(code)); return; }
      if (room.hostId === uid) patch.hostId = nextHost(humans(room), uid) || others[0];
      await update(roomRef(code), patch);
    },

    /** Smette di tracciare la presenza senza uscire (per esempio quando si viene rimossi). */
    forget() { stopPresence(); },

    // ---------- solo host ----------

    async updateSettings(code, settings) {
      await requireHost(code);
      await set(roomRef(code, 'settings'), sanitizeSettings(settings));
    },

    async kickPlayer(code, playerId) {
      await requireHost(code);
      if (playerId === uid) return;
      await update(roomRef(code), {
        [`players/${playerId}`]: null, [`answers/${playerId}`]: null, [`presence/${playerId}`]: null, [`kicked/${playerId}`]: true,
      });
    },

    /** Avvia la partita (o la rivincita): azzera i punteggi ed estrae la prima lettera. */
    async startGame(code) {
      const room = await requireHost(code);
      const online = Object.values(withPresence(room)).filter((p) => p.online);
      if (online.length < 2) throw new RoomError('few');
      const patch = {};
      for (const id of Object.keys(room.players || {})) {
        patch[`players/${id}/score`] = 0;
        patch[`players/${id}/stats`] = { stops: 0, uniq: 0, dup: 0 };
      }
      await update(roomRef(code), patch);
      await this.drawLetter(code, 1, []);
    },

    /**
     * Estrae la lettera e fissa per tutti l'orario di inizio e di fine del round.
     * Ogni telefono mostra animazione e conto alla rovescia, poi chiama goPlay quando now() >= round.startsAt.
     */
    async drawLetter(code, n, used) {
      const room = await requireHost(code);
      const letter = pickLetter(used, room.settings.hard);
      const startsAt = now() + SPIN_MS + COUNTDOWN_MS;
      const patch = {
        status: 'spin', answers: null, votes: null, reactions: null,
        round: {
          n, letter, used: [...used, letter], startsAt,
          endsAt: room.settings.timer ? startsAt + room.settings.timer * 1000 : 0, reviewIdx: 0, stepAt: serverTimestamp(),
        },
      };
      for (const id of Object.keys(room.players || {})) patch[`players/${id}/waiting`] = null;
      await update(roomRef(code), patch);
    },

    // ---------- tutti i giocatori ----------

    /** Fine del conto alla rovescia: lo chiama ogni telefono, passa solo il primo. Non dipende dall'host. */
    async goPlay(code) {
      await runTransaction(roomRef(code, 'status'), (cur) => (cur === null ? null : cur === 'spin' ? 'play' : undefined), { applyLocally: false });
    },

    /** Salva le risposte mentre si scrive (chiamala con un ritardo di ~300 ms dopo l'ultimo tasto). */
    async saveAnswers(code, answers) {
      await set(roomRef(code, `answers/${uid}`), answers);
    },

    /** STOP: vince il primo che arriva. Restituisce true se sei stato tu a fermare il round. */
    async pressStop(code, answers) {
      if (answers) await this.saveAnswers(code, answers);
      return this.closeRound(code, uid);
    },

    /** Tempo scaduto: lo chiama qualunque telefono quando now() >= round.endsAt. Ne passa solo uno. */
    async timeUp(code) {
      return this.closeRound(code, 'time');
    },

    async closeRound(code, by) {
      const res = await runTransaction(roomRef(code, 'round/stoppedBy'), (cur) => (cur ? undefined : by), { applyLocally: false });
      if (!res.committed) return false;
      await this.finishStop(code);
      return true;
    },

    /**
     * Porta il round in correzione dopo lo STOP. Lo fa chi ha fermato il round; se perde la connessione
     * proprio in quel momento (stoppedBy scritto, stato ancora 'play'), lo fa un altro telefono.
     */
    async finishStop(code) {
      await update(roomRef(code), { status: 'review', 'round/stoppedAt': serverTimestamp(), 'round/stepAt': serverTimestamp() });
    },

    /** Vota "non vale" (o toglie il voto) sulla parola di un altro. */
    async vote(code, catKey, targetId, against) {
      if (targetId === uid) return;
      await set(roomRef(code, `votes/${catKey}/${targetId}/${uid}`), against ? true : null);
    },

    async react(code, text) {
      // Una reazione per giocatore alla volta (le regole ne accettano una ogni 1,5 secondi).
      await set(roomRef(code, `reactions/${uid}`), { text: String(text).slice(0, 20) || '?', at: serverTimestamp() });
    },

    // ---------- solo host: avanzamento ----------

    /** Categoria successiva nella correzione; dopo l'ultima calcola i punti e mostra "Fine round". */
    async nextCategory(code) {
      const room = await requireHost(code);
      if (room.status !== 'review') return;
      const cats = room.settings.cats;
      const idx = room.round.reviewIdx || 0;
      if (idx < cats.length - 1) { await update(roomRef(code), { 'round/reviewIdx': idx + 1, 'round/stepAt': serverTimestamp() }); return; }
      // Contano solo i giocatori online e non in attesa: chi è caduto prende 0, come una risposta vuota.
      const ids = activeIds(room);
      const { points, stats } = scoreRound(ids, cats.map((c) => c.key), room.answers || {}, room.votes || {}, room.round.letter);
      const patch = { status: 'round', 'round/points': points, 'round/stepAt': serverTimestamp() };
      for (const id of ids) {
        const p = room.players[id];
        patch[`players/${id}/score`] = (p.score || 0) + points[id];
        patch[`players/${id}/stats/uniq`] = (p.stats?.uniq || 0) + stats[id].uniq;
        patch[`players/${id}/stats/dup`] = (p.stats?.dup || 0) + stats[id].dup;
      }
      // Gli STOP li conta l'host qui, insieme ai punti: un giocatore non può scriverseli da solo.
      const by = room.round.stoppedBy;
      if (by && by !== 'time' && room.players[by]) patch[`players/${by}/stats/stops`] = (room.players[by].stats?.stops || 0) + 1;
      await update(roomRef(code), patch);
    },

    /** Lettera successiva, oppure i premi se era l'ultimo round. */
    async nextRound(code) {
      const room = await requireHost(code);
      if (room.status !== 'round') return;
      if (room.round.n < room.settings.rounds) await this.drawLetter(code, room.round.n + 1, room.round.used || []);
      else await update(roomRef(code), { status: 'awards', 'round/stepAt': serverTimestamp() });
    },

    async showPodium(code) {
      const room = await requireHost(code);
      if (room.status === 'awards') await update(roomRef(code), { status: 'final' });
    },
    async rematch(code) { await this.startGame(code); },
    /** Fine partita: si torna in lobby, dove l'host può cambiare categorie e round prima di rigiocare. */
    async backToLobby(code) {
      await requireHost(code);
      await update(roomRef(code), { status: 'lobby', round: null, answers: null, votes: null, reactions: null });
    },
  };
}
