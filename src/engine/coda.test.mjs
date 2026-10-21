// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_SIZE, BOT_WAIT_MS, organizer, nextGroup } from './coda.js';

const q = (...entries) => Object.fromEntries(entries.map(([uid, at, room]) => [uid, { at, ...(room ? { room } : {}) }]));

test('valori della spec', () => {
  assert.equal(QUICK_SIZE, 4);
  assert.equal(BOT_WAIT_MS, 20000);
});

test('organizza la voce libera più vecchia; a parità di orario, uid minore', () => {
  assert.equal(organizer(q(['b', 200], ['a', 300], ['c', 100, 'ROOM'])), 'b');
  assert.equal(organizer(q(['z', 100], ['m', 100])), 'm');
  assert.equal(organizer({}), null);
  assert.equal(organizer(q(['a', 1, 'ROOM'])), null, 'tutti già assegnati');
});

test('gruppo: 4 subito; meno di 4 solo dopo l\'attesa della più vecchia', () => {
  const now = 100000;
  assert.deepEqual(nextGroup(q(['a', now - 1000], ['b', now - 900], ['c', now - 800], ['d', now - 700]), now), ['a', 'b', 'c', 'd']);
  assert.deepEqual(nextGroup(q(['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5], ['f', 6]), 10), ['a', 'b', 'c', 'd'], 'i primi 4 per orario');
  assert.equal(nextGroup(q(['a', now - 19000], ['b', now - 1000], ['c', now - 500]), now), null, '19 secondi: si aspetta');
  assert.deepEqual(nextGroup(q(['a', now - 21000], ['b', now - 1000], ['c', now - 500]), now), ['a', 'b', 'c']);
  assert.deepEqual(nextGroup(q(['a', now - 21000]), now), ['a'], 'da solo: poi i robot');
  assert.deepEqual(nextGroup(q(['a', now - 3000], ['b', now - 2500]), now, 2000), ['a', 'b'], 'attesa personalizzabile');
  assert.equal(nextGroup(q(['a', now - 50000, 'ROOM']), now), null, 'le voci assegnate non contano');
  assert.equal(nextGroup({}, now), null);
});
