// Il dizionario che protegge le parole: formato pulito, dimensioni minime e un campione di parole vere e finte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LISTE } from './liste/index.js';
import { LISTE as ROBOT } from '../solo/parole/index.js';
import { creaDizionario, CATEGORIE_PROTETTE } from './protezione.js';
import { normalize } from '../engine/rules.js';

const MINIMI = { citta: 7000, nomi: 550, animali: 500, cibi: 400, mestieri: 300 };

test('ogni categoria del gioco ha una lista di stringhe', () => {
  for (const cat of CATEGORIE_PROTETTE) assert.ok(Array.isArray(LISTE[cat]) && LISTE[cat].length > 0, cat);
});

test('formato pulito: niente voci vuote, doppioni, spazi in eccesso, caratteri strani o trattini lunghi', () => {
  for (const [cat, lista] of Object.entries(LISTE)) {
    const viste = new Set();
    for (const voce of lista) {
      assert.equal(typeof voce, 'string', `${cat}: ${voce}`);
      assert.ok(voce.trim() === voce && voce.length >= 2, `${cat}: "${voce}" vuota o con spazi ai lati`);
      assert.ok(!/\s{2,}/.test(voce), `${cat}: "${voce}" ha spazi doppi`);
      assert.ok(!/[\u0000-\u001f—–]/.test(voce), `${cat}: "${voce}" ha caratteri di controllo o trattini lunghi`);
      assert.ok(/^\p{L}/u.test(voce), `${cat}: "${voce}" non inizia con una lettera`);
      const n = normalize(voce);
      assert.ok(!viste.has(n), `${cat}: doppione "${voce}"`);
      viste.add(n);
    }
  }
});

test('dimensioni minime per le categorie compilate', () => {
  for (const [cat, minimo] of Object.entries(MINIMI)) assert.ok(LISTE[cat].length >= minimo, `${cat}: ${LISTE[cat].length} < ${minimo}`);
});

test('le liste dei robot restano nel dizionario, tranne le voci che un revisore ha tolto di proposito', () => {
  const tolte = (cat) => {
    const f = new URL(`../../scripts/dizionario-fonti/${cat}.togli.json`, import.meta.url);
    const extra = cat === 'citta' ? new URL('../../scripts/dizionario-fonti/citta_estere.togli.json', import.meta.url) : null;
    const leggi = (u) => (u && existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : []);
    return new Set([...leggi(f), ...leggi(extra)].map(normalize));
  };
  const d = creaDizionario(LISTE);
  for (const [cat, per] of Object.entries(ROBOT)) {
    const t = tolte(cat);
    for (const lista of Object.values(per)) {
      for (const [parola] of lista) assert.ok(d.ha(cat, parola, normalize(parola)[0]) || t.has(normalize(parola)), `${cat}: "${parola}" è sparita senza essere stata tolta`);
    }
  }
});

test('parole vere note sono protette', () => {
  const d = creaDizionario(LISTE);
  const vere = [['citta', 'Catania'], ['citta', 'Reggio Emilia'], ['citta', 'Vipiteno'], ['citta', 'Londra'], ['citta', 'Tokyo'], ['citta', 'Il Cairo'],
    ['nomi', 'Andrea'], ['nomi', 'Giulia'], ['nomi', 'Zoe'], ['animali', 'Aquila'], ['animali', 'Quokka'], ['animali', 'Delfino'],
    ['cibi', 'Lasagne'], ['cibi', 'Tiramisù'], ['cibi', 'Pizza margherita'], ['mestieri', 'Falegname'], ['mestieri', 'Idraulico'], ['mestieri', 'Zoologo']];
  for (const [cat, parola] of vere) assert.ok(d.ha(cat, parola, parola[0]), `${cat}: ${parola}`);
});

test('parole finte note non sono protette, né tra le categorie sbagliate', () => {
  const d = creaDizionario(LISTE);
  const finte = [['animali', 'Blorfo'], ['cibi', 'Gnorfetti'], ['nomi', 'Qwertz'], ['citta', 'Zzzzzz'], ['mestieri', 'Sgrumbolaro'], ['animali', 'Lampada'],
    ['citta', 'Arancia'], ['nomi', 'Catania'], ['animali', 'Andrea'], ['cibi', 'Falegname'], ['mestieri', 'Delfino']];
  for (const [cat, parola] of finte) assert.ok(!d.ha(cat, parola, parola[0]), `${cat}: ${parola}`);
});
