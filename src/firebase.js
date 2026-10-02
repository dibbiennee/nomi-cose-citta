import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import {
  getAuth, initializeAuth, browserSessionPersistence, connectAuthEmulator, signInAnonymously, onAuthStateChanged,
} from 'firebase/auth';
import { createEngine } from './engine/room.js';

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
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

let enginePromise = null;

/** Accesso anonimo (una volta sola) e motore della stanza legato a questo utente. */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = new Promise((resolve, reject) => {
      const off = onAuthStateChanged(auth, (user) => {
        if (!user) return;
        off();
        resolve(createEngine(db, user.uid));
      }, reject);
      signInAnonymously(auth).catch((err) => { enginePromise = null; reject(err); });
    });
  }
  return enginePromise;
}
