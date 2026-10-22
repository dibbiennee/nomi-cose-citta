import { useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { auth, db } from '../firebase';
import { startsWithLetter } from '../engine/rules';
import { CATEGORIE_PROTETTE, dizionarioCorrente } from './protezione';
import { chiaveParola, percorsoGiudizio } from './chiave.mjs';

const ATTESA_MAX_MS = 6000; // l'host aspetta i verdetti al massimo questo tempo prima di andare avanti
const RICHIESTA_MAX_MS = 25000;
const MAX_PAROLE = 40;

/** Le parole sconosciute al dizionario nelle risposte di questo round (non dei robot), senza doppioni. */
export function paroleSconosciute(room) {
  const dizionario = dizionarioCorrente();
  const viste = new Map();
  for (const [pid, per] of Object.entries(room?.answers || {})) {
    if (room.players?.[pid]?.bot || room.players?.[pid]?.waiting) continue;
    for (const [cat, testo] of Object.entries(per || {})) {
      if (!CATEGORIE_PROTETTE.includes(cat) || typeof testo !== 'string') continue;
      const t = testo.trim();
      if (!t || t.length > 40 || !startsWithLetter(t, room.round?.letter) || dizionario?.ha(cat, t, room.round?.letter)) continue;
      viste.set(percorsoGiudizio(cat, t), { cat, testo: t });
    }
  }
  return [...viste.values()].slice(0, MAX_PAROLE);
}

/**
 * Il giudice delle parole, lato telefono. Nelle stanze online, durante la correzione:
 *  - tutti leggono i verdetti dell'archivio per le parole sconosciute (si aggiornano da soli quando arrivano);
 *  - l'host, una volta per round, chiede al server di giudicare le parole nuove (errori e "spento" sono silenziosi:
 *    si vota come sempre).
 * Restituisce { archivio, attendi }: attendi() aspetta la risposta del server al massimo 6 secondi.
 */
export function useGiudizi({ room, code, uid }) {
  const [archivio, setArchivio] = useState({});
  const inCorso = useRef(null);
  const chiamato = useRef('');
  const attivo = room && !room.solo && room.status === 'review';
  const parole = useMemo(() => (attivo ? paroleSconosciute(room) : []), [attivo, room?.answers, room?.round?.letter]); // eslint-disable-line react-hooks/exhaustive-deps
  const percorsi = parole.map((p) => percorsoGiudizio(p.cat, p.testo)).join('|');

  useEffect(() => {
    if (!percorsi) { setArchivio({}); return undefined; }
    const offs = parole.map(({ cat, testo }) => onValue(ref(db, percorsoGiudizio(cat, testo)), (s) => {
      setArchivio((cur) => {
        const chiave = chiaveParola(testo);
        const voce = s.val();
        if ((cur[cat]?.[chiave]?.v) === voce?.v && (cur[cat]?.[chiave]?.at) === voce?.at) return cur;
        const next = { ...cur, [cat]: { ...cur[cat] } };
        if (voce) next[cat][chiave] = voce; else delete next[cat][chiave];
        return next;
      });
    }, () => {}));
    return () => offs.forEach((off) => off());
  }, [percorsi]); // eslint-disable-line react-hooks/exhaustive-deps

  // L'host chiede i verdetti una volta per round (e chi diventa host più tardi li richiede: il server salta le parole già giudicate).
  const isHost = !!room && room.hostId === uid;
  useEffect(() => {
    if (!attivo || !isHost || !parole.length) return;
    const chiave = `${code}:${room.round?.n}:${uid}`;
    if (chiamato.current === chiave) return;
    chiamato.current = chiave;
    inCorso.current = (async () => {
      const controllo = new AbortController();
      const timer = setTimeout(() => controllo.abort(), RICHIESTA_MAX_MS);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        await fetch('/api/giudica', {
          method: 'POST', signal: controllo.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ codice: code, round: room.round?.n, parole }),
        });
      } catch (e) { /* silenzioso: si vota come sempre */ } finally { clearTimeout(timer); }
    })();
  }, [attivo, isHost, percorsi, code, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const attendi = () => Promise.race([inCorso.current || Promise.resolve(), new Promise((r) => setTimeout(r, ATTESA_MAX_MS))]);
  return { archivio, attendi };
}
