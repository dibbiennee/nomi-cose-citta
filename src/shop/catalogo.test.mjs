// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ITEMS, PAID, EARN, TIPI } from './catalogo.js';

test('12 accessori con id unici, tipo valido, prezzo tra 150 e 1500, 3 esclusivi', () => {
  assert.equal(ITEMS.length, 12);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, 12);
  assert.ok(ITEMS.every((i) => TIPI.includes(i.tipo) && i.prezzo >= 150 && i.prezzo <= 1500 && /^[a-z_]+$/.test(i.id)));
  assert.equal(ITEMS.filter((i) => i.esclusivo).length, 3);
  assert.deepEqual(TIPI, ['cappello', 'occhiali', 'vestito', 'cornice']);
});

test('vetrina dei prodotti a soldi veri, con i prezzi della spec', () => {
  assert.deepEqual(PAID.map((p) => [p.prezzo, p.monete || null, !!p.username]), [
    ['0,99 €', 500, false], ['1,99 €', 1200, false], ['4,99 €', 3500, false], ['2,99 €', null, true],
  ]);
});

test('valori delle monete della spec', () => {
  assert.deepEqual(EARN, { base: 5, vittoria: 5, perUnica: 1, maxUniche: 10, giornaliero: 20, serie: 10, giornalieroMax: 70, invito: 200, maxInviti: 20, benvenutoPrimi: 1000, benvenuto: 300, primi: 100 });
});

test('lo script scrive la regola dei prezzi con ogni accessorio, e rieseguito non cambia niente', () => {
  execFileSync('node', ['scripts/regole-catalogo.mjs']);
  const once = readFileSync('database.rules.json', 'utf8');
  execFileSync('node', ['scripts/regole-catalogo.mjs']);
  assert.equal(readFileSync('database.rules.json', 'utf8'), once);
  const rule = JSON.parse(once).rules.users.$uid.owned.$item['.validate'];
  for (const i of ITEMS) assert.ok(rule.includes(`'${i.id}'`), i.id);
  assert.ok(rule.includes("primi100"));
});

test('ogni accessorio ha il suo disegno, fatto solo di forme SVG semplici', async () => {
  const { ACCESSORI } = await import('./accessori.js');
  for (const i of ITEMS) {
    const shapes = ACCESSORI[i.id];
    assert.ok(Array.isArray(shapes) && shapes.length > 0, i.id);
    assert.ok(shapes.every(([tag, attrs]) => ['path', 'circle', 'rect', 'ellipse', 'polygon'].includes(tag) && typeof attrs === 'object'), i.id);
  }
  assert.equal(Object.keys(ACCESSORI).length, ITEMS.length);
});

test('accessori indossati: solo id veri e del tipo giusto', async () => {
  const { cleanAcc } = await import('./accessori.js');
  assert.deepEqual(cleanAcc({ cappello: 'cilindro', occhiali: 'sciarpa', vestito: 'inventato', altro: 'x' }), { cappello: 'cilindro' });
  assert.deepEqual(cleanAcc(null), {});
});
