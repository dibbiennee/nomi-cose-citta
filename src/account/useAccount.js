import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { onIdTokenChanged, getRedirectResult, GoogleAuthProvider, signInWithCredential, isSignInWithEmailLink } from 'firebase/auth';
import { auth, db } from '../firebase';
import { isRegistered, linkGoogle, sendEmailLink, completeEmailLink, signOutToAnonymous, deleteAccount, EMAIL_KEY } from './accesso';
import { createProfile, earnGame, claimDaily, buyItem, equip, setUsername, claimInvites, joinWaitlist, leaveWaitlist, deleteProfile, gameCoins } from './profilo';
import { isStandalone } from '../ui/installa';
import { dayKey } from '../stats';

// L'account dentro l'app: chi sei, il tuo profilo dal vivo (monete, accessori, username), e le azioni.
// Quando l'accesso cambia identità (account già esistente su un altro telefono, uscita, cancellazione) la pagina si
// ricarica: il motore delle stanze è legato all'identità e così riparte pulito.
export const PENDING_KEY = 'ncc-monete-in-sospeso'; // monete dell'ultima partita giocata senza account
export const INVITE_KEY = 'ncc-invito'; // chi ci ha invitato, letto da /?invito=
const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const lsGet = (k) => { try { return LS?.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v === null) LS?.removeItem(k); else LS?.setItem(k, v); } catch (e) { /* niente */ } };
const IN_USE = ['auth/credential-already-in-use', 'auth/email-already-in-use'];

// Chi arriva da un link d'invito: lo si ricorda finché non crea l'account.
try {
  const inv = new URLSearchParams(window.location.search).get('invito');
  if (inv && /^[A-Za-z0-9]{10,40}$/.test(inv)) lsSet(INVITE_KEY, inv);
} catch (e) { /* niente */ }

export function useAccount({ ready, stat, toast }) {
  const [, setVer] = useState(0);
  const [profile, setProfile] = useState(null);
  const user = auth.currentUser;
  const registered = isRegistered(user);
  const uid = user?.uid;
  const statRef = useRef(stat);
  statRef.current = stat;

  useEffect(() => onIdTokenChanged(auth, () => setVer((v) => v + 1)), []);

  // Ritorno dall'accesso: redirect di Google (app installata su iPhone) o link dell'email.
  const handled = useRef(false);
  useEffect(() => {
    if (!ready || handled.current) return;
    handled.current = true;
    (async () => {
      try {
        const r = await getRedirectResult(auth);
        if (r && r.user.uid !== uid) window.location.reload();
      } catch (e) {
        if (IN_USE.includes(e.code)) {
          await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e)).catch(() => {});
          window.location.reload();
        }
      }
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = lsGet(EMAIL_KEY);
        if (!email) email = window.prompt('Per finire l\'accesso scrivi l\'email a cui è arrivato il link');
        try {
          await completeEmailLink(auth, window.location.href, email);
          lsSet(EMAIL_KEY, null);
          window.location.replace('/');
        } catch (e) { toast('Il link non è più valido: chiedine uno nuovo'); window.history.replaceState(null, '', '/'); }
      }
    })();
  }, [ready, uid, toast]);

  // Profilo dal vivo; alla prima volta da registrato si crea (benvenuto, monete in sospeso, invito).
  useEffect(() => {
    if (!registered || !uid) { setProfile(null); return undefined; }
    let creating = false;
    return onValue(ref(db, `users/${uid}`), async (s) => {
      if (s.exists()) { setProfile(s.val()); return; }
      if (creating) return;
      creating = true;
      try {
        const r = await createProfile(db, uid, { pendingCoins: +(lsGet(PENDING_KEY) || 0), invitedBy: lsGet(INVITE_KEY) });
        lsSet(PENDING_KEY, null);
        lsSet(INVITE_KEY, null);
        statRef.current('account_creati');
        toast(r.primi100 ? `Benvenuto! ${r.coins} monete e gli accessori esclusivi` : `Benvenuto! ${r.coins} monete per te`);
      } catch (e) { creating = false; }
    });
  }, [registered, uid, toast]);

  // Una volta per apertura: bonus del giorno e inviti andati a buon fine.
  const daily = useRef(false);
  useEffect(() => {
    if (!profile || !uid || daily.current) return;
    daily.current = true;
    (async () => {
      const d = await claimDaily(db, uid, dayKey(Date.now())).catch(() => null);
      if (d) toast(d.streak > 1 ? `+${d.amount} monete: ${d.streak} giorni di fila` : `+${d.amount} monete: bonus del giorno`);
      const inv = await claimInvites(db, uid).catch(() => 0);
      if (inv) toast(`+${inv} monete: un amico è arrivato col tuo invito`);
    })();
  }, [profile, uid, toast]);

  /** Fine partita: con l'account le monete arrivano, senza restano in sospeso (ultima partita) per quando si registra. */
  const earn = useCallback(async (result) => {
    const amount = gameCoins(result);
    if (!registered || !uid) { lsSet(PENDING_KEY, String(amount)); return { amount, kept: false }; }
    try { await earnGame(db, uid, result); return { amount, kept: true }; } catch (e) { return { amount, kept: false, late: true }; }
  }, [registered, uid]);

  const afterSwitch = (r) => { if (r && r.merged) window.location.reload(); };
  return {
    user, uid, registered, profile,
    email: user?.email || '',
    coins: profile?.coins ?? 0,
    earn,
    google: async () => afterSwitch(await linkGoogle(auth, { standalone: isStandalone() })),
    emailLink: (email) => sendEmailLink(auth, email, `${window.location.origin}/`),
    signOut: async () => { await signOutToAnonymous(auth); window.location.replace('/'); },
    remove: async () => { await deleteProfile(db, uid); await deleteAccount(auth); window.location.replace('/'); },
    setUsername: (name) => setUsername(db, uid, name),
    buy: (id) => buyItem(db, uid, id),
    equip: (tipo, id) => equip(db, uid, tipo, id),
    joinWaitlist: (data) => joinWaitlist(db, uid, data),
    leaveWaitlist: () => leaveWaitlist(db, uid),
    readIscritti: () => get(ref(db, 'meta/iscritti')).then((s) => s.val() || 0).catch(() => null),
    inviteLink: uid ? `${window.location.origin}/?invito=${uid}` : '',
  };
}
