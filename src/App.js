import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db, getEngine } from './firebase';
import { RoomError } from './engine/room';
import { createAnswerSaver } from './engine/salvataggio';
import { ranking } from './engine/rules';
import Home from './screens/Home';
import Setup from './screens/Setup';
import Invite from './screens/Invite';
import Lobby from './screens/Lobby';
import Spin from './screens/Spin';
import Play, { StopOverlay } from './screens/Play';
import Review from './screens/Review';
import Round from './screens/Round';
import { Awards, Final } from './screens/Finale';
import Solo from './screens/Solo';
import Statistiche from './screens/Statistiche';
import { track, setLive } from './stats';
import { createFounderStore } from './club/fondatore';
import { CHARACTER_IDS } from './club/contenuti';
import { createDictionary } from './solo/dizionario';
import { createSoloEngine, resumeSoloEngine, SOLO_CODE, SOLO_KEY } from './solo/motore';
import { createRecordStore } from './solo/record';
import { DIFFICULTIES } from './solo/robot';
import { NEED_NET, ErrorScreen, RulesSheet, OnlineSheet, JoinSheet, FounderSheet, InstallSheet, ScoresSheet, ExitSheet, OfflineBanner, Toast, Loading, IdleNotice } from './screens/Avvisi';

const LOCAL = (() => { try { return window.localStorage; } catch (e) { return null; } })();
// Sblocco della Modalità Fondatore, salvato su questo telefono. Solo cosmetico: non va mai a Firebase.
const founderStore = createFounderStore(LOCAL);

const PROFILE_KEY = 'ncc-profilo';
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && typeof p.name === 'string') {
      const char = CHARACTER_IDS.includes(p.char) && founderStore.isActive() ? p.char : undefined; // personaggio del club
      return { name: p.name.slice(0, 14), color: (p.color | 0) % 6, face: (p.face | 0) % 6, char };
    }
  } catch (e) { /* niente profilo salvato */ }
  return { name: '', color: 0, face: 0 };
}

// Partita da soli: record sul telefono, e parole dei robot caricate solo quando servono (file a parte).
const recordStore = createRecordStore(LOCAL);
let dictPromise = null;
const loadDictionary = () => {
  if (!dictPromise) dictPromise = import('./solo/parole').then((m) => createDictionary(m.LISTE)).catch((e) => { dictPromise = null; throw e; });
  return dictPromise;
};
// Le chiamate alle stanze senza risposta (Wi-Fi senza internet) non devono lasciare il caricamento per sempre.
const ROOM_TIMEOUT_MS = 8000;
const withTimeout = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ROOM_TIMEOUT_MS))]);
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const hasSavedSolo = () => { try { return Boolean(LOCAL?.getItem(SOLO_KEY)); } catch (e) { return false; } };
const codeFromPath = (path) => { const m = /^\/r\/([A-Za-z0-9]{4})\/?$/.exec(path); return m ? m[1].toUpperCase() : null; };
const go = (path) => { if (window.location.pathname !== path) window.history.pushState(null, '', path); };

