// Parole protette: una parola che il dizionario riconosce non si può togliere votando. Esegui con: npm run test:rules
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIE_PROTETTE, creaDizionario, impostaDizionario, dizionarioPronto, isProtetta, senzaVotiProtetti, creaContatoreTentativi } from './protezione.js';

const LISTE = { animali: ['Aquila', 'Cane'], citta: ['Catania', 'Reggio Emilia'], nomi: ['Andrea'] };
beforeEach(() => impostaDizionario(null));

test('le categorie protette sono le otto del gioco', () => {
  assert.deepEqual(CATEGORIE_PROTETTE, ['nomi', 'cose', 'citta', 'animali', 'cibi', 'mestieri', 'film', 'calciatori']);
});

test('una parola è protetta solo con la categoria, la lettera e il testo giusti', () => {
  const d = creaDizionario(LISTE);
  assert.equal(d.ha('animali', 'aquila', 'A'), true, 'maiuscole');
  assert.equal(d.ha('animali', 'Àquila', 'A'), true, 'accenti');
  assert.equal(d.ha('animali', '  Aquila  ', 'A'), true, 'spazi intorno');
  assert.equal(d.ha('animali', 'Aquila', 'B'), false, 'lettera sbagliata');
  assert.equal(d.ha('citta', 'Aquila', 'A'), false, 'altra categoria');
  assert.equal(d.ha('nomi', 'Catania', 'C'), false, 'una città tra i nomi');
  assert.equal(d.ha('animali', 'Aquilone', 'A'), false, 'parola diversa');
  assert.equal(d.ha('animali', 'Aquile', 'A'), false, 'il plurale non è tollerato');
  assert.equal(d.ha('citta', 'Reggio Emilia', 'R'), true, 'nome composto intero');
  assert.equal(d.ha('citta', 'Reggio', 'R'), false, 'nome composto a metà');
  assert.equal(d.ha('xabc123', 'Aquila', 'A'), false, 'categoria inventata');
});

test('una categoria inventata non è protetta nemmeno se nella lista c\'è la chiave', () => {
  const d = creaDizionario({ ...LISTE, x123: ['Aquila'] });
  assert.equal(d.ha('x123', 'Aquila', 'A'), false);
});

test('senza dizionario caricato niente è protetto', () => {
  assert.equal(dizionarioPronto(), false);
  assert.equal(isProtetta('animali', 'Aquila', 'A'), false);
});

test('con il dizionario impostato isProtetta lo usa', () => {
  impostaDizionario(creaDizionario(LISTE));
  assert.equal(dizionarioPronto(), true);
  assert.equal(isProtetta('animali', 'Aquila', 'A'), true);
  assert.equal(isProtetta('animali', 'Blorfo', 'B'), false);
});

test('senzaVotiProtetti: toglie i voti contro le risposte protette e non tocca gli altri né l\'originale', () => {
  impostaDizionario(creaDizionario(LISTE));
  const answers = { p1: { animali: 'Aquila', citta: 'Catania' }, p2: { animali: 'Blorfo', citta: 'Torino' }, p3: { animali: 'Cane' } };
  const votes = {
    animali: { p1: { p2: true, p3: true }, p2: { p1: true, p3: true }, p3: { p1: true } },
    citta: { p1: { p2: true }, p2: { p1: true, p3: true } },
  };
  const copia = JSON.stringify(votes);
  const out = senzaVotiProtetti(votes, answers, 'A');
  assert.deepEqual(out.animali.p1, {}, 'Aquila: i voti contro non contano');
  assert.deepEqual(out.animali.p2, { p1: true, p3: true }, 'Blorfo non è nel dizionario: si vota come oggi');
  assert.deepEqual(out.animali.p3, { p1: true }, 'Cane non inizia con A: nessuna protezione per questa lettera');
  assert.equal(JSON.stringify(votes), copia, 'l\'originale non cambia');
});

test('senzaVotiProtetti: categorie o risposte mancanti non danno errore', () => {
  impostaDizionario(creaDizionario(LISTE));
  assert.deepEqual(senzaVotiProtetti({}, {}, 'A'), {});
  assert.deepEqual(senzaVotiProtetti({ animali: { p1: { p2: true } } }, {}, 'A'), { animali: { p1: { p2: true } } });
  assert.deepEqual(senzaVotiProtetti(null, null, 'A'), {});
});

test('avviso privato: conta le parole diverse, non i tocchi: scatta alla terza parola e poi ogni 3', () => {
  const MIN = 60 * 1000;
  const c = creaContatoreTentativi(3, 10 * MIN);
  assert.deepEqual(c.registra('ABCD', 'aquila', 0), { n: 1, avviso: false }, 'una sola può essere curiosità');
  assert.deepEqual(c.registra('ABCD', 'aquila', 1 * MIN), { n: 1, avviso: false }, 'la stessa parola toccata ancora: nessun avviso');
  assert.deepEqual(c.registra('ABCD', 'aquila', 1 * MIN), { n: 1, avviso: false });
  assert.deepEqual(c.registra('ABCD', 'cane', 2 * MIN), { n: 2, avviso: false });
  assert.deepEqual(c.registra('ABCD', 'lupo', 3 * MIN), { n: 3, avviso: true });
  assert.deepEqual(c.registra('ABCD', 'lupo', 3 * MIN), { n: 3, avviso: false }, 'ritoccare la parola dell\'avviso non lo ripete');
  assert.deepEqual(c.registra('ABCD', 'orso', 4 * MIN), { n: 4, avviso: false });
  assert.deepEqual(c.registra('ABCD', 'gatto', 5 * MIN), { n: 5, avviso: false });
  assert.deepEqual(c.registra('ABCD', 'topo', 6 * MIN), { n: 6, avviso: true });
});

test('avviso privato: le parole vecchie non contano e ogni stanza ha il suo conto', () => {
  const MIN = 60 * 1000;
  const c = creaContatoreTentativi(3, 10 * MIN);
  c.registra('ABCD', 'aquila', 0); c.registra('ABCD', 'cane', 1 * MIN);
  assert.deepEqual(c.registra('ABCD', 'lupo', 30 * MIN), { n: 1, avviso: false }, 'dopo mezz\'ora le prime due sono dimenticate');
  assert.deepEqual(c.registra('WXYZ', 'aquila', 30 * MIN), { n: 1, avviso: false }, 'altra stanza, altro conto');
});

test('chiavi di categoria strane (constructor, toString, __proto__) non fanno andare in errore', () => {
  const d = creaDizionario(LISTE);
  for (const cat of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(d.ha(cat, 'Aquila', 'A'), false, cat);
});

test('l\'apostrofo tipografico (come lo scrive un telefono) vale come quello dritto', () => {
  const d = creaDizionario({ citta: ["Aci Sant'Antonio"], cibi: ['Tonno sott’olio'] });
  assert.equal(d.ha('citta', 'Aci Sant’Antonio', 'A'), true, 'dizionario dritto, testo tipografico');
  assert.equal(d.ha('citta', "Aci Sant'Antonio", 'A'), true);
  assert.equal(d.ha('cibi', "Tonno sott'olio", 'T'), true, 'dizionario tipografico, testo dritto');
});
