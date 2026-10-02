// Esegui con: node --test engine/rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, startsWithLetter, makeCode, pickLetter, isRejected, scoreCategory, scoreRound, ranking, computeAwards, nextHost, sanitizeSettings, HARD_LETTERS } from './rules.js';

test('normalize toglie accenti, maiuscole e spazi', () => {
  assert.equal(normalize('  Città '), 'citta');
  assert.ok(startsWithLetter('èlite', 'E'));
  assert.ok(!startsWithLetter('Aquila', 'M'));
  assert.ok(!startsWithLetter('   ', 'M'));
});
test('makeCode: 4 caratteri senza ambigui', () => {
  for (let i = 0; i < 200; i++) assert.match(makeCode(), /^[A-HJ-NP-Z2-9]{4}$/);
});
test('pickLetter evita usate e difficili', () => {
  for (let i = 0; i < 300; i++) { const l = pickLetter(['A', 'B'], true); assert.ok(!['A', 'B'].includes(l) && !HARD_LETTERS.includes(l)); }
  const all = 'ABCDEFGILMNOPRSTUVZ'.split('');
  assert.ok(pickLetter(all, true).length === 1); // mazzo finito: ricomincia
});
test('bocciatura: più di metà degli altri', () => {
  assert.equal(isRejected(1, 4), false); // 1 su 3
  assert.equal(isRejected(2, 4), true);  // 2 su 3
  assert.equal(isRejected(1, 3), false); // 1 su 2: pari non basta
  assert.equal(isRejected(1, 2), true);  // 1 su 1
});
test('punteggi 20/10/5/0', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const r = scoreCategory(ids, { a: 'Martina', b: 'marta', c: 'MARTA ', d: '' }, {}, 'M');
  assert.deepEqual([r.a.points, r.b.points, r.c.points, r.d.points], [10, 5, 5, 0]);
  assert.equal(r.d.status, 'empty');
  const solo = scoreCategory(ids, { a: 'Milano', b: 'Roma' }, {}, 'M');
  assert.equal(solo.a.points, 20); assert.equal(solo.b.status, 'wrongLetter');
});
test('una parola bocciata vale 0 e non rende doppie le altre', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const votes = { b: { a: true, c: true } };
  const r = scoreCategory(ids, { a: 'Milano', b: 'Milano', c: 'Modena', d: 'Messina' }, votes, 'M');
  assert.equal(r.b.status, 'rejected'); assert.equal(r.b.points, 0);
  assert.equal(r.a.points, 10);
  // il voto dell'autore su se stesso e di chi non è in stanza non contano
  const r2 = scoreCategory(ids, { a: 'Milano', b: 'Modena' }, { b: { b: true, zzz: true, a: true } }, 'M');
  assert.equal(r2.b.status, 'unique');
});
test('scoreRound somma le categorie e conta uniche/doppie', () => {
  const ids = ['a', 'b'];
  const res = scoreRound(ids, ['nomi', 'citta'], { a: { nomi: 'Marta', citta: 'Milano' }, b: { nomi: 'Marta' } }, {}, 'M');
  assert.deepEqual(res.points, { a: 25, b: 5 });
  assert.deepEqual(res.stats, { a: { uniq: 1, dup: 1 }, b: { uniq: 0, dup: 1 } });
});
test('classifica, premi, nuovo host', () => {
  const players = { a: { score: 10, joinedAt: 2, online: true, stats: { stops: 0, uniq: 5, dup: 1 } }, b: { score: 30, joinedAt: 1, online: false, stats: { stops: 2, uniq: 1, dup: 4 } }, c: { score: 10, joinedAt: 3, online: true } };
  assert.deepEqual(ranking(players).map((p) => p.id), ['b', 'a', 'c']);
  assert.deepEqual(computeAwards(players).map((a) => a.playerId), ['b', 'a', 'b']);
  assert.equal(nextHost(players, 'b'), 'a');
  assert.equal(nextHost({ x: { online: true } }, 'x'), null);
});
test('sanitizeSettings corregge valori assurdi', () => {
  const s = sanitizeSettings({ rounds: 99, maxPlayers: 0, timer: 7, cats: [{ key: 'a', label: 'A' }] });
  assert.equal(s.rounds, 10); assert.equal(s.maxPlayers, 2); assert.equal(s.timer, 90); assert.equal(s.cats.length, 3);
});
