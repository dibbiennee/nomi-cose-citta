// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFounderCode, isReservedCode, cleanCode, createFounderStore, FOUNDER_KEY } from './fondatore.js';
import { makeCode } from '../engine/rules.js';

/** localStorage finto; `broken` simula uno storage che dà errore (navigazione privata). */
function fakeStorage(broken = false) {
  const m = new Map();
  const guard = () => { if (broken) throw new Error('storage non disponibile'); };
  return {
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: (k) => { guard(); m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

test('CANT viene accettato', () => {
  assert.equal(isFounderCode('CANT'), true);
});

test('minuscole, maiuscole miste e spazi superflui', () => {
  for (const c of ['cant', 'Cant', 'cAnT', '  CANT  ', '\tcant\n']) assert.equal(isFounderCode(c), true, c);
});

test('codici sbagliati non attivano la modalità', () => {
  for (const c of ['CAN', 'CANTT', 'KANT', 'CAN7', 'AB12', '', null, undefined]) assert.equal(isFounderCode(c), false, String(c));
  const store = createFounderStore(fakeStorage());
  if (isFounderCode('AB12')) store.activate();
  assert.equal(store.isActive(), false);
});

test('i codici stanza restano codici stanza', () => {
  // Il campo di "Ho un codice" pulisce l'input allo stesso modo di prima.
  assert.equal(cleanCode(' ab-12 '), 'AB12');
  // Ogni codice che il motore può generare, tranne CANT, va dritto alla stanza.
  for (let i = 0; i < 2000; i++) {
    const code = makeCode();
    assert.equal(isFounderCode(code), code === 'CANT');
  }
  assert.equal(isReservedCode('cant'), true);
  assert.equal(isReservedCode('AB12'), false);
});

test('lo sblocco resta dopo aver chiuso e riaperto l\'app', () => {
  const storage = fakeStorage();
  createFounderStore(storage).activate();
  const dopoIlRiavvio = createFounderStore(storage); // nuovo avvio, stesso telefono
  assert.equal(dopoIlRiavvio.isActive(), true);
  assert.deepEqual(storage.dump(), { [FOUNDER_KEY]: '1' }, 'salva solo un 1, mai il codice');
});

test('lo sblocco si revoca', () => {
  const storage = fakeStorage();
  const store = createFounderStore(storage);
  store.activate();
  store.revoke();
  assert.equal(store.isActive(), false);
  assert.equal(createFounderStore(storage).isActive(), false);
});

test('senza storage, o con storage rotto, non si rompe niente', () => {
  for (const s of [null, undefined, fakeStorage(true)]) {
    const store = createFounderStore(s);
    assert.equal(store.isActive(), false);
    store.activate();
    assert.equal(store.isActive(), true, 'vale finché la pagina è aperta');
    store.revoke();
    assert.equal(store.isActive(), false);
  }
});

test('modalità standard: telefono nuovo, niente Fondatore', () => {
  assert.equal(createFounderStore(fakeStorage()).isActive(), false);
});

test('lo sblocco non arriva mai al motore multiplayer né a Firebase', () => {
  // Il motore e la configurazione di Firebase non sanno niente del club.
  for (const f of ['../engine/room.js', '../firebase.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /createFounderStore|FOUNDER_KEY|ncc-fondatore|isFounderCode/, f);
  }
  // Il motore conosce solo i codici riservati, per non usarli come stanze.
  const room = readFileSync(new URL('../engine/room.js', import.meta.url), 'utf8');
  assert.match(room, /isReservedCode/);
});
