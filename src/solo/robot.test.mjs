// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, LEVELS, BOT_NAMES, makeBots, planBot, botVote } from './robot.js';
import { createDictionary } from './dizionario.js';
import { normalize, startsWithLetter, DEFAULT_CATEGORIES } from '../engine/rules.js';
import { seeded } from './test-utili.mjs';

const CATS = DEFAULT_CATEGORIES.map((c) => c.key);
// Dizionario finto: per ogni categoria 9 parole con la M (3 per rarità) e 3 con la R; niente con la K.
const lists = {};
for (const cat of CATS) {
  lists[cat] = {
    M: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`M${cat}${i}`, i % 3]),
    R: [0, 1, 2].map((i) => [`R${cat}${i}`, i]),
  };
}
const dict = createDictionary(lists);
const START = 100000;

test('quattro difficoltà con i valori della spec', () => {
  assert.deepEqual(DIFFICULTIES, ['facile', 'medio', 'difficile', 'impossibile']);
  assert.deepEqual(LEVELS.facile.fill, [0.4, 0.6]);
  assert.deepEqual(LEVELS.impossibile.wordGapMs, [600, 1200]);
  assert.equal(LEVELS.medio.doubtRate, 0.25);
  assert.ok(BOT_NAMES.length >= 40);
});

test('i robot non si chiamano come il giocatore e hanno nomi diversi', () => {
  for (let s = 1; s < 60; s++) {
    const bots = makeBots(5, 'Giulia', seeded(s));
    assert.equal(bots.length, 5);
    assert.deepEqual(bots.map((b) => b.id), ['bot1', 'bot2', 'bot3', 'bot4', 'bot5']);
    assert.ok(bots.every((b) => normalize(b.name) !== 'giulia'));
    assert.equal(new Set(bots.map((b) => b.name)).size, 5);
    assert.ok(bots.every((b) => b.face >= 0 && b.face <= 5 && b.color >= 0 && b.color <= 5 && Math.abs(b.quirk) <= 0.1));
  }
  assert.equal(makeBots(3, '', seeded(2)).length, 3);
  assert.ok(makeBots(5, 'GIULIA ', seeded(3)).every((b) => normalize(b.name) !== 'giulia'));
});

const plans = (level, n, seed, letter = 'M') => {
  const r = seeded(seed);
  return Array.from({ length: n }, () => planBot(makeBots(1, '', r)[0], CATS, letter, LEVELS[level], dict, r, START));
};

test('Facile riempie tra il 40 e il 60% delle caselle, Impossibile tutte', () => {
  const ps = plans('facile', 200, 11);
  const mean = ps.reduce((s, p) => s + p.writes.length, 0) / ps.length / CATS.length;
  assert.ok(mean >= 0.4 && mean <= 0.6, `media ${mean}`);
  for (const p of plans('impossibile', 100, 12)) assert.equal(p.writes.length, CATS.length);
});

test('velocità: Impossibile finisce in meno di 10 secondi, Facile aspetta almeno 8', () => {
  for (const p of plans('impossibile', 100, 13)) assert.ok(p.writes.at(-1).at - START < 10000);
  for (const p of plans('facile', 100, 14)) assert.ok(p.writes[0].at - START >= 8000);
  for (const p of plans('medio', 50, 15)) {
    for (let i = 1; i < p.writes.length; i++) assert.ok(p.writes[i].at > p.writes[i - 1].at, 'scrive una casella alla volta');
  }
});

test('STOP: Facile solo a caselle piene (mai con 8 categorie), Impossibile sempre, subito dopo l\'ultima', () => {
  for (const p of plans('facile', 200, 16)) assert.equal(p.stopAt, null);
  for (const p of plans('impossibile', 100, 17)) {
    assert.ok(p.stopAt !== null && p.stopAt >= p.writes.at(-1).at && p.stopAt <= p.writes.at(-1).at + 500);
  }
});

test('lettera senza parole: casella vuota, mai una parola con la lettera sbagliata', () => {
  for (const p of plans('impossibile', 50, 18, 'K')) {
    assert.equal(p.writes.length, 0);
    assert.equal(p.stopAt, null, 'non può fermare senza caselle piene');
  }
  for (const level of ['difficile', 'impossibile']) {
    const r = seeded(19);
    const lvl = { ...LEVELS[level], errorRate: 0 };
    for (let i = 0; i < 100; i++) {
      const p = planBot(makeBots(1, '', r)[0], CATS, 'M', lvl, dict, r, START);
      assert.ok(p.writes.every((w) => startsWithLetter(w.word, 'M')));
    }
  }
});

test('Facile sbaglia ogni tanto, con parole vere di altre lettere', () => {
  const words = plans('facile', 300, 20).flatMap((p) => p.writes);
  const wrong = words.filter((w) => !startsWithLetter(w.word, 'M'));
  assert.ok(wrong.length > 0 && wrong.length / words.length < 0.3, `${wrong.length} su ${words.length}`);
  assert.ok(wrong.every((w) => dict.has(w.cat, w.word)));
});

test('un robot non scrive la stessa parola in due categorie, e ogni categoria una volta', () => {
  for (const p of plans('impossibile', 100, 21)) {
    assert.equal(new Set(p.writes.map((w) => normalize(w.word))).size, p.writes.length);
    assert.equal(new Set(p.writes.map((w) => w.cat)).size, p.writes.length);
  }
});

test('voti: mai contro una parola conosciuta con la lettera giusta, sempre contro gli errori dei robot', () => {
  const r = seeded(22);
  for (const level of DIFFICULTIES) {
    for (let i = 0; i < 1000; i++) {
      assert.equal(botVote(LEVELS[level], { known: true, wrongLetter: false, authorIsBot: false, botError: false }, r), false);
      assert.equal(botVote(LEVELS[level], { known: true, wrongLetter: true, authorIsBot: true, botError: true }, r), true);
    }
  }
});

test('voti sulle parole sconosciute del giocatore: più dubbi a Impossibile che a Facile', () => {
  const rate = (level) => {
    const r = seeded(23);
    let n = 0;
    for (let i = 0; i < 4000; i++) if (botVote(LEVELS[level], { known: false, wrongLetter: false, authorIsBot: false, botError: false }, r)) n++;
    return n / 4000;
  };
  assert.ok(Math.abs(rate('facile') - 0.1) < 0.03);
  assert.ok(Math.abs(rate('impossibile') - 0.55) < 0.03);
});
