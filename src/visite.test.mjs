// Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitEvents, daysBetween, hourKey } from './visite.js';

test('giorni tra due date italiane', () => {
  assert.equal(daysBetween('2026-10-21', '2026-10-22'), 1);
  assert.equal(daysBetween('2026-10-21', '2026-10-28'), 7);
  assert.equal(daysBetween('2026-10-31', '2026-11-01'), 1, 'cambio di mese');
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'cambio dell\'ora legale');
});

test('primo arrivo: telefono nuovo', () => {
  const { events, next } = visitEvents(null, '2026-10-21');
  assert.deepEqual(events, ['aperture', 'telefoni_nuovi']);
  assert.deepEqual(next, { first: '2026-10-21', last: '2026-10-21' });
});

test('stesso giorno: solo un\'apertura in più', () => {
  const { events } = visitEvents({ first: '2026-10-21', last: '2026-10-21' }, '2026-10-21');
  assert.deepEqual(events, ['aperture']);
});

test('torna il giorno dopo e dopo una settimana', () => {
  assert.deepEqual(visitEvents({ first: '2026-10-21', last: '2026-10-21' }, '2026-10-22').events, ['aperture', 'telefoni_tornati', 'tornati_d1']);
  assert.deepEqual(visitEvents({ first: '2026-10-21', last: '2026-10-25' }, '2026-10-28').events, ['aperture', 'telefoni_tornati', 'tornati_d7']);
  const later = visitEvents({ first: '2026-10-01', last: '2026-10-02' }, '2026-10-21');
  assert.deepEqual(later.events, ['aperture', 'telefoni_tornati']);
  assert.deepEqual(later.next, { first: '2026-10-01', last: '2026-10-21' });
});

test('dato salvato rovinato: lo considera un telefono nuovo', () => {
  assert.deepEqual(visitEvents({ first: 'boh' }, '2026-10-21').events, ['aperture', 'telefoni_nuovi']);
  assert.deepEqual(visitEvents('stringa', '2026-10-21').events, ['aperture', 'telefoni_nuovi']);
});

test('fascia oraria in Italia', () => {
  assert.equal(hourKey(Date.UTC(2026, 9, 21, 22, 30)), 'ora_00', 'mezzanotte e mezza in Italia');
  assert.equal(hourKey(Date.UTC(2026, 9, 21, 7, 5)), 'ora_09');
});
