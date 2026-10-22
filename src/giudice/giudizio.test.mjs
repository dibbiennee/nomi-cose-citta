// Funzioni pure del giudice con IA: chiave dell'archivio, prompt, lettura delle risposte, combinazione dei modelli,
// stato di una risposta e voti dopo il giudizio. Esegui con: npm run test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveParola, percorsoGiudizio } from './chiave.mjs';
import { PROMPT_VERSIONE, SISTEMA, formattaParole, leggiVerdetti, combinaVerdetti, serveSonnet } from './prompt.mjs';
import { statoRisposta, applicaGiudizio } from './decisione.js';
import { creaDizionario } from './protezione.js';

test('chiave dell\'archivio: normalizzata, senza caratteri vietati dal database, al massimo 60', () => {
  assert.equal(chiaveParola('Sant’Antonio d\'Orta'), "sant'antonio_d'orta");
  assert.equal(chiaveParola('a.b$c#d[e]f/g'), 'abcdefg');
  assert.equal(chiaveParola('  Tiramisù  '), 'tiramisu');
  assert.equal(chiaveParola('x'.repeat(200)).length, 60);
  assert.equal(percorsoGiudizio('citta', 'Reggio Emilia'), 'giudizi/citta/reggio_emilia');
});

test('prompt: versione, istruzioni e elenco numerato', () => {
  assert.equal(PROMPT_VERSIONE, 1);
  assert.match(SISTEMA, /valida/);
  assert.match(SISTEMA, /non_valida/);
  assert.match(SISTEMA, /incerta/);
  const t = formattaParole([{ cat: 'animali', lettera: 'A', testo: 'Aquila' }, { cat: 'citta', lettera: 'R', testo: 'Roma' }]);
  assert.match(t, /^0\. categoria: animale \| lettera: A \| risposta: Aquila$/m);
  assert.match(t, /^1\. categoria: città, anche estera \| lettera: R \| risposta: Roma$/m);
});

test('lettura delle risposte del modello: solo i tre valori esatti, tutto il resto è incerta', () => {
  assert.deepEqual(leggiVerdetti('[{"id":0,"verdetto":"valida"},{"id":1,"verdetto":"boh"}]', 3), ['valida', 'incerta', 'incerta']);
  assert.deepEqual(leggiVerdetti('Ecco: [{"id":1,"verdetto":"non_valida"}] fine', 2), ['incerta', 'non_valida']);
  assert.deepEqual(leggiVerdetti('niente json', 2), ['incerta', 'incerta']);
  assert.deepEqual(leggiVerdetti('[{"id":0,"verdetto":"Valida"}]', 1), ['incerta'], 'maiuscole strane non valgono');
  assert.deepEqual(leggiVerdetti('[{"id":7,"verdetto":"valida"}]', 2), ['incerta', 'incerta'], 'id fuori elenco ignorato');
  assert.deepEqual(leggiVerdetti(null, 1), ['incerta']);
});

test('combinazione di Haiku e Sonnet: il rifiuto richiede l\'accordo dei due', () => {
  assert.deepEqual(combinaVerdetti('valida', null), { v: 'valida', m: 'haiku' });
  assert.deepEqual(combinaVerdetti('non_valida', 'non_valida'), { v: 'non_valida', m: 'entrambi' });
  assert.deepEqual(combinaVerdetti('non_valida', 'valida'), { v: 'incerta', m: null });
  assert.deepEqual(combinaVerdetti('non_valida', null), { v: 'incerta', m: null });
  assert.deepEqual(combinaVerdetti('incerta', 'valida'), { v: 'valida', m: 'sonnet' });
  assert.deepEqual(combinaVerdetti('incerta', 'non_valida'), { v: 'incerta', m: null });
  assert.deepEqual(combinaVerdetti('incerta', 'incerta'), { v: 'incerta', m: null });
  assert.equal(serveSonnet('valida'), false);
  assert.equal(serveSonnet('non_valida'), true);
  assert.equal(serveSonnet('incerta'), true);
});

const D = creaDizionario({ animali: ['Aquila'], citta: ['Catania'], mestieri: ['Maniscalco'], nomi: ['Andrea'] });

test('la categoria sbagliata si riconosce nel dizionario (la guardia incrociata)', () => {
  assert.equal(D.haAltraCategoria('nomi', 'Maniscalco'), true, 'è un mestiere');
  assert.equal(D.haAltraCategoria('mestieri', 'Maniscalco'), false, 'qui è nella sua categoria');
  assert.equal(D.haAltraCategoria('nomi', 'Zzzzz'), false);
});

test('stato di una risposta: dizionario, verificata, non esiste o voto', () => {
  const st = (over) => statoRisposta({ cat: 'animali', testo: 'Alce', lettera: 'A', voce: undefined, dizionario: D, ...over });
  assert.equal(st({ testo: 'Aquila' }), 'dizionario');
  assert.equal(st({ voce: { v: 'valida' } }), 'verificata');
  assert.equal(st({ voce: { v: 'valida' }, cat: 'nomi', testo: 'Maniscalco', lettera: 'M' }), 'voto', 'valida ma è un mestiere');
  assert.equal(st({ voce: { v: 'non_valida' } }), 'non_esiste');
  assert.equal(st({ voce: { v: 'incerta' } }), 'voto');
  assert.equal(st({}), 'voto');
  assert.equal(st({ voce: { v: 'valida' }, lettera: 'B' }), 'voto', 'lettera sbagliata: ci pensa il punteggio');
  assert.equal(st({ voce: { v: 'valida' }, testo: '' }), 'voto');
  assert.equal(st({ voce: { v: 'non_valida' }, lettera: 'B' }), 'voto', 'lettera sbagliata anche con non_valida');
  assert.equal(st({ voce: { v: 'valida' }, dizionario: null }), 'voto', 'senza dizionario caricato si vota come oggi');
  assert.equal(st({ voce: { v: 'non_valida' }, dizionario: null }), 'voto');
});

test('voti dopo il giudizio: protette senza voti, inesistenti bocciate da tutti, il resto invariato', () => {
  const answers = { p1: { animali: 'Alce' }, p2: { animali: 'Alxy' }, p3: { animali: 'Aqqq' } };
  const votes = { animali: { p1: { p2: true, p3: true }, p2: { p1: true }, p3: {} } };
  const archivio = { animali: { alce: { v: 'valida' }, alxy: { v: 'non_valida' } } };
  const copia = JSON.stringify(votes);
  const out = applicaGiudizio(votes, answers, 'A', archivio, ['p1', 'p2', 'p3'], D);
  assert.deepEqual(out.animali.p1, {}, 'Alce verificata: nessun voto contro');
  assert.deepEqual(out.animali.p2, { p1: true, p3: true }, 'Alxy non esiste: votano contro tutti gli altri');
  assert.deepEqual(out.animali.p3, {}, 'Aqqq senza verdetto: resta com\'era');
  assert.equal(JSON.stringify(votes), copia, 'l\'originale non cambia');
  assert.deepEqual(applicaGiudizio(null, {}, 'A', {}, [], D), {}, 'niente dati, nessun errore');
});
