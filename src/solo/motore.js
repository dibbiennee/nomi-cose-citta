// Motore della partita da soli contro i robot. Ha gli stessi metodi del motore online (room.js) e produce
// lo stesso stato della stanza, così le schermate della partita si usano uguali. Tutto resta sul telefono:
// niente Firebase, e lo stato si salva nello storage a ogni passo per riprendere se l'app viene chiusa.
import { scoreRound, pickLetter, sanitizeSettings, startsWithLetter } from '../engine/rules.js';
import { SPIN_MS, COUNTDOWN_MS, STOP_GRACE_MS } from '../engine/room.js';
import { LEVELS, makeBots, planBot, botVote } from './robot.js';
import { pointsPerWord, countsForRecord } from './record.js';
import { CHARACTER_IDS } from '../club/contenuti.js';
import { cleanAcc } from '../shop/accessori.js';

export const SOLO_CODE = 'SOLO';
export const SOLO_KEY = 'ncc-solo-partita';
export const MAX_AGE_MS = 12 * 3600 * 1000;
const ME = 'me';

const clone = (o) => JSON.parse(JSON.stringify(o));
const freshStats = () => ({ stops: 0, uniq: 0, dup: 0 });

function makeEngine({ state, plans, difficulty, botCount, profile, dict, storage, random, clock }) {
  const listeners = new Set();
  const level = LEVELS[difficulty];
  const catKeys = () => state.settings.cats.map((c) => c.key);
  const ids = () => Object.keys(state.players);

  function save() {
    try { storage?.setItem(SOLO_KEY, JSON.stringify({ savedAt: clock(), state, plans, difficulty, botCount, profile })); } catch (e) { /* si gioca lo stesso */ }
  }
  function emit() {
    save();
    const snapshot = clone(state);
    listeners.forEach((f) => f(snapshot));
  }

  /** Le risposte dei robot sono quello che hanno "scritto" fino all'istante cut. */
  function botAnswersUntil(cut) {
    for (const [id, plan] of Object.entries(plans)) {
      const a = {};
      for (const w of plan.writes) if (w.at <= cut) a[w.cat] = w.word;
      state.answers[id] = a;
    }
  }

  /** In correzione: quali parole conosce il dizionario e come votano i robot su una parola di `target`. */
  function judge(target) {
    const letter = state.round.letter;
    for (const cat of catKeys()) {
      const text = (state.answers[target]?.[cat] || '').trim();
      state.solo.known[cat] = state.solo.known[cat] || {};
      delete state.solo.known[cat][target];
      if (state.votes[cat]?.[target]) delete state.votes[cat][target];
      if (!text) continue;
      const wrongLetter = !startsWithLetter(text, letter);
      const known = !wrongLetter && dict.has(cat, text);
      if (known) state.solo.known[cat][target] = true;
      const isBot = target !== ME;
      for (const voter of Object.keys(plans)) {
        if (voter === target) continue;
        if (botVote(level, { known, wrongLetter, authorIsBot: isBot, botError: isBot && !known }, random)) {
          state.votes[cat] = state.votes[cat] || {};
          state.votes[cat][target] = { ...state.votes[cat][target], [voter]: true };
        }
      }
    }
  }

  function closeRound(by, at) {
    if (state.status !== 'play' || state.round.stoppedBy) return;
    botAnswersUntil(at);
    Object.assign(state.round, { stoppedBy: by, stoppedAt: at, stepAt: clock() });
    state.status = 'review';
    state.votes = {};
    state.solo.known = {};
    ids().forEach(judge);
  }

  function drawLetter(n, used) {
    const letter = pickLetter(used, state.settings.hard, random);
    const startsAt = clock() + SPIN_MS + COUNTDOWN_MS;
    state.status = 'spin';
    state.answers = {};
    state.votes = {};
    state.solo.known = {};
    state.round = {
      n, letter, used: [...used, letter], startsAt,
      endsAt: state.settings.timer ? startsAt + state.settings.timer * 1000 : 0, reviewIdx: 0, stepAt: clock(),
    };
    plans = {};
    for (const id of ids()) if (id !== ME) plans[id] = planBot(state.players[id], catKeys(), letter, level, dict, random, startsAt);
  }

  /** Fa avanzare il tempo: scritture dei robot, STOP dei robot, tempo scaduto. L'app la chiama ogni 200 ms. */
  function advance() {
    const now = clock();
    if (state.status === 'spin' && now >= state.round.startsAt) state.status = 'play';
    if (state.status !== 'play') return false;
    // Il primo evento che chiude il round, tra STOP dei robot e fine del tempo, anche se è successo ad app chiusa.
    let first = null;
    for (const [id, plan] of Object.entries(plans)) {
      if (plan.stopAt !== null && plan.stopAt <= now && (!first || plan.stopAt < first.at)) first = { by: id, at: plan.stopAt };
    }
    const { endsAt } = state.round;
    if (endsAt && endsAt <= now && (!first || endsAt < first.at)) first = { by: 'time', at: endsAt };
    if (first) closeRound(first.by, first.at);
    else botAnswersUntil(now);
    return true;
  }

  const step = (fn) => async (...args) => { fn(...args); emit(); };

  return {
    uid: ME,
    difficulty,
    botCount,
    now: () => clock(),
    subscribe(code, onChange) {
      listeners.add(onChange);
      onChange(clone(state));
      return () => listeners.delete(onChange);
    },
    async tick() { const before = JSON.stringify(state); advance(); if (JSON.stringify(state) !== before) emit(); },

    startGame: step(() => {
      for (const id of ids()) Object.assign(state.players[id], { score: 0, stats: freshStats() });
      drawLetter(1, []);
    }),
    rematch(code) { return this.startGame(code); },
    goPlay: step(() => { advance(); }),

    saveAnswers: step((code, answers) => {
      const late = state.status === 'review' && clock() <= (state.round.stoppedAt || 0) + STOP_GRACE_MS;
      if (state.status !== 'play' && !late) return;
      state.answers[ME] = { ...answers };
      if (late) judge(ME);
    }),
    pressStop: step((code, answers) => {
      if (answers) state.answers[ME] = { ...answers };
      advance();
      closeRound(ME, clock());
    }),
    timeUp: step(() => {
      const { endsAt } = state.round || {};
      if (endsAt && clock() >= endsAt) closeRound('time', endsAt);
    }),
    finishStop: async () => {},

    vote: step((code, cat, target, against) => {
      if (state.status !== 'review' || target === ME || state.solo.known[cat]?.[target]) return;
      state.votes[cat] = state.votes[cat] || {};
      const v = { ...state.votes[cat][target] };
      if (against) v[ME] = true; else delete v[ME];
      state.votes[cat][target] = v;
    }),
    react: async () => {},

    nextCategory: step(() => {
      if (state.status !== 'review') return;
      const idx = state.round.reviewIdx || 0;
      if (idx < catKeys().length - 1) { Object.assign(state.round, { reviewIdx: idx + 1, stepAt: clock() }); return; }
      const all = ids();
      const { points, stats } = scoreRound(all, catKeys(), state.answers, state.votes, state.round.letter);
      for (const id of all) {
        const p = state.players[id];
        p.score = (p.score || 0) + points[id];
        p.stats.uniq += stats[id].uniq;
        p.stats.dup += stats[id].dup;
      }
      const by = state.round.stoppedBy;
      if (by && by !== 'time' && state.players[by]) state.players[by].stats.stops += 1;
      Object.assign(state.round, { points, stepAt: clock() });
      state.status = 'round';
    }),
    nextRound: step(() => {
      if (state.status !== 'round') return;
      if (state.round.n < state.settings.rounds) drawLetter(state.round.n + 1, state.round.used || []);
      else { state.status = 'awards'; state.round.stepAt = clock(); }
    }),
    showPodium: step(() => { if (state.status === 'awards') state.status = 'final'; }),
    backToLobby: step(() => {
      state.status = 'lobby';
      state.round = null;
      state.answers = {};
      state.votes = {};
    }),
    updateSettings: step((code, settings) => { state.settings = sanitizeSettings(settings); }),

    async leaveRoom() {
      listeners.clear();
      try { storage?.removeItem(SOLO_KEY); } catch (e) { /* niente da togliere */ }
    },
    forget() {},
    async kickPlayer() {},
    async joinRoom() { return { code: SOLO_CODE, waiting: false }; },

    /** Sul podio: media di punti a parola, vittoria (nessun robot sopra) e se conta per i record. */
    result() {
      if (state.status !== 'final') return null;
      const mine = state.players[ME].score || 0;
      return {
        ppw: pointsPerWord(mine, state.settings.cats.length, state.settings.rounds),
        won: Object.entries(state.players).every(([id, p]) => id === ME || (p.score || 0) <= mine),
        counts: countsForRecord(state.settings, botCount),
      };
    },
  };
}

