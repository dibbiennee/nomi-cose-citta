// Account con Google o email (link senza password). L'identità anonima di oggi diventa l'account: stesso uid,
// quindi nome, partite e statistiche restano. Se quell'account Google o quell'email esiste già (altro telefono),
// si entra in quello: le monete stanno lì.
import {
  GoogleAuthProvider, EmailAuthProvider, linkWithCredential, linkWithPopup, linkWithRedirect, signInWithCredential,
  sendSignInLinkToEmail, isSignInWithEmailLink, signOut, signInAnonymously, deleteUser,
} from 'firebase/auth';

export const EMAIL_KEY = 'ncc-email-accesso';
const IN_USE = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/provider-already-linked'];

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
    if (!IN_USE.includes(e.code)) throw e;
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

/** Manda il link d'accesso all'email e la ricorda per quando il link viene aperto su questo telefono. */
export async function sendEmailLink(auth, email, url, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try { storage?.setItem(EMAIL_KEY, email); } catch (e) { /* si chiederà di nuovo l'email */ }
}

/** All'apertura del link: collega l'anonimo a quell'email (o entra nell'account che già la usa). Altrimenti null. */
export async function completeEmailLink(auth, url, email) {
  if (!isSignInWithEmailLink(auth, url) || !email) return null;
  return linkOrEnter(auth, EmailAuthProvider.credentialWithLink(email, url));
}

/** Esci: si torna a giocare da anonimi, con un'identità nuova. */
export async function signOutToAnonymous(auth) {
  await signOut(auth);
  await signInAnonymously(auth);
}

/** Cancella l'utente (i dati del profilo li toglie deleteProfile prima) e riparte da anonimo. */
export async function deleteAccount(auth) {
  await deleteUser(auth.currentUser);
  await signInAnonymously(auth);
}
