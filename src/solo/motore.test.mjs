// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSoloEngine, resumeSoloEngine, SOLO_CODE, SOLO_KEY, MAX_AGE_MS } from './motore.js';
import { createDictionary } from './dizionario.js';
import { scoreRound, ALPHABET, DEFAULT_CATEGORIES } from '../engine/rules.js';
import { seeded, fakeStorage } from './test-utili.mjs';

// Dizionario finto: per ogni categoria e ogni lettera 9 parole (3 per rarità).
const lists = {};
for (const { key } of DEFAULT_CATEGORIES) {
  lists[key] = {};
  for (const l of ALPHABET) lists[key][l] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`${l}${key}${i}`, i % 3]);
}
const dict = createDictionary(lists);
const CATS2 = DEFAULT_CATEGORIES.slice(0, 2);
const CATS3 = DEFAULT_CATEGORIES.slice(0, 3);

function setup({ difficulty = 'impossibile', botCount = 2, cats = CATS2, rounds = 1, timer = 60, storage = fakeStorage(), seed = 1 } = {}) {
  const clock = { t: 1000000 };
  const opts = { dict, storage, random: seeded(seed), clock: () => clock.t };
  const e = createSoloEngine({ ...opts, profile: { name: 'Edo', color: 2, face: 3 }, settings: { cats, rounds, timer, hard: true, maxPlayers: 8 }, difficulty, botCount });
  let room = null;
  e.subscribe(SOLO_CODE, (r) => { room = r; });
  return { e, clock, opts, storage, get room() { return room; } };
}
/** Fa scorrere l'orologio a passi di 200 ms, come l'app, finché la condizione è vera o finisce il tempo. */
async function runUntil(s, cond, maxMs = 120000) {
  for (let i = 0; i < maxMs / 200 && !cond(s.room); i++) { s.clock.t += 200; await s.e.tick(); }
}
const myWord = (s) => `${s.room.round.letter}cose8`; // parola che il dizionario conosce

test('partita intera a Impossibile: estrazione, scrittura, STOP di un robot, correzione, premi, podio', async () => {
  const s = setup();
  await s.e.startGame(SOLO_CODE);
  assert.equal(s.room.status, 'spin');
  assert.equal(s.room.hostId, 'me');
  assert.deepEqual(Object.keys(s.room.players), ['me', 'bot1', 'bot2']);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  assert.equal(s.room.status, 'play');
  await runUntil(s, (r) => r.status === 'review');
  assert.equal(s.room.status, 'review');
  assert.match(s.room.round.stoppedBy, /^bot/);
  assert.ok(Object.keys(s.room.answers.bot1).length > 0, 'i robot hanno scritto');
  await s.e.nextCategory(SOLO_CODE);
  await s.e.nextCategory(SOLO_CODE);
  assert.equal(s.room.status, 'round');
  assert.equal(s.room.players[s.room.round.stoppedBy].stats.stops, 1);
  await s.e.nextRound(SOLO_CODE);
  assert.equal(s.room.status, 'awards');
  assert.equal(s.e.result(), null, 'il risultato c\'è solo sul podio');
  await s.e.showPodium(SOLO_CODE);
  assert.equal(s.room.status, 'final');
  const res = s.e.result();
  assert.equal(res.counts, false, 'con 2 categorie non conta');
  assert.equal(typeof res.ppw, 'number');
  assert.equal(res.won, false, 'senza scrivere niente non si vince');
});

