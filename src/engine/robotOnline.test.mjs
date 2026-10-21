// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_LEVEL, seededRandom, planFor, dueAnswers, dueStop, botVotesFor, pickBots } from './robotOnline.js';
import { createDictionary } from '../solo/dizionario.js';
import { ALPHABET, DEFAULT_CATEGORIES, normalize, startsWithLetter } from './rules.js';

const lists = {};
for (const { key } of DEFAULT_CATEGORIES) {
  lists[key] = {};
  for (const l of ALPHABET) lists[key][l] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`${l}${key}${i}`, i % 3]);
}
const dict = createDictionary(lists);
const CATS = DEFAULT_CATEGORIES.slice(0, 3);
const T0 = 1000000;
function room(extra = {}) {
  return {
    status: 'play', settings: { cats: CATS, rounds: 3, timer: 90 },
    round: { n: 1, letter: 'M', startsAt: T0, endsAt: T0 + 90000, ...extra.round },
    players: {
      hu1: { name: 'Anna', color: 0, face: 0, joinedAt: 1 },
      bot1: { name: 'Giulia', color: 1, face: 1, joinedAt: 2, bot: true, quirk: 0.05 },
      bot2: { name: 'Marco', color: 2, face: 2, joinedAt: 3, bot: true, quirk: -0.05 },
    },
    answers: extra.answers || {}, votes: extra.votes || {},
  };
}

test('livello della partita veloce: Medio che dubita poco', () => {
  assert.equal(QUICK_LEVEL.doubtRate, 0.1);
  assert.deepEqual(QUICK_LEVEL.fill, [0.7, 0.85]);
});

test('casualità ripetibile: stesse parti, stessa sequenza; parti diverse, sequenza diversa', () => {
  const a = seededRandom('ABCD', 1, 'bot1'), b = seededRandom('ABCD', 1, 'bot1'), c = seededRandom('ABCD', 2, 'bot1');
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('il piano di un robot è lo stesso su ogni telefono', () => {
  assert.deepEqual(planFor(room(), 'ABCD', 'bot1', dict), planFor(room(), 'ABCD', 'bot1', dict));
  assert.notDeepEqual(planFor(room(), 'ABCD', 'bot1', dict), planFor(room(), 'ABCD', 'bot2', dict));
});

test('risposte dovute: solo quelle già "scritte", e niente dopo lo STOP', () => {
  const plan = planFor(room(), 'ABCD', 'bot1', dict);
  const mid = plan.writes[0].at;
  assert.deepEqual(Object.keys(dueAnswers(room(), 'ABCD', 'bot1', dict, mid)), [plan.writes[0].cat]);
  const stopped = room({ round: { stoppedAt: mid, stoppedBy: 'hu1' } });
  assert.equal(Object.keys(dueAnswers(stopped, 'ABCD', 'bot1', dict, T0 + 999999)).length, 1);
  assert.equal(Object.keys(dueAnswers(room(), 'ABCD', 'bot1', dict, T0 - 1)).length, 0);
});

test('STOP dovuto: il primo robot che ha deciso di fermare, mai due volte', () => {
  let found = null;
  for (let s = 0; s < 40 && !found; s++) {
    const code = `C${s}`;
    const stops = ['bot1', 'bot2'].map((id) => planFor(room(), code, id, dict).stopAt).filter((x) => x !== null);
    if (stops.length) found = { code, at: Math.min(...stops) };
  }
  assert.ok(found, 'almeno un robot Medio che ferma in 40 stanze');
  assert.equal(dueStop(room(), found.code, dict, found.at - 1), null);
  assert.match(dueStop(room(), found.code, dict, found.at), /^bot[12]$/);
  assert.equal(dueStop(room({ round: { stoppedBy: 'hu1' } }), found.code, dict, found.at + 1), null);
});

test('voti dei robot: mai contro parole conosciute, sempre contro i propri errori, poco contro le parole sconosciute degli umani', () => {
  const r = room({ answers: { hu1: { nomi: 'Mnomi1', cose: 'Mparolainventata' }, bot1: { nomi: 'Rnomi2' }, bot2: { nomi: 'Mnomi3' } } });
  r.status = 'review';
  const votes = botVotesFor(r, 'ABCD', dict);
  assert.ok(!votes.some((v) => v.target === 'hu1' && v.cat === 'nomi'), 'parola conosciuta dell\'umano');
  assert.ok(!votes.some((v) => v.target === 'bot2' && v.cat === 'nomi'), 'parola conosciuta di un robot');
  assert.ok(votes.some((v) => v.target === 'bot1' && v.cat === 'nomi' && v.voter === 'bot2'), 'errore di un robot: lettera sbagliata');
  assert.ok(votes.every((v) => v.voter !== v.target && /^bot/.test(v.voter)));
  let doubt = 0;
  for (let i = 0; i < 4000; i++) {
    if (botVotesFor(r, `K${i}`, dict).some((v) => v.target === 'hu1' && v.cat === 'cose' && v.voter === 'bot1')) doubt++;
  }
  assert.ok(Math.abs(doubt / 4000 - 0.1) < 0.03, `${doubt / 4000}`);
});

test('robot con nomi diversi da quelli dei giocatori', () => {
  for (let s = 0; s < 50; s++) {
    const bots = pickBots(3, ['Giulia', 'marco '], seededRandom('X', s));
    assert.deepEqual(bots.map((b) => b.id), ['bot1', 'bot2', 'bot3']);
    assert.ok(bots.every((b) => !['giulia', 'marco'].includes(normalize(b.name))));
  }
  assert.ok(startsWithLetter('Mnomi1', 'M'));
});

test('stesse risposte anche con le chiavi in ordine diverso', async () => {
  const { sameAnswers } = await import('./robotOnline.js');
  assert.equal(sameAnswers({ nomi: 'A', cose: 'B' }, { cose: 'B', nomi: 'A' }), true);
  assert.equal(sameAnswers({ nomi: 'A' }, { nomi: 'A', cose: 'B' }), false);
  assert.equal(sameAnswers({ nomi: 'A' }, { nomi: 'C' }), false);
  assert.equal(sameAnswers({}, undefined), true);
});
