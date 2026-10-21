// Serie di giorni, sfide e scrigno: logica pura. Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONES, milestoneFor, advanceStreak, dayBefore } from './serie.js';
import { POOL, challengesFor, completed, ALL_DONE_BONUS } from './sfide.js';
import { rollChest, RARI } from './scrigno.js';

const T = '2026-10-21';

test('primo giorno: serie 1, serie nuova, nessun traguardo', () => {
  const r = advanceStreak({}, T);
  assert.equal(r.state.streak, 1);
  assert.equal(r.state.serieId, T);
  assert.equal(r.state.lastDay, T);
  assert.equal(r.state.migliorSerie, 1);
  assert.equal(r.event, 'nuovo');
  assert.deepEqual(r.reached, []);
});

test('giorno dopo: la serie continua e il terzo giorno scatta il traguardo 3', () => {
  const r = advanceStreak({ lastDay: dayBefore(T), streak: 2, migliorSerie: 2, serieId: '2026-10-19' }, T);
  assert.equal(r.state.streak, 3);
  assert.equal(r.state.serieId, '2026-10-19');
  assert.equal(r.event, 'continua');
  assert.deepEqual(r.reached, [3]);
});

test('stesso giorno: niente cambia', () => {
  const s = { lastDay: T, streak: 4, migliorSerie: 4, serieId: '2026-10-18' };
  const r = advanceStreak(s, T);
  assert.equal(r.event, 'stesso-giorno');
  assert.deepEqual(r.state, s);
  assert.deepEqual(r.reached, []);
});

test('un giorno saltato con lo scudo libero nel mese: la serie continua e lo scudo si segna', () => {
  const r = advanceStreak({ lastDay: dayBefore(T, 2), streak: 5, migliorSerie: 5, serieId: '2026-10-15', scudo: '2026-09' }, T);
  assert.equal(r.event, 'scudo');
  assert.equal(r.state.streak, 6);
  assert.equal(r.state.scudo, '2026-10');
});

test('un giorno saltato con lo scudo già usato nel mese: riparte da 1, il record resta', () => {
  const r = advanceStreak({ lastDay: dayBefore(T, 2), streak: 5, migliorSerie: 5, serieId: '2026-10-15', scudo: '2026-10' }, T);
  assert.equal(r.event, 'riparte');
  assert.equal(r.state.streak, 1);
  assert.equal(r.state.serieId, T);
  assert.equal(r.state.migliorSerie, 5);
});

test('due o più giorni saltati: riparte anche con lo scudo libero', () => {
  const r = advanceStreak({ lastDay: dayBefore(T, 3), streak: 9, migliorSerie: 9, serieId: '2026-10-10' }, T);
  assert.equal(r.event, 'riparte');
  assert.equal(r.state.streak, 1);
});

test('il record non scende e i traguardi si rimettono in una serie nuova', () => {
  let s = { lastDay: dayBefore(T, 5), streak: 40, migliorSerie: 40, serieId: '2026-09-01' };
  let r = advanceStreak(s, T);
  assert.equal(r.state.migliorSerie, 40);
  s = r.state;
  for (let i = 1; i <= 6; i++) { s = advanceStreak({ ...s, lastDay: dayBefore(T) }, T).state; }
  const seven = advanceStreak({ lastDay: dayBefore(T), streak: 6, migliorSerie: 40, serieId: T }, T);
  assert.deepEqual(seven.reached, [7], 'il 7 vale di nuovo in una serie nuova anche se il record è 40');
  assert.equal(seven.state.migliorSerie, 40);
});

test('chi ha streak e lastDaily ma non lastDay non perde la serie', () => {
  const r = advanceStreak({ streak: 5, lastDaily: dayBefore(T) }, T);
  assert.equal(r.state.streak, 6);
  assert.equal(r.event, 'continua');
});

