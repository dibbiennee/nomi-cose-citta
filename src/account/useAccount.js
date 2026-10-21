import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { onIdTokenChanged, getRedirectResult, GoogleAuthProvider, signInWithCredential, isSignInWithEmailLink } from 'firebase/auth';
import { auth, db } from '../firebase';
import { isRegistered, linkGoogle, sendEmailLink, completeEmailLink, signOutToAnonymous, deleteAccount, reauthGoogle, usesGoogle, EMAIL_KEY, MODE_KEY } from './accesso';
import { createProfile, earnCoins, touchDay, claimMilestones, missingMilestones, finishGame, claimDaily, buyItem, equip, setUsername, claimInvites, joinWaitlist, leaveWaitlist, isOnWaitlist, deleteProfile, gameCoins } from './profilo';
import { isStandalone } from '../ui/installa';
import { dayKey } from '../stats';
import { toDayN } from '../ritorno/serie';

// L'account dentro l'app: chi sei, il tuo profilo dal vivo (monete, accessori, username), e le azioni.
// Quando l'accesso cambia identità (account già esistente su un altro telefono, uscita, cancellazione) la pagina si
// ricarica: il motore delle stanze è legato all'identità e così riparte pulito.
export const PENDING_KEY = 'ncc-monete-in-sospeso'; // monete dell'ultima partita giocata senza account
export const INVITE_KEY = 'ncc-invito'; // chi ci ha invitato, letto da /?invito=
export const QUEUE_KEY = 'ncc-monete-da-accreditare'; // monete di partite finite senza che arrivassero (rete assente)
const DELETE_KEY = 'ncc-cancella'; // la cancellazione aspetta il ritorno dal redirect di Google
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
  const [festa, setFesta] = useState(null); // traguardo appena raggiunto: { n, coins, items }
  const user = auth.currentUser;
  const registered = isRegistered(user);
  const uid = user?.uid;
  const statRef = useRef(stat);
  statRef.current = stat;

  useEffect(() => onIdTokenChanged(auth, () => setVer((v) => v + 1)), []);

  // Cancellazione: prima i dati, poi l'utente. Mentre succede il profilo sparito non va ricreato.
  const removing = useRef(false);
  const finishRemoval = useCallback(async (fresh) => {
    removing.current = true;
    lsSet(DELETE_KEY, null);
    const r = await deleteAccount(auth, () => deleteProfile(db, auth.currentUser.uid), { fresh });
    if (r === 'ok') { window.location.replace('/'); return 'ok'; }
    removing.current = false;
    return r;
  }, []);

  // Ritorno dall'accesso: redirect di Google (app installata su iPhone) o link dell'email.
  const handled = useRef(false);
  useEffect(() => {
    if (!ready || handled.current) return;
    handled.current = true;
    (async () => {
      try {
        const r = await getRedirectResult(auth);
        if (r && r.operationType === 'reauthenticate' && lsGet(DELETE_KEY)) { await finishRemoval(true); return; }
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
        const mode = lsGet(MODE_KEY) || 'collega';
        try {
          await completeEmailLink(auth, window.location.href, email, mode);
          lsSet(EMAIL_KEY, null);
          lsSet(MODE_KEY, null);
          if (mode === 'cancella') {
            if (await finishRemoval(true) !== 'ok') { toast('Cancellazione non riuscita: riprova dalla schermata Account'); window.history.replaceState(null, '', '/'); }
            return;
          }
          window.location.replace('/');
        } catch (e) {
          window.history.replaceState(null, '', '/');
          if (e.code === 'auth/email-already-in-use') {
            // Il link usato non vale più: ne serve uno nuovo che entri nell'account esistente invece di collegare.
            await sendEmailLink(auth, email, `${window.location.origin}/`, LS, 'entra')
              .then(() => toast('Questa email ha già un account: ti abbiamo mandato un nuovo link per entrare'))
              .catch(() => toast('Questa email ha già un account: chiedi un nuovo link dalla schermata Account'));
          } else toast('Il link non è più valido: chiedine uno nuovo');
        }
      }
    })();
  }, [ready, uid, toast, finishRemoval]);

  // Profilo dal vivo; alla prima volta da registrato si crea (benvenuto, monete in sospeso, invito).
  // Se la creazione non riesce (rete, o un'altra iscrizione nello stesso istante) si riprova dopo qualche secondo.
  useEffect(() => {
    if (!registered || !uid) { setProfile(null); return undefined; }
    let creating = false;
    let timer = null;
    const create = async () => {
      if (creating || removing.current) return;
      creating = true;
      try {
        const r = await createProfile(db, uid, { pendingCoins: +(lsGet(PENDING_KEY) || 0), invitedBy: lsGet(INVITE_KEY) });
        lsSet(PENDING_KEY, null);
        lsSet(INVITE_KEY, null);
        statRef.current('account_creati');
        toast(r.primi100 ? `Benvenuto! ${r.coins} monete e gli accessori esclusivi` : `Benvenuto! ${r.coins} monete per te`);
      } catch (e) { timer = setTimeout(create, 4000); }
      creating = false;
    };
    const off = onValue(ref(db, `users/${uid}`), (s) => {
      if (s.exists()) { setProfile(s.val()); return; }
      create();
    });
    return () => { off(); clearTimeout(timer); };
  }, [registered, uid, toast]);

  // All'apertura, e di nuovo quando il telefono torna in primo piano o ritrova la rete se il giorno è cambiato o
  // l'apertura non era andata a buon fine: partita rimasta in coda, giorni di fila e traguardi, bonus del giorno
  // (che dipende dalla serie) e inviti andati a buon fine.
  const [tick, setTick] = useState(0);
  const daily = useRef('');
  const running = useRef(false);
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    const vis = () => { if (document.visibilityState === 'visible') again(); };
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('online', again); document.removeEventListener('visibilitychange', vis); };
  }, []);
  useEffect(() => {
    const today = dayKey(Date.now());
    if (!profile || !uid || running.current) return;
    if (daily.current === today && profile.lastDay === toDayN(today)) return; // già fatto oggi
    daily.current = today;
    running.current = true;
    (async () => {
      // Una partita finita senza che le monete arrivassero (o prima di entrare in un account che esisteva già):
      // si riprova con il risultato intero, così scrigno e sfide non si perdono. Una partita alla volta.
      const raw = lsGet(QUEUE_KEY);
      let queued = null;
      try { queued = raw ? JSON.parse(raw) : null; } catch (e) { queued = null; }
      if (queued && typeof queued === 'object' && queued.result) {
        lsSet(QUEUE_KEY, null);
        const r = await finishGame(db, uid, { result: queued.result, today: queued.day }).catch(() => null);
        if (r) toast(`+${r.coins} monete: l'ultima partita`);
      } else {
        const coins = (typeof queued === 'number' ? queued : 0) || +(lsGet(PENDING_KEY) || 0);
        if (coins > 0) {
          lsSet(QUEUE_KEY, null);
          lsSet(PENDING_KEY, null);
          const got = Math.min(20, coins);
          if (await earnCoins(db, uid, got).then(() => true, () => false)) toast(`+${got} monete: l'ultima partita`);
        }
      }
      lsSet(PENDING_KEY, null);
      // Prima i giorni di fila (e i traguardi, anche quelli rimasti indietro), poi il bonus in monete che ne dipende.
      const t = await touchDay(db, uid, today).catch(() => null);
      if (t) {
        if (t.event === 'riparte') statRef.current('serie_persa');
        if (t.event === 'scudo') statRef.current('scudo_usato');
        t.reached.forEach((n) => statRef.current(`serie_${n}`));
      }
      const missing = await missingMilestones(db, uid).catch(() => []);
      if (missing.length) {
        const got = await claimMilestones(db, uid, missing).catch(() => ({ coins: 0, items: [] }));
        if (got.coins) setFesta({ n: Math.max(...missing), coins: got.coins, items: got.items });
      }
      const d = await claimDaily(db, uid, today).catch(() => null);
      if (d) toast(d.streak > 1 ? `+${d.amount} monete: ${d.streak} giorni di fila` : `+${d.amount} monete: bonus del giorno`);
      const inv = await claimInvites(db, uid).catch(() => 0);
      if (inv) toast(`+${inv} monete: un amico è arrivato col tuo invito`);
      running.current = false;
    })().catch(() => { running.current = false; });
  }, [profile, uid, toast, tick]);

  /** Fine partita: con l'account le monete arrivano, senza restano in sospeso (ultima partita) per quando si registra. */
  const earn = useCallback(async (result) => {
    const amount = gameCoins(result);
    if (!registered || !uid) { lsSet(PENDING_KEY, String(amount)); return { amount, kept: false }; }
    const today = dayKey(Date.now());
    // Prima in coda (risultato intero), poi si prova: se la rete manca o la pagina si chiude, alla prossima apertura
    // arrivano monete, scrigno e sfide. Se la scrittura arriva in ritardo, la coda si svuota quando va a buon fine.
    lsSet(QUEUE_KEY, JSON.stringify({ result, day: today }));
    const work = finishGame(db, uid, { result, today }).then((r) => { lsSet(QUEUE_KEY, null); return r; }, () => 'no');
    const wait = new Promise((resolve) => setTimeout(() => resolve('lento'), 8000));
    const done = await Promise.race([work, wait]);
    if (done === 'lento' || done === 'no') return { amount, kept: false, late: true };
    if (done.chest) { statRef.current('scrigni_aperti'); if (done.chest.kind === 'raro') statRef.current('scrigni_rari'); }
    return { amount, kept: true, chest: done.chest, done: done.done };
  }, [registered, uid]);

  const afterSwitch = (r) => { if (r && r.merged) window.location.reload(); };
  return {
    user, uid, registered, profile, festa, closeFesta: () => setFesta(null),
    email: user?.email || '',
    coins: profile?.coins ?? 0,
    earn,
    google: async () => afterSwitch(await linkGoogle(auth, { standalone: isStandalone() })),
    emailLink: (email) => sendEmailLink(auth, email, `${window.location.origin}/`),
    signOut: async () => { await signOutToAnonymous(auth); window.location.replace('/'); },
    /**
     * Cancella tutto: 'ok' (poi la pagina riparte), oppure 'link' se per confermare l'identità è partito un link
     * all'email. Con Google la conferma è la finestra di Google, poi la cancellazione prosegue da sola.
     */
    remove: async () => {
      if (await finishRemoval(false) === 'ok') return 'ok';
      if (usesGoogle(auth.currentUser)) {
        lsSet(DELETE_KEY, '1');
        if (await reauthGoogle(auth, { standalone: isStandalone() })) return finishRemoval(true);
        return 'redirect';
      }
      await sendEmailLink(auth, auth.currentUser.email, `${window.location.origin}/`, LS, 'cancella');
      return 'link';
    },
    setUsername: (name) => setUsername(db, uid, name),
    buy: (id) => buyItem(db, uid, id),
    equip: (tipo, id) => equip(db, uid, tipo, id),
    joinWaitlist: (data) => joinWaitlist(db, uid, data),
    leaveWaitlist: () => leaveWaitlist(db, uid),
    onWaitlist: () => isOnWaitlist(db, uid).catch(() => false),
    readIscritti: () => get(ref(db, 'meta/iscritti')).then((s) => s.val() || 0).catch(() => null),
    inviteLink: uid ? `${window.location.origin}/?invito=${uid}` : '',
  };
}
