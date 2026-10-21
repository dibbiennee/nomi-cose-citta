// Account con Google o email (link senza password). L'identità anonima di oggi diventa l'account: stesso uid,
// quindi nome, partite e statistiche restano. Se quell'account Google o quell'email esiste già (altro telefono),
// si entra in quello: le monete stanno lì.
import {
  GoogleAuthProvider, EmailAuthProvider, linkWithCredential, linkWithPopup, linkWithRedirect, signInWithCredential,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut, signInAnonymously, deleteUser,
  reauthenticateWithCredential, reauthenticateWithPopup, reauthenticateWithRedirect,
} from 'firebase/auth';

export const EMAIL_KEY = 'ncc-email-accesso';
/** Cosa fare quando torna il link dell'email: 'collega' (l'anonimo diventa l'account), 'entra' o 'cancella'. */
export const MODE_KEY = 'ncc-email-modo';
const IN_USE = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/provider-already-linked'];
// Firebase cancella un utente solo se l'accesso è di pochi minuti fa: oltre questo margine si rientra prima.
const RECENT_MS = 4 * 60 * 1000;

/**
 * All'apertura: aspetta che l'accesso salvato sia ripristinato e crea un anonimo solo se non c'è nessuno.
 * Chiamare signInAnonymously con un account registrato già dentro lo sostituirebbe con un anonimo nuovo.
 */
export async function ensureSignedIn(auth) {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const { user } = await signInAnonymously(auth);
  return user;
}

/** Registrato = ha un accesso diverso da quello anonimo. */
export const isRegistered = (user) => Boolean(user && !user.isAnonymous && (user.providerData || []).length > 0);

async function linkOrEnter(auth, credential) {
  try {
    const { user } = await linkWithCredential(auth.currentUser, credential);
    return { uid: user.uid, merged: false };
  } catch (e) {
    // Un link email già usato non vale una seconda volta: chi chiama ne manda uno nuovo per entrare.
    if (!IN_USE.includes(e.code) || credential.providerId === 'password') throw e;
    const { user } = await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e) || credential);
    return { uid: user.uid, merged: true };
  }
}

/** Con una credenziale Google già in mano (nei test, e dopo un ritorno da redirect). */
export const linkGoogleCredential = (auth, credential) => linkOrEnter(auth, credential);

/**
 * Accesso con Google dal browser. Nell'app installata su iPhone (standalone) le finestre a parte vengono bloccate:
 * si usa il redirect, e al ritorno ci pensa getRedirectResult.
 */
export async function linkGoogle(auth, { standalone = false } = {}) {
  const provider = new GoogleAuthProvider();
  if (standalone) { await linkWithRedirect(auth.currentUser, provider); return null; }
  try {
    const { user } = await linkWithPopup(auth.currentUser, provider);
    return { uid: user.uid, merged: false };
  } catch (e) {
    if (!IN_USE.includes(e.code)) throw e;
    const { user } = await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e));
    return { uid: user.uid, merged: true };
  }
}

/** Manda il link d'accesso all'email e ricorda email e modo per quando il link viene aperto su questo telefono. */
export async function sendEmailLink(auth, email, url, storage = typeof localStorage !== 'undefined' ? localStorage : null, mode = 'collega') {
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try { storage?.setItem(EMAIL_KEY, email); storage?.setItem(MODE_KEY, mode); } catch (e) { /* si chiederà di nuovo l'email */ }
}

/**
 * All'apertura del link: collega l'anonimo a quell'email ('collega'), entra nell'account che già la usa ('entra'),
 * o conferma l'identità prima di cancellare ('cancella'). Altrimenti null. Se l'email ha già un account e il modo è
 * 'collega' l'errore è auth/email-already-in-use: serve un link nuovo con modo 'entra'.
 */
export async function completeEmailLink(auth, url, email, mode = 'collega') {
  if (!isSignInWithEmailLink(auth, url) || !email) return null;
  if (mode === 'entra') {
    const { user } = await signInWithEmailLink(auth, email, url);
    return { uid: user.uid, merged: true };
  }
  if (mode === 'cancella') {
    const { user } = await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credentialWithLink(email, url));
    return { uid: user.uid, merged: false };
  }
  return linkOrEnter(auth, EmailAuthProvider.credentialWithLink(email, url));
}

/** Con Google si conferma l'identità con la finestra (o col redirect nell'app installata su iPhone). */
export async function reauthGoogle(auth, { standalone = false } = {}) {
  const provider = new GoogleAuthProvider();
  if (standalone) { await reauthenticateWithRedirect(auth.currentUser, provider); return false; }
  await reauthenticateWithPopup(auth.currentUser, provider);
  return true;
}

export const usesGoogle = (user) => (user?.providerData || []).some((p) => p.providerId === 'google.com');

/** Esci: si torna a giocare da anonimi, con un'identità nuova. */
export async function signOutToAnonymous(auth) {
  await signOut(auth);
  await signInAnonymously(auth);
}

/**
 * Cancella i dati (removeData) e poi l'utente, e riparte da anonimo: 'ok'. Con un accesso di più di pochi minuti fa
 * Firebase rifiuterebbe la cancellazione dell'utente a dati già spariti: si restituisce 'serve-accesso' senza
 * toccare niente, e chi chiama fa confermare l'identità (reauthGoogle o un link email con modo 'cancella'), poi
 * richiama con fresh: true.
 */
export async function deleteAccount(auth, removeData, { now = Date.now(), fresh = false } = {}) {
  const last = Date.parse(auth.currentUser?.metadata?.lastSignInTime || '') || 0;
  if (!fresh && now - last > RECENT_MS) return 'serve-accesso';
  await removeData();
  await deleteUser(auth.currentUser);
  await signInAnonymously(auth);
  return 'ok';
}
