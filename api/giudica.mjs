// Funzione Vercel del giudice delle parole: POST /api/giudica. La logica sta in src/giudice/server/servizio.mjs; qui solo
// il collegamento con Vercel, con Firebase Admin (FIREBASE_SERVICE_ACCOUNT) e con Anthropic (ANTHROPIC_API_KEY).
// Le due chiavi e GIUDICE_ATTIVO stanno solo nelle variabili d'ambiente di Vercel. Senza GIUDICE_ATTIVO=1 risponde
// "spento" senza toccare niente: il gioco vota come prima.
import Anthropic from '@anthropic-ai/sdk';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { creaServizio } from '../src/giudice/server/servizio.mjs';
import { creaDizionario } from '../src/giudice/protezione.js';
import { LISTE } from '../src/giudice/liste/index.js';

let servizio = null; // si crea alla prima richiesta e si riusa finché l'istanza resta viva
function ottieniServizio() {
  if (!servizio) {
    const app = getApps()[0] || initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
    });
    servizio = creaServizio({
      admin: { auth: getAuth(app), db: getDatabase(app) },
      anthropic: new Anthropic(),
      dizionario: creaDizionario(LISTE),
    });
  }
  return servizio;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ stato: 'rifiutato' }); }
  if (process.env.GIUDICE_ATTIVO !== '1') return res.status(202).json({ stato: 'spento' });
  let corpo;
  try { corpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch (e) { return res.status(400).json({ stato: 'rifiutato' }); }
  if (!corpo || typeof corpo !== 'object') return res.status(400).json({ stato: 'rifiutato' });
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const r = await ottieniServizio().giudica({ ...corpo, token });
    const http = r.stato === 'ok' ? 200 : r.stato === 'rifiutato' ? 400 : 202;
    return res.status(http).json({ stato: r.stato, verdetti: r.verdetti });
  } catch (e) {
    return res.status(500).json({ stato: 'errore' }); // nessun dettaglio all'esterno
  }
}