export default function App() {
  const [netEngine, setEngine] = useState(null);
  // Con una partita da soli in corso il motore è quello locale: le schermate della partita non vedono differenze.
  const [solo, setSolo] = useState(null);
  const [soloPrefs, setSoloPrefs] = useState(null); // ultime scelte: difficoltà, robot, impostazioni
  const [soloResult, setSoloResult] = useState(null); // sul podio: punti a parola, record battuto
  const engine = solo || netEngine;
  const [profile, setProfileState] = useState(loadProfile);
  // Senza un link /r/CODICE la home compare subito, senza aspettare Firebase (che senza rete non risponde).
  const [view, setView] = useState(() => (window.location.pathname === '/statistiche' ? 'stats' : codeFromPath(window.location.pathname) ? 'loading' : 'home')); // loading | home | setup | invite | room | error | stats
  const [code, setCode] = useState(null);
  const [room, setRoom] = useState(null);
  const [inviteRoom, setInviteRoom] = useState(null);
  const [err, setErr] = useState(null); // { kind, info }
  const [sheet, setSheet] = useState(null); // rules | online | join | founder | install | scores | exit
  const [founder, setFounder] = useState(founderStore.isActive);
  const [editing, setEditing] = useState(false);
  const [toastText, setToastText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState({});
  const [stopping, setStopping] = useState(false);

  // Statistiche (src/stats.js): servono l'accesso a Firebase; prima che sia pronto restano in coda.
  const pendingStats = useRef([]);
  const stat = useCallback((key) => {
    if (netEngine) track(db, key).catch(() => {});
    else pendingStats.current.push(key);
  }, [netEngine]);
  useEffect(() => {
    if (!netEngine) return;
    pendingStats.current.splice(0).forEach((k) => track(db, k).catch(() => {}));
  }, [netEngine]);
  // Chi c'è adesso: home, stanza o partita da soli. La voce sparisce da sola quando il telefono si scollega.
  const place = solo ? 'solo' : view === 'room' ? 'stanza' : 'home';
  useEffect(() => {
    if (netEngine && view !== 'stats') setLive(db, netEngine.uid, place).catch(() => {});
  }, [netEngine, place, view]);
  useEffect(() => {
    const onInstalled = () => stat('installazioni');
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, [stat]);

  const toastTimer = useRef(null);
  const toast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToastText(text);
    toastTimer.current = setTimeout(() => setToastText(null), 2400);
  }, []);

  const setProfile = useCallback((p) => {
    setProfileState(p);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* va bene anche senza */ }
  }, []);

  const showError = useCallback((kind, info = {}) => { setErr({ kind, info }); setView('error'); setSheet(null); }, []);
  const goHome = useCallback(() => {
    setView('home'); setCode(null); setRoom(null); setInviteRoom(null); setEditing(false); setSheet(null); setErr(null);
    setSolo(null); setSoloResult(null);
    go('/');
  }, []);
  const enterRoom = useCallback((c) => { setCode(c); setView('room'); setEditing(false); setSheet(null); go(`/r/${c}`); }, []);

  const roomError = useCallback(async (e, c, eng) => {
    if (e instanceof RoomError) {
      let max;
      if (e.code === 'full') max = await eng.peekRoom(c).then((r) => r.settings?.maxPlayers).catch(() => undefined);
      showError(e.code, { code: c, max });
    } else {
      toast(offlineNow() || e.message === 'timeout' ? NEED_NET : 'Non riesco a collegarmi, riprova');
    }
  }, [showError, toast]);

  /** Apre un link /r/CODICE: se sei già nella stanza rientri, altrimenti vedi l'invito. */
  const openCode = useCallback(async (eng, c) => {
    try {
      const r = await withTimeout(eng.peekRoom(c));
      if (r.players?.[eng.uid]) { await withTimeout(eng.joinRoom(c, loadProfile())); enterRoom(c); return; }
      if (r.kicked?.[eng.uid]) { showError('kicked'); return; }
      setInviteRoom(r); setCode(c); setView('invite');
    } catch (e) { if (e instanceof RoomError) roomError(e, c, eng); else showError('offline'); }
  }, [enterRoom, roomError, showError]);

  const retryEngine = useRef(() => {});
  // Accesso anonimo in sottofondo, poi il link /r/CODICE se c'è. Senza rete riprova quando la rete torna:
  // la home intanto funziona (si gioca da soli), solo un link a una stanza mostra che serve internet.
  useEffect(() => {
    let alive = true;
    let done = false;
    const start = () => {
      if (done) return;
      getEngine().then((eng) => {
        if (!alive || done) return;
        done = true;
        setEngine(eng);
        const c = codeFromPath(window.location.pathname);
        if (c) openCode(eng, c);
      }).catch(() => { if (alive && codeFromPath(window.location.pathname)) showError('offline'); });
    };
    start();
    retryEngine.current = start;
    window.addEventListener('online', start);
    return () => { alive = false; window.removeEventListener('online', start); };
  }, [openCode, showError]);

  // Partita da soli lasciata a metà (app chiusa dal telefono): si riprende all'apertura.
  useEffect(() => {
    if (codeFromPath(window.location.pathname) || !hasSavedSolo()) return;
    loadDictionary().then((dict) => {
      const e = resumeSoloEngine({ dict, storage: LOCAL });
      if (!e) return;
      setSolo(e); setCode(SOLO_CODE); setView('room');
    }).catch(() => {});
  }, []);

  // Sul podio della partita da soli: una volta per partita, record salvato se la partita conta.
  const recordSaved = useRef(false);
  useEffect(() => {
    if (!solo || room?.status !== 'final') { recordSaved.current = false; return; }
    if (recordSaved.current) return;
    const r = solo.result();
    if (!r) return;
    recordSaved.current = true;
    const before = recordStore.get(solo.difficulty).migliore;
    const { beaten } = r.counts ? recordStore.save(solo.difficulty, r) : { beaten: false };
    setSoloResult({ ...r, beaten, best: beaten ? r.ppw : before });
    stat('solo_finite');
  }, [solo, room, stat]);

  // Connessione: l'avviso compare solo dopo che è stata attiva almeno una volta.
  useEffect(() => {
    let ever = false;
    return onValue(ref(db, '.info/connected'), (s) => {
      if (s.val() === true) { ever = true; setConnected(true); } else if (ever) setConnected(false);
    });
  }, []);

  // La stanza in tempo reale.
  useEffect(() => {
    if (!engine || view !== 'room' || !code) return undefined;
    let had = false;
    return engine.subscribe(code, (r) => {
      if (!r || !r.players) { showError('notfound', { code }); return; }
      if (!r.players[engine.uid]) {
        if (r.kicked?.[engine.uid]) { engine.forget(); showError('kicked'); } else if (had) goHome();
        return;
      }
      had = true;
      setRoom(r);
    });
  }, [engine, view, code, showError, goHome]);

  // Orologio del server, per lettera, conto alla rovescia e timer.
  useEffect(() => {
    if (!engine || view !== 'room') return undefined;
    const iv = setInterval(() => { if (solo) solo.tick(); setNow(engine.now()); }, 200);
    return () => clearInterval(iv);
  }, [engine, view, solo]);

  // Indietro del browser.
  useEffect(() => {
    const onPop = () => {
      const c = codeFromPath(window.location.pathname);
      // La partita da soli non si chiude col tasto indietro: resta salvata e riprende alla prossima apertura.
      if (solo) return;
      if (!c && engine && code && view === 'room') { engine.leaveRoom(code).catch(() => {}); goHome(); } else if (!c) goHome();
      else if (engine && c !== code) openCode(engine, c);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [engine, code, view, goHome, openCode, solo]);

  const status = room?.status;
  const round = room?.round;
  const roundKey = round ? `${round.n}:${round.letter}:${round.startsAt}` : null;

  // Risposte: locali mentre scrivi, salvate dopo una pausa di 300 ms, oppure subito se la pagina va in secondo
  // piano (altra app, schermo bloccato, pagina chiusa). Rientrando a metà round si riprendono dal database.
  const answersRef = useRef({});
  const saver = useMemo(() => createAnswerSaver((v) => (engine && code ? engine.saveAnswers(code, v) : null), 300), [engine, code]);
  useEffect(() => {
    const flush = () => saver.flush();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      saver.flush();
    };
  }, [saver]);
  useEffect(() => {
    const mine = (room?.answers && engine && room.answers[engine.uid]) || {};
    answersRef.current = mine;
    setAnswers(mine);
    saver.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  const setAnswer = useCallback((key, value) => {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    saver.set(next);
  }, [saver]);

  // Quando il round si chiude: STOP a tutto schermo e le ultime lettere salvate subito.
  // Partite online: l'host conta la partita (all'inizio e al podio), ogni telefono in gioco conta sé stesso.
  const prevOnline = useRef(null);
  useEffect(() => {
    const st = room?.status;
    const before = prevOnline.current;
    prevOnline.current = st;
    if (solo || !room || !engine || st === before) return;
    const isHost = room.hostId === engine.uid;
    if (st === 'spin' && room.round?.n === 1) {
      if (isHost) stat('partite_online');
      if (!room.players?.[engine.uid]?.waiting) stat('giocatori_online');
    }
    if (st === 'final' && before === 'awards' && isHost) stat('partite_online_finite');
  }, [room, solo, engine, stat]);

  const prevStatus = useRef(null);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev === 'play' && status === 'review') {
      saver.cancel();
      if (engine && round?.stoppedBy !== engine.uid && Object.keys(answersRef.current).length) {
        engine.saveAnswers(code, answersRef.current).catch(() => {});
      }
      setStopping(true);
      setSheet(null);
      const t = setTimeout(() => setStopping(false), 1700);
      return () => clearTimeout(t);
    }
    if (status !== 'play' && status !== 'review') setStopping(false);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Passaggi automatici che non dipendono dall'host: fine del conto alla rovescia e tempo scaduto.
  const autoDone = useRef({});
  useEffect(() => {
    if (!engine || !room || !round || !code) return;
    if (status === 'spin' && now >= round.startsAt && autoDone.current.play !== roundKey) {
      autoDone.current.play = roundKey;
      engine.goPlay(code).catch(() => { autoDone.current.play = null; });
    }
    // STOP rimasto a metà (chi l'ha premuto ha perso la connessione): dopo 2 secondi lo completa questo telefono.
    if (status === 'play' && round.stoppedBy) {
      if (!autoDone.current.stopSeen || autoDone.current.stopKey !== roundKey) { autoDone.current.stopSeen = now; autoDone.current.stopKey = roundKey; }
      if (now - autoDone.current.stopSeen > 2000 && autoDone.current.stopDone !== roundKey) {
        autoDone.current.stopDone = roundKey;
        engine.finishStop(code).catch(() => { autoDone.current.stopDone = null; });
      }
    }
    if (status === 'play' && round.endsAt && now >= round.endsAt && autoDone.current.time !== roundKey) {
      autoDone.current.time = roundKey;
      engine.timeUp(code).catch(() => { autoDone.current.time = null; });
    }
  }, [engine, room, round, status, now, code, roundKey]);

  // Avvisi in lobby: chi entra, e chi diventa host.
  const prevRoom = useRef(null);
  useEffect(() => {
    const prev = prevRoom.current;
    prevRoom.current = room;
    if (!prev || !room || !engine) return;
    if (room.status === 'lobby') {
      const nuovi = Object.keys(room.players).filter((id) => !prev.players?.[id] && id !== engine.uid);
      if (nuovi.length) toast(`${room.players[nuovi[0]].name} è nella stanza`);
    }
    if (prev.hostId !== room.hostId && room.players[room.hostId]) {
      toast(room.hostId === engine.uid ? 'Ora sei tu l\'host' : `Ora decide ${room.players[room.hostId].name}`);
    }
  }, [room, engine, toast]);

  const leave = useCallback(async () => {
    setSheet(null);
    if (engine && code) await engine.leaveRoom(code).catch(() => {});
    goHome();
  }, [engine, code, goHome]);

  const act = useCallback(async (fn) => {
    try { await fn(); } catch (e) {
      if (e instanceof RoomError && e.code === 'few') toast('Servono almeno 2 giocatori online');
      else if (e instanceof RoomError && e.code === 'nothost') toast('Decide l\'host');
      else toast('Non è andata, riprova');
    }
  }, [toast]);

  const needName = () => { if (profile.name.trim()) return false; toast('Scrivi prima il tuo nome'); return true; };
  const openSolo = () => { goHome(); setView('solo'); };
  // Senza rete si dice subito; con la rete ma senza accesso ancora pronto (primi secondi, o accesso fallito) si ritenta.
  const needNet = () => {
    if (offlineNow()) { toast(NEED_NET); return true; }
    if (netEngine) return false;
    retryEngine.current();
    toast('Mi sto collegando, riprova tra un attimo');
    return true;
  };

  /** Nuova partita contro i robot (anche dal podio, con "Cambia categorie e round"). */
  const startSolo = async ({ difficulty, botCount, settings }) => {
    try {
      const dict = await loadDictionary();
      if (solo) await solo.leaveRoom();
      const e = createSoloEngine({ profile, settings, difficulty, botCount, dict, storage: LOCAL });
      setSoloPrefs({ difficulty, botCount, settings });
      setSoloResult(null);
      setSolo(e); setCode(SOLO_CODE); setRoom(null); setEditing(false); setSheet(null); setView('room');
      stat(`solo_${difficulty}`);
      go('/');
      await e.startGame(SOLO_CODE);
    } catch (err2) { toast('Non riesco a preparare la partita, riprova'); }
  };
  const soloRecords = () => Object.fromEntries(DIFFICULTIES.map((d) => [d, recordStore.get(d)]));

  const joinWith = async (c) => {
    if (needNet() || needName()) { setSheet(null); return; }
    setBusy(true);
    try { await withTimeout(engine.joinRoom(c, profile)); enterRoom(c); } catch (e) { roomError(e, c, engine); } finally { setBusy(false); }
  };

  const g = useMemo(() => {
    if (!room || !engine) return null;
    const uid = engine.uid;
    const isOnline = (id) => room.presence?.[id] !== false;
    const players = Object.entries(room.players).map(([id, p]) => ({ id, ...p, online: isOnline(id) }))
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return {
      room, round, code, uid, engine, now, answers, setAnswer, toast, setSheet, act, leave, isOnline,
      solo: solo ? { difficulty: solo.difficulty, ...soloResult } : null,
      players,
      active: players.filter((p) => !p.waiting), // in partita (anche offline, mostrati spenti)
      scoring: players.filter((p) => !p.waiting && p.online), // quelli che contano nella correzione
      onlineCount: players.filter((p) => p.online).length,
      ranked: ranking(room.players),
      me: room.players[uid],
      isHost: room.hostId === uid,
      hostName: room.players[room.hostId]?.name || 'l\'host',
      openSettings: () => setEditing(true),
    };
  }, [room, round, code, engine, now, answers, setAnswer, toast, act, leave, solo, soloResult]);

  let screen;
  if (view === 'stats') screen = <Statistiche />;
  else if (view === 'loading' || (view === 'room' && !g)) screen = <Loading />;
  else if (view === 'home') {
    screen = <Home profile={profile} setProfile={setProfile} onRules={() => setSheet('rules')}
      onOnline={() => setSheet('online')}
      founder={founder} onFounder={() => setSheet('founder')} onInstall={() => setSheet('install')} onSolo={() => setView('solo')} />;
  } else if (view === 'solo') {
    screen = <Solo records={soloRecords()} initial={soloPrefs} onBack={() => setView('home')} onStart={startSolo} toast={toast} />;
  } else if (view === 'setup') {
    screen = <Setup toast={toast} onBack={() => setView('home')}
      onSave={async (settings) => {
        try { enterRoom(await withTimeout(netEngine.createRoom(profile, settings))); stat('stanze_create'); } catch (e) { toast(offlineNow() || e.message === 'timeout' ? NEED_NET : 'Non riesco a creare la stanza, riprova'); }
      }} />;
  } else if (view === 'invite') {
    screen = <Invite code={code} room={inviteRoom} profile={profile} setProfile={setProfile} busy={busy} onJoin={() => joinWith(code)} />;
  } else if (view === 'error') {
    screen = <ErrorScreen kind={err?.kind} info={err?.info} onButton={goHome} onSolo={openSolo} />;
  } else if (g.me.waiting && ['spin', 'play', 'review', 'round'].includes(status)) {
    screen = <ErrorScreen kind="started" info={{ code }} onButton={leave} />;
  } else if (status === 'lobby' && solo) {
    screen = <Solo records={soloRecords()} initial={soloPrefs} onBack={leave} onStart={startSolo} toast={toast} />;
  } else if (status === 'lobby') {
    screen = editing
      ? <Setup editing initial={room.settings} toast={toast} onBack={() => setEditing(false)}
        onSave={async (s) => { await act(async () => { await engine.updateSettings(code, s); setEditing(false); toast('Impostazioni aggiornate per tutti'); }); }} />
      : <Lobby g={g} />;
  } else if (status === 'spin') screen = <Spin g={g} />;
  else if (status === 'play') screen = <Play g={g} />;
  else if (status === 'review') screen = <Review g={g} />;
  else if (status === 'round') screen = <Round g={g} />;
  else if (status === 'awards') screen = <Awards g={g} />;
  else if (status === 'final') screen = <Final g={g} />;
  else screen = <Loading />;

  const screenKey = view === 'room' ? `${status}-${editing}-${g?.me?.waiting ? 'w' : ''}` : view;
  return (
    <main className="n-app">
      <React.Fragment key={screenKey}>{screen}</React.Fragment>
      {stopping && g && status === 'review' && <StopOverlay g={g} />}
      {g && view === 'room' && !solo && !g.me?.waiting && <IdleNotice g={g} />}
      {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === 'online' && <OnlineSheet onClose={() => setSheet(null)} onJoin={() => setSheet('join')}
        onCreate={() => { setSheet(null); if (!needNet() && !needName()) setView('setup'); }} />}
      {sheet === 'join' && <JoinSheet onClose={() => setSheet(null)} onJoin={(c) => { setSheet(null); joinWith(c); }}
        onFounder={() => { founderStore.activate(); setFounder(true); setSheet(null); }} />}
      {sheet === 'install' && <InstallSheet onClose={() => setSheet(null)} toast={toast} />}
      {sheet === 'founder' && <FounderSheet onClose={() => setSheet(null)}
        onRevoke={() => { founderStore.revoke(); setFounder(false); setProfile({ ...profile, char: undefined }); setSheet(null); toast('Modalità Fondatore disattivata'); }} />}
      {sheet === 'scores' && g && <ScoresSheet g={g} onClose={() => setSheet(null)} onExit={() => setSheet('exit')} />}
      {sheet === 'exit' && <ExitSheet onClose={() => setSheet(null)} onLeave={leave} />}
      {!connected && !solo && (view === 'room' || view === 'invite') && <OfflineBanner />}
      {toastText && <Toast key={toastText} text={toastText} />}
    </main>
  );
}
