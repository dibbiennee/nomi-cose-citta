// L'adattatore Vercel: metodo, interruttore e corpo, senza chiavi e senza rete. Esegui con: npm run test:rules
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/giudica.mjs';

const risposta = () => {
  const r = { stato: null, corpo: null, intestazioni: {} };
  r.setHeader = (k, v) => { r.intestazioni[k] = v; };
  r.status = (s) => { r.stato = s; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
};
afterEach(() => { delete process.env.GIUDICE_ATTIVO; });

test('solo POST: il resto riceve 405 e non si mette in cache', async () => {
  const r = risposta();
  await handler({ method: 'GET', headers: {} }, r);
  assert.equal(r.stato, 405);
  assert.equal(r.intestazioni.Allow, 'POST');
  assert.equal(r.intestazioni['Cache-Control'], 'no-store');
});

test('senza GIUDICE_ATTIVO=1 risponde "spento" senza toccare nessuna chiave', async () => {
  const r = risposta();
  await handler({ method: 'POST', headers: {}, body: { codice: 'ABCD', parole: [] } }, r);
  assert.deepEqual([r.stato, r.corpo.stato], [202, 'spento']);
});

test('acceso ma con un corpo che non è JSON valido o non è un oggetto: 400, senza dettagli', async () => {
  process.env.GIUDICE_ATTIVO = '1';
  for (const corpo of ['{non json', null, 12]) {
    const r = risposta();
    await handler({ method: 'POST', headers: {}, body: corpo }, r);
    assert.equal(r.stato, 400);
    assert.deepEqual(r.corpo, { stato: 'rifiutato' });
  }
});

test('acceso ma senza la chiave di servizio: errore generico 500, nessun segreto o dettaglio nella risposta', async () => {
  process.env.GIUDICE_ATTIVO = '1';
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  const r = risposta();
  await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { codice: 'ABCD', parole: [{ cat: 'animali', testo: 'Alce' }] } }, r);
  assert.equal(r.stato, 500);
  assert.deepEqual(r.corpo, { stato: 'errore' });
});
