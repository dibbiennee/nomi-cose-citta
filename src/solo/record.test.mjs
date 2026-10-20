// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECORD_KEY, countsForRecord, pointsPerWord, createRecordStore, formatPpw } from './record.js';
import { fakeStorage } from './test-utili.mjs';

const EMPTY = { migliore: null, giocate: 0, vinte: 0 };
const cats = (n) => Array.from({ length: n }, (_, i) => ({ key: `c${i}` }));

test('punti a parola con un decimale', () => {
  assert.equal(pointsPerWord(402, 5, 6), 13.4);
  assert.equal(pointsPerWord(0, 3, 1), 0);
  assert.equal(formatPpw(13.4), '13,4');
  assert.equal(formatPpw(10), '10,0');
});

test('conta per i record solo con almeno 3 categorie e 2 robot', () => {
  assert.equal(countsForRecord({ cats: cats(3) }, 2), true);
  assert.equal(countsForRecord({ cats: cats(2) }, 5), false);
  assert.equal(countsForRecord({ cats: cats(8) }, 1), false);
});

test('il primo record è sempre battuto, uno peggiore no, e i conti crescono', () => {
  const storage = fakeStorage();
  const store = createRecordStore(storage);
  assert.deepEqual(store.get('medio'), EMPTY);
  assert.deepEqual(store.save('medio', { ppw: 12.5, won: true }), { beaten: true });
  assert.deepEqual(store.save('medio', { ppw: 9, won: false }), { beaten: false });
  assert.deepEqual(store.save('medio', { ppw: 14, won: true }), { beaten: true });
  assert.deepEqual(store.get('medio'), { migliore: 14, giocate: 3, vinte: 2 });
  assert.deepEqual(store.get('facile'), EMPTY, 'le difficoltà sono separate');
  assert.deepEqual(createRecordStore(storage).get('medio'), { migliore: 14, giocate: 3, vinte: 2 }, 'restano dopo il riavvio');
  assert.ok(storage.has(RECORD_KEY));
});

test('senza storage, o con storage rotto, non si rompe niente', () => {
  for (const s of [null, undefined, fakeStorage(true)]) {
    const store = createRecordStore(s);
    assert.deepEqual(store.get('facile'), EMPTY);
    assert.doesNotThrow(() => store.save('facile', { ppw: 10, won: true }));
  }
});

test('un JSON rovinato nello storage si ignora e il salvataggio dopo lo sostituisce', () => {
  const storage = fakeStorage();
  storage.setItem(RECORD_KEY, '{non è json');
  const store = createRecordStore(storage);
  assert.deepEqual(store.get('difficile'), EMPTY);
  store.save('difficile', { ppw: 11.2, won: false });
  assert.deepEqual(createRecordStore(storage).get('difficile'), { migliore: 11.2, giocate: 1, vinte: 0 });
});