/** Nuova partita da soli: il giocatore e i robot, in attesa di startGame. */
export function createSoloEngine({ profile, settings, difficulty, botCount, dict, storage, random = Math.random, clock = Date.now }) {
  const players = {
    [ME]: { name: String(profile.name || '').trim().slice(0, 14) || 'Tu', color: profile.color | 0, face: profile.face | 0, joinedAt: 1, score: 0, stats: freshStats(),
      ...(CHARACTER_IDS.includes(profile.char) ? { char: profile.char } : {}),
      ...(Object.keys(cleanAcc(profile.acc)).length ? { acc: cleanAcc(profile.acc) } : {}) },
  };
  makeBots(botCount, profile.name, random).forEach((b, i) => {
    players[b.id] = { name: b.name, color: b.color, face: b.face, quirk: b.quirk, joinedAt: i + 2, score: 0, stats: freshStats() };
  });
  const state = {
    hostId: ME, status: 'lobby', createdAt: clock(), settings: sanitizeSettings(settings),
    players, presence: Object.fromEntries(Object.keys(players).map((id) => [id, true])),
    round: null, answers: {}, votes: {}, solo: { difficulty, known: {} },
  };
  return makeEngine({ state, plans: {}, difficulty, botCount, profile, dict, storage, random, clock });
}

/** Riprende la partita salvata, se c'è, non è finita e non è più vecchia di 12 ore. Altrimenti null (e la cancella). */
export function resumeSoloEngine({ dict, storage, random = Math.random, clock = Date.now }) {
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(SOLO_KEY)); } catch (e) { saved = null; }
  // Una partita finita (sul podio) non si riprende: alla riapertura si torna alla home.
  const valid = saved && saved.state && saved.plans && LEVELS[saved.difficulty] && saved.state.status !== 'final'
    && clock() - saved.savedAt <= MAX_AGE_MS;
  if (!valid) {
    try { storage?.removeItem(SOLO_KEY); } catch (e) { /* niente da togliere */ }
    return null;
  }
  return makeEngine({ ...saved, dict, storage, random, clock });
}