test('traguardi: tabella della spec e multipli di 100 dopo il 100', () => {
  assert.deepEqual(MILESTONES.map((m) => [m.n, m.coins, m.item || null]), [
    [3, 50, null], [7, 150, 'cornice_scintille'], [14, 300, null], [30, 800, 'mantello_notte'], [50, 1200, null], [100, 3000, 'corona_fiamme'],
  ]);
  assert.deepEqual(milestoneFor(3), { coins: 50 });
  assert.equal(milestoneFor(7).item, 'cornice_scintille');
  assert.deepEqual(milestoneFor(100), { coins: 3000, item: 'corona_fiamme' });
  assert.deepEqual(milestoneFor(200), { coins: 3000 });
  assert.equal(milestoneFor(4), null);
  assert.equal(milestoneFor(150), null);
});

test('sfide: tre al giorno, una per livello, uguali per tutti, e col tempo cambiano', () => {
  const a = challengesFor(T);
  assert.deepEqual(a.map((c) => c.tier), ['facile', 'media', 'difficile']);
  assert.deepEqual(challengesFor(T).map((c) => c.id), a.map((c) => c.id));
  assert.deepEqual(a.map((c) => c.reward), [15, 30, 60]);
  assert.equal(ALL_DONE_BONUS, 50);
  const ids = new Set();
  let d = T;
  for (let i = 0; i < 30; i++) { challengesFor(d).forEach((c) => ids.add(c.id)); d = dayBefore(d); }
  assert.ok(ids.size >= 5, `solo ${ids.size} sfide diverse in 30 giorni`);
  assert.ok(POOL.every((c) => /^s[1-8]$/.test(c.id)));
});

test('sfide: chi conta e cosa conta', () => {
  const online = { mode: 'online', won: false, unique: 3, rank: 2, players: 4, humans: 3 };
  const byId = (g) => new Set(POOL.filter((c) => c.test(g)).map((c) => c.id));
  const s = byId(online);
  assert.ok(s.has('s1') && s.has('s2') && s.has('s3') && s.has('s5'), [...s].join());
  assert.ok(!s.has('s4'), 'non ha vinto');
  const solo = byId({ mode: 'solo', won: true, unique: 6, rank: 1, players: 4, humans: 1 });
  assert.ok(solo.has('s1') && solo.has('s3') && solo.has('s6') && solo.has('s7'));
  assert.ok(!solo.has('s2') && !solo.has('s4') && !solo.has('s5') && !solo.has('s8'), 'da soli non contano Vinci, Primi 3, amico');
  const robots = byId({ mode: 'veloce', won: true, unique: 0, rank: 1, players: 4, humans: 1 });
  assert.ok(!robots.has('s2') && !robots.has('s5'), 'i robot non sono amici');
  assert.deepEqual(completed(T, online).every((id) => challengesFor(T).some((c) => c.id === id)), true);
});

test('scrigno: monete da 5 a 40, un raro ogni tanto, 50 monete se i rari sono tutti tuoi', () => {
  const mid = rollChest(() => 0.5, {});
  assert.equal(mid.kind, 'monete');
  assert.ok(mid.coins >= 5 && mid.coins <= 40);
  const rare = rollChest(() => 0.99, {});
  assert.equal(rare.kind, 'raro');
  assert.ok(RARI.includes(rare.item));
  const all = Object.fromEntries(RARI.map((i) => [i, true]));
  assert.deepEqual(rollChest(() => 0.99, all), { kind: 'monete', coins: 50 });
  assert.deepEqual(RARI, ['cappello_mago', 'occhiali_arcobaleno', 'collare_gemme']);
});

test('scrigno: la media resta bassa e i lanci non superano mai 40 (tranne i 50 dei rari finiti)', () => {
  let tot = 0, n = 20000, rari = 0;
  for (let i = 0; i < n; i++) {
    const c = rollChest(Math.random, {});
    if (c.kind === 'raro') rari++; else { assert.ok(c.coins <= 40 && c.coins >= 5); tot += c.coins; }
  }
  assert.ok(tot / n < 30, `media ${tot / n}`);
  assert.ok(rari / n > 0.02 && rari / n < 0.09, `rari ${rari / n}`);
});