test('STOP del giocatore: i robot consegnano solo quello che avevano già scritto', async () => {
  const s = setup({ difficulty: 'medio', cats: DEFAULT_CATEGORIES, botCount: 5 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  const cut = s.room.round.startsAt + 12000;
  await runUntil(s, () => s.clock.t >= cut);
  await s.e.pressStop(SOLO_CODE, { cose: myWord(s) });
  assert.equal(s.room.status, 'review');
  assert.equal(s.room.round.stoppedBy, 'me');
  const { plans } = JSON.parse(s.storage.getItem(SOLO_KEY));
  for (const [id, plan] of Object.entries(plans)) {
    const expected = plan.writes.filter((w) => w.at <= cut).length;
    assert.equal(Object.keys(s.room.answers[id] || {}).length, expected, id);
  }
  s.clock.t += 60000;
  await s.e.tick();
  for (const [id, plan] of Object.entries(plans)) {
    assert.equal(Object.keys(s.room.answers[id] || {}).length, plan.writes.filter((w) => w.at <= cut).length, `${id} dopo lo STOP`);
  }
});

test('le parole che il dizionario conosce non si bocciano, nemmeno col voto del giocatore', async () => {
  const s = setup({ difficulty: 'impossibile', botCount: 1 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  await runUntil(s, (r) => r.status === 'review');
  const cat = CATS2[0].key;
  assert.equal(s.room.solo.known[cat].bot1, true);
  await s.e.vote(SOLO_CODE, cat, 'bot1', true);
  assert.equal(s.room.votes?.[cat]?.bot1?.me, undefined, 'voto ignorato');
  const { byCategory } = scoreRound(['me', 'bot1'], [cat], s.room.answers, s.room.votes || {}, s.room.round.letter);
  assert.notEqual(byCategory[cat].bot1.status, 'rejected');
});

test('le parole del giocatore che il dizionario non conosce si possono contestare', async () => {
  const s = setup({ difficulty: 'impossibile', botCount: 2, seed: 4 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  const L = s.room.round.letter;
  await s.e.pressStop(SOLO_CODE, { [CATS2[0].key]: `${L}parolainventata`, [CATS2[1].key]: `${L}${CATS2[1].key}0` });
  assert.equal(s.room.solo.known[CATS2[0].key].me, undefined);
  assert.equal(s.room.solo.known[CATS2[1].key].me, true);
});

test('ripresa: tempo scaduto ad app chiusa porta in correzione; dopo 13 ore la partita sparisce', async () => {
  const s = setup({ difficulty: 'facile', timer: 60 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  s.clock.t += 2000;
  await s.e.tick();
  assert.equal(s.room.status, 'play');
  s.clock.t = s.room.round.endsAt + 5000;
  const back = resumeSoloEngine(s.opts);
  let room = null;
  back.subscribe(SOLO_CODE, (r) => { room = r; });
  await back.tick();
  assert.equal(room.status, 'review');
  assert.equal(room.round.stoppedBy, 'time');

  s.clock.t += MAX_AGE_MS + 3600000;
  assert.equal(resumeSoloEngine(s.opts), null);
  assert.equal(s.storage.has(SOLO_KEY), false);
});

test('ripresa con storage vuoto o rovinato: nessuna partita', () => {
  const storage = fakeStorage();
  assert.equal(resumeSoloEngine({ dict, storage, random: seeded(1), clock: () => 0 }), null);
  storage.setItem(SOLO_KEY, '{rotto');
  assert.equal(resumeSoloEngine({ dict, storage, random: seeded(1), clock: () => 0 }), null);
});

test('con lo storage rotto la partita arriva lo stesso al podio', async () => {
  const s = setup({ storage: fakeStorage(true), cats: CATS3, botCount: 3 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  await runUntil(s, (r) => r.status === 'review');
  for (let i = 0; i < 3; i++) await s.e.nextCategory(SOLO_CODE);
  await s.e.nextRound(SOLO_CODE);
  await s.e.showPodium(SOLO_CODE);
  assert.equal(s.room.status, 'final');
  assert.equal(s.e.result().counts, true, '3 categorie e 3 robot contano');
});

test('rivincita e uscita', async () => {
  const s = setup();
  await s.e.startGame(SOLO_CODE);
  assert.ok(s.storage.has(SOLO_KEY));
  await s.e.rematch(SOLO_CODE);
  assert.equal(s.room.status, 'spin');
  assert.ok(Object.values(s.room.players).every((p) => p.score === 0));
  await s.e.leaveRoom(SOLO_CODE);
  assert.equal(s.storage.has(SOLO_KEY), false);
});

test('il motore da soli non usa Firebase', () => {
  const src = readFileSync(new URL('./motore.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from 'firebase|getEngine|\.\.\/firebase/);
});

test('una partita finita non riprende alla riapertura: si torna alla home', async () => {
  const s = setup({ cats: CATS3, botCount: 2 });
  await s.e.startGame(SOLO_CODE);
  s.clock.t = s.room.round.startsAt;
  await s.e.goPlay(SOLO_CODE);
  await runUntil(s, (r) => r.status === 'review');
  for (let i = 0; i < 3; i++) await s.e.nextCategory(SOLO_CODE);
  await s.e.nextRound(SOLO_CODE);
  await s.e.showPodium(SOLO_CODE);
  assert.equal(s.room.status, 'final');
  assert.equal(resumeSoloEngine(s.opts), null);
  assert.equal(s.storage.has(SOLO_KEY), false);
});
