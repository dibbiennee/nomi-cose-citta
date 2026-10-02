// Regressione: l'ultima parola scritta non deve restare in sospeso quando la pagina va in secondo piano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerSaver } from './salvataggio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('aspetta una pausa nella digitazione e salva una volta sola', async () => {
  const saved = [];
  const s = createAnswerSaver((v) => saved.push(v), 50);
  s.set({ nomi: 'M' });
  s.set({ nomi: 'Ma' });
  s.set({ nomi: 'Mar' });
  assert.equal(saved.length, 0);
  await sleep(80);
  assert.deepEqual(saved, [{ nomi: 'Mar' }]);
});

test('passando a un\'altra app salva subito, senza aspettare', () => {
  const saved = [];
  const s = createAnswerSaver((v) => saved.push(v), 10000);
  s.set({ nomi: 'Marco' });
  assert.equal(s.flush(), true);
  assert.deepEqual(saved, [{ nomi: 'Marco' }]);
  assert.equal(s.flush(), false, 'niente da salvare una seconda volta');
});

test('dopo il salvataggio immediato il timer non risalva un valore vecchio', async () => {
  const saved = [];
  const s = createAnswerSaver((v) => saved.push(v), 30);
  s.set({ nomi: 'Marco' });
  s.flush();
  await sleep(60);
  assert.equal(saved.length, 1);
});

test('nuovo round: ciò che era in attesa non viene salvato', async () => {
  const saved = [];
  const s = createAnswerSaver((v) => saved.push(v), 30);
  s.set({ nomi: 'vecchio' });
  s.cancel();
  await sleep(60);
  assert.equal(saved.length, 0);
  assert.equal(s.flush(), false);
});

test('un errore di salvataggio (round già chiuso) non rompe niente', async () => {
  const s = createAnswerSaver(() => Promise.reject(new Error('PERMISSION_DENIED')), 10);
  s.set({ nomi: 'tardi' });
  assert.equal(s.flush(), true);
  await sleep(20);
});
