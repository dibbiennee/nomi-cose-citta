// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDictionary } from './dizionario.js';
import { startsWithLetter } from '../engine/rules.js';
import { seeded } from './test-utili.mjs';

const LISTE = {
  citta: {
    M: [['Milano', 0], ['Modena', 1], ['Matera', 2], ['Monza', 0]],
    R: [['Roma', 0], ['Rimini', 1]],
    P: [['Parma', 0]],
  },
  nomi: { M: [['Marco', 0], ['Martina', 0]] },
};

test('has ignora accenti, maiuscole e spazi, e guarda la categoria', () => {
  const d = createDictionary(LISTE);
  assert.equal(d.has('citta', '  ROMA '), true);
  assert.equal(d.has('citta', 'Rome'), false);
  assert.equal(d.has('nomi', 'Roma'), false);
  assert.equal(d.has('animali', 'Roma'), false, 'categoria che non esiste');
});

test('pick sceglie solo parole con la lettera giusta', () => {
  const d = createDictionary(LISTE);
  const r = seeded(7);
  for (let i = 0; i < 1000; i++) assert.ok(startsWithLetter(d.pick('citta', 'M', [0.5, 0.3, 0.2], r, new Set()), 'M'));
});

test('pick rispetta i pesi della rarità e ripiega quando una rarità è vuota', () => {
  const d = createDictionary(LISTE);
  const r = seeded(3);
  for (let i = 0; i < 200; i++) assert.equal(d.pick('citta', 'M', [0, 0, 1], r, new Set()), 'Matera');
  for (let i = 0; i < 200; i++) assert.equal(d.pick('citta', 'P', [0, 0, 1], r, new Set()), 'Parma', 'nessuna rara per la P');
});

test('pick salta le parole escluse e dà null quando non resta niente', () => {
  const d = createDictionary(LISTE);
  const r = seeded(5);
  for (let i = 0; i < 100; i++) assert.equal(d.pick('citta', 'R', [1, 1, 1], r, new Set(['roma'])), 'Rimini');
  assert.equal(d.pick('citta', 'P', [1, 1, 1], r, new Set(['parma'])), null);
  assert.equal(d.pick('citta', 'K', [1, 1, 1], r, new Set()), null);
  assert.equal(d.pick('cibi', 'M', [1, 1, 1], r, new Set()), null);
});

test('wrong dà una parola vera della categoria con un\'altra iniziale', () => {
  const d = createDictionary(LISTE);
  const r = seeded(9);
  for (let i = 0; i < 200; i++) {
    const w = d.wrong('citta', 'M', r);
    assert.ok(d.has('citta', w) && !startsWithLetter(w, 'M'), w);
  }
  assert.equal(d.wrong('nomi', 'M', r), null, 'solo parole con la M');
});
