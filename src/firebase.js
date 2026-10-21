import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import {
  getAuth, initializeAuth, browserSessionPersistence, connectAuthEmulator,
} from 'firebase/auth';
import { createEngine } from './engine/room.js';
import { ensureSignedIn } from './account/accesso.js';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// In sviluppo (npm start) si usa l'emulatore Firebase, e ogni scheda è un giocatore diverso:
// così si prova una partita con più finestre senza toccare il database vero.
const EMULATOR = process.env.REACT_APP_EMULATOR === '1';
export const db = getDatabase(app);
export const auth = EMULATOR ? initializeAuth(app, { persistence: browserSessionPersistence }) : getAuth(app);
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9100);
}

let enginePromise = null;

/** Accesso (anonimo se serve, una volta sola) e motore della stanza legato a questo utente. */
export function getEngine() {
  if (!enginePromise) {
    // Prima si aspetta l'accesso salvato (anonimo o account registrato): l'anonimo nuovo solo se non c'è nessuno.
    enginePromise = ensureSignedIn(auth).then((user) => createEngine(db, user.uid)).catch((err) => { enginePromise = null; throw err; });
  }
  return enginePromise;
}
