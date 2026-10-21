import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { dayKey } from '../stats';
import { claimChallenge } from '../account/profilo';
import { challengesFor } from './sfide';
import { nextMilestone } from './serie';

/**
 * Lo stato di "Oggi" per chi ha l'account: giorni di fila, prossimo traguardo, scudo e le tre sfide con il loro
 * stato (fatta, riscossa). Le sfide fatte stanno nel profilo; i segni delle riscosse in claims/{uid}.
 */
export function useRitorno({ account, stat, toast }) {
  const { uid, registered, profile } = account;
  const today = dayKey(Date.now());
  const [claims, setClaims] = useState([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    if (!registered || !uid) { setClaims([]); return undefined; }
    return onValue(ref(db, `claims/${uid}`), (s) => setClaims(Object.keys(s.val() || {})), () => setClaims([]));
  }, [registered, uid]);

  const fatte = profile?.sfideFatte?.[today] || {};
  const sfide = challengesFor(today).map((c) => ({ id: c.id, nome: c.nome, tier: c.tier, reward: c.reward, fatta: !!fatte[c.id], riscossa: claims.includes(`s_${today}_${c.id}`) }));
  const streak = profile?.streak || 0;
  const daPrendere = sfide.filter((s) => s.fatta && !s.riscossa).length;

  const riscuoti = useCallback(async (id) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const s = challengesFor(today).find((c) => c.id === id);
    const r = await claimChallenge(db, uid, today, id).catch(() => 'errore');
    busyRef.current = false;
    setBusy(false);
    if (r === 'ok') { toast(`+${s.reward} monete: sfida fatta`); stat(`sfida_${s.tier}`); }
    else if (r !== 'già') toast('Non è andata: aspetta qualche secondo e riprova');
  }, [uid, today, toast, stat]);

  return {
    registered, today, streak, busy, sfide, daPrendere, riscuoti,
    fatte: sfide.filter((s) => s.fatta).length,
    prossimo: nextMilestone(streak),
    scudoLibero: (profile?.scudo || '') !== today.slice(0, 7),
  };
}
