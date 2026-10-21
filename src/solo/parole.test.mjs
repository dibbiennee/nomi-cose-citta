// Controlli sul dizionario vero: lettere, rarità, doppioni, quantità, parole vietate, peso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTE } from './parole/index.js';
import { normalize, startsWithLetter, DEFAULT_CATEGORIES } from '../engine/rules.js';

const LETTERS = 'ABCDEFGILMNOPRSTUVZ'.split(''); // le lettere che escono con "lettere difficili" escluse
const VIETATE = ['cazzo', 'merda', 'stronzo', 'puttana', 'troia', 'frocio', 'negro', 'coglione', 'vaffanculo', 'figa'];

test('ci sono tutte e otto le categorie', () => {
  assert.deepEqual(Object.keys(LISTE).sort(), DEFAULT_CATEGORIES.map((c) => c.key).sort());
});

for (const [cat, list] of Object.entries(LISTE)) {
  test(`${cat}: ogni parola sta sotto la sua iniziale, rarità valida, nessun doppione`, () => {
    const seen = new Set();
    for (const [letter, words] of Object.entries(list)) {
      assert.match(letter, /^[A-Z]$/, `${cat}: lettera ${letter}`);
      for (const entry of words) {
        assert.ok(Array.isArray(entry) && entry.length === 2, `${cat}/${letter}: ${JSON.stringify(entry)}`);
        const [word, rarity] = entry;
        assert.ok(startsWithLetter(word, letter), `${cat}: "${word}" sotto la ${letter}`);
        assert.ok([0, 1, 2].includes(rarity), `${cat}: "${word}" rarità ${rarity}`);
        const n = normalize(word);
        assert.ok(!seen.has(n), `${cat}: "${word}" doppione`);
        seen.add(n);
        for (const v of VIETATE) assert.ok(!n.split(/[^a-z]+/).includes(v), `${cat}: "${word}" vietata`);
      }
    }
  });

  test(`${cat}: almeno 12 parole per lettera, almeno 3 per ogni rarità`, () => {
    for (const l of LETTERS) {
      const words = list[l] || [];
      assert.ok(words.length >= 12, `${cat}/${l}: ${words.length} parole`);
      for (const r of [0, 1, 2]) {
        const n = words.filter(([, x]) => x === r).length;
        assert.ok(n >= 3, `${cat}/${l}: ${n} parole di rarità ${r}`);
      }
    }
  });
}

test('il dizionario pesa meno di 400 000 caratteri', () => {
  const size = JSON.stringify(LISTE).length;
  console.log(`peso del dizionario: ${size} caratteri`);
  assert.ok(size < 400000, `${size}`);
});
