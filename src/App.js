import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db, getEngine } from './firebase';
import { RoomError } from './engine/room';
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
import { ErrorScreen, RulesSheet, JoinSheet, ScoresSheet, ExitSheet, OfflineBanner, Toast, Loading } from './screens/Avvisi';

const PROFILE_KEY = 'ncc-profilo';
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && typeof p.name === 'string') return { name: p.name.slice(0, 14), color: (p.color | 0) % 6, face: (p.face | 0) % 6 };
  } catch (e) { /* niente profilo salvato */ }
  return { name: '', color: 0, face: 0 };
}
const codeFromPath = (path) => { const m = /^\/r\/([A-Za-z0-9]{4})\/?$/.exec(path); return m ? m[1].toUpperCase() : null; };
const go = (path) => { if (window.location.pathname !== path) window.history.pushState(null, '', path); };

export default function App() {
  const [engine, setEngine] = useState(null);
  const [profile, setProfileState] = useState(loadProfile);
  const [view, setView] = useState('loading'); // loading | home | setup | invite | room | error
  const [code, setCode] = useState(null);
  const [room, setRoom] = useState(null);
  const [inviteRoom, setInviteRoom] = useState(null);
  const [err, setErr] = useState(null); // { kind, info }
  const [sheet, setSheet] = useState(null); // rules | join | scores | exit
  const [editing, setEditing] = useState(false);
  const [toastText, setToastText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState({});
  const [stopping, setStopping] = useState(false);

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
    go('/');
  }, []);
  const enterRoom = useCallback((c) => { setCode(c); setView('room'); setEditing(false); setSheet(null); go(`/r/${c}`); }, []);

  const roomError = useCallback(async (e, c, eng) => {
    if (e instanceof RoomError) {
      let max;
      if (e.code === 'full') max = await eng.peekRoom(c).then((r) => r.settings?.maxPlayers).catch(() => undefined);
      showError(e.code, { code: c, max });
    } else {
      toast('Non riesco a collegarmi, riprova');
    }
  }, [showError, toast]);

  /** Apre un link /r/CODICE: se sei già nella stanza rientri, altrimenti vedi l'invito. */
  const openCode = useCallback(async (eng, c) => {
    try {
      const r = await eng.peekRoom(c);
      if (r.players?.[eng.uid]) { await eng.joinRoom(c, loadProfile()); enterRoom(c); return; }
      if (r.kicked?.[eng.uid]) { showError('kicked'); return; }
      setInviteRoom(r); setCode(c); setView('invite');
    } catch (e) { roomError(e, c, eng); }
  }, [enterRoom, roomError, showError]);

  // Accesso anonimo, poi il percorso iniziale.
  useEffect(() => {
    let alive = true;
    getEngine().then((eng) => {
      if (!alive) return;
      setEngine(eng);
      const c = codeFromPath(window.location.pathname);
      if (c) openCode(eng, c); else setView('home');
    }).catch(() => alive && showError('offline'));
    return () => { alive = false; };
  }, [openCode, showError]);

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
    const iv = setInterval(() => setNow(engine.now()), 200);
    return () => clearInterval(iv);
  }, [engine, view]);

  // Indietro del browser.
  useEffect(() => {
    const onPop = () => {
      const c = codeFromPath(window.location.pathname);
      if (!c && engine && code && view === 'room') { engine.leaveRoom(code).catch(() => {}); goHome(); } else if (!c) goHome();
      else if (engine && c !== code) openCode(engine, c);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [engine, code, view, goHome, openCode]);

  const status = room?.status;
  const round = room?.round;
  const roundKey = round ? `${round.n}:${round.letter}:${round.startsAt}` : null;

  // Risposte: locali mentre scrivi, salvate dopo 300 ms. Rientrando a metà round si riprendono dal database.
  const answersRef = useRef({});
  const saveTimer = useRef(null);
  useEffect(() => {
    const mine = (room?.answers && engine && room.answers[engine.uid]) || {};
    answersRef.current = mine;
    setAnswers(mine);
    clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  const setAnswer = useCallback((key, value) => {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => engine?.saveAnswers(code, answersRef.current).catch(() => {}), 300);
  }, [engine, code]);

  // Quando il round si chiude: STOP a tutto schermo e le ultime lettere salvate subito.
  const prevStatus = useRef(null);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev === 'play' && status === 'review') {
      clearTimeout(saveTimer.current);
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
    if (prev.hostId !== room.hostId && room.hostId === engine.uid) toast('Ora sei tu l\'host');
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

  const joinWith = async (c) => {
    if (needName()) { setSheet(null); return; }
    setBusy(true);
    try { await engine.joinRoom(c, profile); enterRoom(c); } catch (e) { roomError(e, c, engine); } finally { setBusy(false); }
  };

  const g = useMemo(() => {
    if (!room || !engine) return null;
    const uid = engine.uid;
    const isOnline = (id) => room.presence?.[id] !== false;
    const players = Object.entries(room.players).map(([id, p]) => ({ id, ...p, online: isOnline(id) }))
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return {
      room, round, code, uid, engine, now, answers, setAnswer, toast, setSheet, act, leave, isOnline,
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
  }, [room, round, code, engine, now, answers, setAnswer, toast, act, leave]);

  let screen;
  if (view === 'loading' || (view === 'room' && !g)) screen = <Loading />;
  else if (view === 'home') {
    screen = <Home profile={profile} setProfile={setProfile} onRules={() => setSheet('rules')}
      onCreate={() => { if (!needName()) setView('setup'); }} onJoin={() => setSheet('join')} />;
  } else if (view === 'setup') {
    screen = <Setup toast={toast} onBack={() => setView('home')}
      onSave={async (settings) => { try { enterRoom(await engine.createRoom(profile, settings)); } catch (e) { toast('Non riesco a creare la stanza, riprova'); } }} />;
  } else if (view === 'invite') {
    screen = <Invite code={code} room={inviteRoom} profile={profile} setProfile={setProfile} busy={busy} onJoin={() => joinWith(code)} />;
  } else if (view === 'error') {
    screen = <ErrorScreen kind={err?.kind} info={err?.info} onButton={goHome} />;
  } else if (g.me.waiting && ['spin', 'play', 'review', 'round'].includes(status)) {
    screen = <ErrorScreen kind="started" info={{ code }} onButton={leave} />;
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
      {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === 'join' && <JoinSheet onClose={() => setSheet(null)} onJoin={(c) => { setSheet(null); joinWith(c); }} />}
      {sheet === 'scores' && g && <ScoresSheet g={g} onClose={() => setSheet(null)} onExit={() => setSheet('exit')} />}
      {sheet === 'exit' && <ExitSheet onClose={() => setSheet(null)} onLeave={leave} />}
      {!connected && (view === 'room' || view === 'invite') && <OfflineBanner />}
      {toastText && <Toast key={toastText} text={toastText} />}
    </main>
  );
}
