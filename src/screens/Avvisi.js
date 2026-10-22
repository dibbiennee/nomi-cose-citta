import React, { useState, useEffect } from 'react';
import { sx, Face, Sheet, BotTag } from '../ui/kit';
import { isFounderCode } from '../club/fondatore';
import { platform, canPrompt, onPromptChange, promptInstall, isStandalone } from '../ui/installa';
import { HOST_STEPS, IDLE_MS, withPresence } from '../engine/room';
import { nextHost } from '../engine/rules';

/** Senza rete le stanze non funzionano, la partita da soli sì. */
export const NEED_NET = 'Per giocare con gli amici serve internet. Puoi giocare da solo contro i\u00a0robot.';

const ERR = {
  notfound: (e) => ({ title: 'Stanza non trovata', text: `Il codice ${e.code || ''} non esiste più, oppure la partita è già finita.`, btn: 'Torna alla home', btnBg: '#FFD23F', color: '#B79CFF', eyes: 'M13 17l7 7M20 17l-7 7M28 17l7 7M35 17l-7 7', mouth: 'M17 36q7-6 14 0' }),
  full: (e) => ({ title: 'Stanza piena', text: `Ci sono già ${e.max || ''} giocatori. Chiedi all'host di alzare il limite.`, btn: 'Torna alla home', btnBg: '#FFD23F', color: '#FF8A65', eyes: 'M16 18v5M32 18v5', mouth: 'M18 35h12' }),
  started: (e) => ({ title: 'Stanno già giocando', text: `Sei nella stanza ${e.code || ''}. Entri in gioco appena finisce questo round.`, btn: 'Esci', btnBg: '#FFFFFF', color: '#FFD23F', eyes: 'M13 21q3.5-5 7 0M28 21q3.5-5 7 0', mouth: 'M17 32q7 6 14 0', waiting: true }),
  kicked: () => ({ title: 'Sei fuori dalla stanza', text: 'L\'host ti ha rimosso. Puoi creare una stanza tua o entrare in un\'altra.', btn: 'Torna alla home', btnBg: '#FFD23F', color: '#5CD0FF', eyes: 'M14 20h6M28 20h6', mouth: 'M17 36q7-6 14 0' }),
  offline: () => ({ title: 'Serve internet', text: NEED_NET, btn: 'Torna alla home', btnBg: '#FFFFFF', solo: true, color: '#FF7EB6', eyes: 'M16 18v5M32 18v5', mouth: 'M17 36q7-6 14 0' }),
};

export function ErrorScreen({ kind, info = {}, onButton, onSolo }) {
  const err = (ERR[kind] || ERR.notfound)(info);
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; padding: 28px 24px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; text-align: center')}>
      <span className="n-pop" style={sx(`width: 150px; height: 164px; box-sizing: border-box; border-radius: 34px; border: 3px solid #17122B; background: ${err.color}; box-shadow: 0 9px 0 #17122B; display: flex; align-items: center; justify-content: center; transform: rotate(-5deg)`)}>
        <svg width="96" height="96" viewBox="0 0 48 48" aria-hidden="true"><path d={err.eyes} fill="none" stroke="#17122B" strokeWidth="3.6" strokeLinecap="round" /><path d={err.mouth} fill="none" stroke="#17122B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <h1 className="n-up" style={sx("margin: 10px 0 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 34px; line-height: 1.05; animation-delay: .15s")}>{err.title}</h1>
      <p className="n-up" style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880; max-width: 300px; animation-delay: .2s')}>{err.text}</p>
      {err.waiting && (
        <span className="n-dots" role="status" style={sx('height: 44px; padding: 0 18px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 2px; white-space: nowrap')}>Aspetto il prossimo round<span>.</span><span style={{ animationDelay: '.2s' }}>.</span><span style={{ animationDelay: '.4s' }}>.</span></span>
      )}
      {err.solo && onSolo && (
        <button className="n-btn" onClick={onSolo} style={sx('margin-top: 14px; width: 100%; height: 60px; border: 2.5px solid #17122B; border-radius: 20px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Gioca da solo</button>
      )}
      <button className="n-btn" onClick={onButton} style={sx(`margin-top: ${err.solo && onSolo ? 0 : 14}px; width: 100%; height: 60px; border: 2.5px solid #17122B; border-radius: 20px; background: ${err.btnBg}; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer`)}>{err.btn}</button>
    </div>
  );
}

const RULE_SCORES = [{ n: '20', t: 'rispondi solo tu', bg: '#FFD23F' }, { n: '10', t: 'parola unica', bg: '#6EE7A8' }, { n: '5', t: 'parola doppia', bg: '#5CD0FF' }, { n: '0', t: 'vuota o bocciata', bg: '#E6E0F7' }];

export function RulesSheet({ onClose }) {
  return (
    <Sheet onClose={onClose} label="Come si gioca">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px")}>Come si gioca</h2>
      <ol style={sx('margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 15px; line-height: 1.45')}>
        <li>Esce una lettera a caso, uguale per&nbsp;tutti.</li>
        <li>Scrivi una parola per categoria che inizi con quella&nbsp;lettera.</li>
        <li>Chi finisce per primo preme STOP, oppure scade il&nbsp;tempo.</li>
        <li>Correggete insieme: le parole che non valgono si bocciano a&nbsp;maggioranza.</li>
      </ol>
      <div style={sx('display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px')}>
        {RULE_SCORES.map((q) => (
          <div key={q.n} style={sx(`padding: 10px 6px; border-radius: 16px; border: 2.5px solid #17122B; background: ${q.bg}; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; min-width: 0`)}><span style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px; line-height: 1")}>{q.n}</span><span style={sx('font-size: 11px; font-weight: 700; line-height: 1.2')}>{q.t}</span></div>
        ))}
      </div>
      <p style={sx('margin: 0; font-size: 12px; line-height: 1.45; color: #5E5880')}><strong style={sx('color: #17122B')}>Privacy.</strong> Per giocare salviamo nella stanza il nome, la faccina e il colore che scegli, le risposte e i punteggi, legati a un codice anonimo. Stanno su Firebase di Google (database in Belgio) e il sito è ospitato da Vercel. Niente account, pubblicità o cookie di profilazione. Contiamo in forma anonima visite e partite (Vercel Web Analytics, senza cookie, e contatori su Firebase) per capire come va il gioco. Per controllare che una parola esista, il gioco può inviare la parola e la categoria (senza nome né identificativo di chi l'ha scritta) a un servizio di intelligenza artificiale di Anthropic. La stanza si cancella quando l'ultimo esce; per far cancellare i tuoi dati scrivi a <a href="mailto:info@satoshiweb.it" style={sx('color: #17122B; font-weight: 700')}>info@satoshiweb.it</a>. <a href="/privacy" style={sx('color: #17122B; font-weight: 700')}>Informativa completa</a>.</p>
      <p style={sx('margin: 0; font-size: 12px; line-height: 1.45; color: #5E5880')}><strong style={sx('color: #17122B')}>Parole.</strong> Quelle del dizionario del gioco non si possono bocciare votando. L'elenco dei comuni italiani è dell'ISTAT.</p>
      <button className="n-btn" onClick={onClose} style={sx('height: 58px; flex-shrink: 0; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 17px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Ho capito</button>
    </Sheet>
  );
}

/** "Gioca online": creare una stanza o entrare con un codice. */
export function OnlineSheet({ onClose, onCreate, onJoin, onQuick }) {
  const big = (bg, fg, shadow) => sx(`height: 60px; border: 2.5px solid #17122B; border-radius: 18px; background: ${bg}; color: ${fg}; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 ${shadow}; cursor: pointer`);
  return (
    <Sheet onClose={onClose} gap={14} label="Gioca online">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px")}>Gioca online</h2>
      <p style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880; text-wrap: pretty')}>Gioca subito con chi c'è, crea una stanza per i tuoi amici, oppure entra con il codice che ti hanno&nbsp;dato.</p>
      <button type="button" className="n-btn" onClick={onQuick} style={big('#B79CFF', '#17122B', '#17122B')}>Partita veloce</button>
      <p style={sx('margin: -6px 0 4px; font-size: 13px; line-height: 1.4; color: #5E5880; text-wrap: pretty')}>Ti mettiamo con altri giocatori. Se mancano, completano i&nbsp;robot.</p>
      <button type="button" className="n-btn" onClick={onCreate} style={big('#17122B', '#FFD23F', '#7A5F00')}>Crea una stanza</button>
      <button type="button" className="n-btn" onClick={onJoin} style={big('#FFFFFF', '#17122B', '#17122B')}>Ho un codice</button>
    </Sheet>
  );
}

/** Partita veloce: in coda finché non si forma la partita. Dopo l'attesa completano i robot. */
export function Cerco({ found, waitedMs, botWaitMs, onCancel }) {
  const late = waitedMs >= botWaitMs;
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; padding: 28px 24px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center')}>
      <span className="n-spin" aria-hidden="true" style={sx('width: 64px; height: 64px; box-sizing: border-box; border-radius: 50%; border: 6px solid #EDE8FB; border-top-color: #5B3FD6')} />
      <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 32px; line-height: 1.1")}>{late ? 'Completo con i robot' : 'Cerco giocatori…'}</h1>
      <p role="status" style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880')}>{late ? 'Tra un attimo si parte.' : `Trovati ${Math.min(found, 4)} su 4`}</p>
      <button type="button" className="n-btn" onClick={onCancel} style={sx('margin-top: 10px; width: 100%; max-width: 320px; height: 56px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFFFFF; color: #17122B; font-size: 17px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Annulla</button>
    </div>
  );
}

/** Dopo la prima partita: invito a registrarsi. Il "primi 100" compare solo se è vero (contatore reale). */
export function PrimiSheet({ primi, onClose, onSignup }) {
  return (
    <Sheet onClose={onClose} gap={14} label="Crea l'account">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; line-height: 1.1; text-wrap: balance")}>{primi ? 'Complimenti, sei tra i primi 100 utenti!' : 'Ti è piaciuto?'}</h2>
      <p style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880; text-wrap: pretty')}>{primi
        ? 'Registrati gratuitamente e ricevi 1000 monete. Salva i tuoi progressi e ricevi gli accessori esclusivi.'
        : 'Registrati gratuitamente e ricevi 300 monete. Salva i tuoi progressi e sblocca gli accessori.'}</p>
      <button type="button" className="n-btn" onClick={onSignup} style={sx('height: 58px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Registrati gratis</button>
      <button type="button" onClick={onClose} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; cursor: pointer')}>Più tardi</button>
    </Sheet>
  );
}

/** Prodotto a soldi veri non ancora in vendita: "In arrivo" e lista d'attesa con email e consenso esplicito. */
export function WaitlistSheet({ product, defaultEmail, onClose, onJoin, onLeave, onInstall }) {
  const [email, setEmail] = useState(defaultEmail || '');
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ok = consent && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setFailed(false);
    try { await onJoin({ email: email.trim(), product: product.id, consent: true }); setDone(true); } catch (err) { setBusy(false); setFailed(true); }
  };
  const torneo = product.id === 'torneo_21';
  // Per il torneo: spiegato a chi non sa cos'è una web app. Su iPhone gli avvisi arrivano solo a chi lo ha sulla Home.
  const sullaHome = isStandalone();
  const homeBox = torneo && (
    <div style={sx('display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 20px; border: 2.5px solid #17122B; background: #F6F3FF')}>
      <strong style={sx('font-size: 17px; font-weight: 800')}>{sullaHome ? 'Ce l\'hai già sulla Home' : 'Mettilo sulla Home del telefono'}</strong>
      <p style={sx('margin: 0; font-size: 15px; line-height: 1.45; text-wrap: pretty')}>
        {sullaHome
          ? 'Perfetto: è come un\'app, e così potremo avvisarti quando il torneo sta per partire.'
          : 'Così hai l\'icona del gioco tra le altre app e lo apri con un tocco. Non scarichi niente. In più potremo avvisarti quando il torneo sta per\u00a0partire. Su iPhone gli avvisi arrivano solo a chi lo ha sulla\u00a0Home. Regalo: 100\u00a0monete se lo apri da lì con il tuo account.'}
      </p>
      {!sullaHome && onInstall && (
        <button type="button" className="n-btn" onClick={onInstall} style={sx('height: 48px; border: 2.5px solid #17122B; border-radius: 16px; background: #FFFFFF; color: #17122B; font-size: 16px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer')}>Mettilo sulla Home</button>
      )}
    </div>
  );
  return (
    <Sheet onClose={onClose} gap={14} label={torneo ? 'Torneo delle 21' : 'In arrivo'}>
      {torneo ? (
        <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 40px; line-height: 1")}>Torneo delle&nbsp;21</h2>
      ) : (
        <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px")}>In arrivo</h2>
      )}
      {done ? (
        <>
          <p role="status" style={sx('margin: 0; font-size: 16px; line-height: 1.5; text-wrap: pretty')}>{torneo ? 'Fatto: ti scriviamo una volta sola, quando parte il\u00a0torneo.' : 'Fatto: ti scriviamo una volta sola, quando apriranno gli\u00a0acquisti.'}</p>
          {homeBox}
          <button type="button" onClick={async () => { await onLeave().catch(() => {}); onClose(); }} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer')}>Cambiato idea? Togli la mia email dalla&nbsp;lista</button>
        </>
      ) : (
        <form onSubmit={submit} style={sx('display: flex; flex-direction: column; gap: 12px')}>
          <p style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880; text-wrap: pretty')}>{torneo
            ? 'Ogni sera alle 21 la stessa lettera per tutti i giocatori, con una classifica unica. Stiamo preparando il primo torneo, gratis. Vuoi che ti avvisiamo quando\u00a0parte?'
            : <>{product.nome} a {product.prezzo} non si può ancora comprare. Vuoi che ti avvisiamo quando&nbsp;apre?</>}</p>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="la-tua@email.it" aria-label="La tua email" autoComplete="email"
            style={sx('height: 52px; padding: 0 16px; border-radius: 16px; border: 2.5px solid #17122B; background: #F6F3FF; color: #17122B; font-size: 17px; font-weight: 700; outline: none')} />
          <label style={sx('display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.45; cursor: pointer')}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={sx('width: 24px; height: 24px; margin: 0; flex-shrink: 0; accent-color: #5B3FD6')} />
            <span>{torneo ? 'Voglio ricevere un\'email quando parte il torneo.' : 'Voglio ricevere un\'email quando apriranno gli acquisti.'} Niente altro. <a href="/privacy" style={sx('color: #17122B; font-weight: 700')}>Privacy</a></span>
          </label>
          {homeBox}
          {failed && <p role="alert" style={sx('margin: 0; font-size: 14px; font-weight: 700; color: #C4300F')}>Non siamo riusciti a salvare l'email. Controlla la connessione e tocca di nuovo Avvisami.</p>}
          <button type="submit" className="n-btn" aria-disabled={!ok} style={sx(`height: 56px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer; opacity: ${ok ? 1 : 0.45}`)}>Avvisami</button>
        </form>
      )}
      <button type="button" onClick={onClose} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; cursor: pointer')}>Chiudi</button>
    </Sheet>
  );
}

/** Codice stanza, oppure CANT per la Modalità Fondatore (che il motore non usa mai come stanza). */
export function JoinSheet({ onClose, onJoin, onFounder }) {
  const [code, setCode] = useState('');
  const ok = code.length === 4;
  return (
    <Sheet onClose={onClose} gap={18} label="Entra in una stanza">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px")}>Entra in una stanza</h2>
      <form style={sx('display: flex; flex-direction: column; gap: 18px')} onSubmit={(e) => { e.preventDefault(); if (!ok) return; if (isFounderCode(code)) onFounder(); else onJoin(code); }}>
        <label style={sx('display: flex; flex-direction: column; gap: 10px; font-size: 14px; font-weight: 700; color: #5E5880')}>Scrivi il codice di 4&nbsp;caratteri
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))} maxLength={4} placeholder="AB12" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoFocus enterKeyHint="go"
            style={sx("height: 78px; border-radius: 20px; border: 2.5px solid #17122B; background: #F6F3FF; color: #17122B; font-family: 'JetBrains Mono', monospace; font-size: 40px; font-weight: 700; letter-spacing: 0.4em; text-align: center; text-transform: uppercase; outline: none; padding-left: 0.4em; min-width: 0")} />
        </label>
        <button type="submit" className="n-btn" aria-disabled={!ok} style={sx(`height: 60px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer; opacity: ${ok ? '1' : '0.45'}; transition: opacity .2s`)}>Entra</button>
      </form>
    </Sheet>
  );
}

/** Conferma e stato della Modalità Fondatore. Lo sblocco vale solo su questo telefono (vedi club/fondatore.js). */
export function FounderSheet({ onClose, onRevoke }) {
  return (
    <Sheet onClose={onClose} gap={14} label="Modalità Fondatore">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; line-height: 1.1; text-wrap: balance")}>Modalità Fondatore</h2>
      <button type="button" className="n-btn" onClick={onClose} style={sx('height: 58px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Chiudi</button>
      <button type="button" onClick={onRevoke} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer')}>Disattiva su questo telefono</button>
    </Sheet>
  );
}

const SHARE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17122B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-3px' }}><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
);
const STEPS = {
  safari: [<>Tocca {SHARE_ICON} <b>Condividi</b> nella barra di&nbsp;Safari.</>, <>Scorri e scegli <b>Aggiungi alla&nbsp;schermata&nbsp;Home</b>.</>, <>Tocca <b>Aggiungi</b> in&nbsp;alto a destra.</>],
  'chrome-ios': [<>Tocca {SHARE_ICON} <b>Condividi</b> nella barra in&nbsp;alto, accanto all'indirizzo.</>, <>Scegli <b>Aggiungi alla&nbsp;schermata&nbsp;Home</b>.</>, <>Tocca <b>Aggiungi</b>.</>],
  chrome: [<>Apri il menu <b>⋮</b> di Chrome, in&nbsp;alto a destra.</>, <>Scegli <b>Installa app</b> oppure <b>Aggiungi a&nbsp;schermata&nbsp;Home</b>.</>, <>Conferma con <b>Installa</b>.</>],
};

/** Guida per aggiungere il gioco alla schermata Home. Chiede il browser (già scelto se si riconosce). */
export function InstallSheet({ onClose, toast }) {
  const [, redraw] = useState(0);
  useEffect(() => onPromptChange(() => redraw((n) => n + 1)), []);
  const { ios, browser: detected } = platform();
  const [browser, setBrowser] = useState(detected === 'safari' || detected === 'chrome' ? detected : null);
  const steps = browser === 'safari' ? STEPS.safari : browser === 'chrome' ? STEPS[ios ? 'chrome-ios' : 'chrome'] : null;
  const quick = browser === 'chrome' && canPrompt();
  const install = async () => { if (await promptInstall()) { toast('Fatto, lo trovi sulla schermata Home'); onClose(); } };
  return (
    <Sheet onClose={onClose} gap={14} label="Usalo come un'app">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; line-height: 1.1; text-wrap: balance")}>Mettilo sulla schermata Home</h2>
      <p style={sx('margin: 0; font-size: 16px; line-height: 1.5; color: #5E5880; text-wrap: pretty')}>Niente store e niente download. Lo apri dall'icona e&nbsp;si vede a tutto schermo, come&nbsp;un'app.</p>
      <p style={sx('margin: 0; font-size: 15px; line-height: 1.45; font-weight: 700; text-wrap: pretty')}>Regalo: apri il gioco dall'icona, entra con il tuo account e ricevi 100&nbsp;monete.</p>
      {detected === 'app' && (
        <p style={sx('margin: 0; font-size: 15px; line-height: 1.45; font-weight: 700; text-wrap: pretty')}>Sei dentro un'altra app. Dal suo menu scegli <b>Apri nel browser</b>, poi segui&nbsp;i&nbsp;passi.</p>
      )}
      <div role="radiogroup" aria-label="Che browser usi?" style={sx('display: flex; gap: 10px')}>
        {[['safari', 'Safari'], ['chrome', 'Chrome']].map(([k, label]) => {
          const on = browser === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} className="n-btn" onClick={() => setBrowser(k)}
              style={sx(`flex: 1; height: 48px; border-radius: 14px; border: 2.5px solid #17122B; background: ${on ? '#B79CFF' : '#FFFFFF'}; color: #17122B; font-size: 16px; font-weight: 800; box-shadow: ${on ? '0 1px 0' : '0 4px 0'} #17122B; transform: translateY(${on ? '3px' : '0'}); cursor: pointer`)}>{label}</button>
          );
        })}
      </div>
      {!browser && <p style={sx('margin: 0; font-size: 15px; font-weight: 700; color: #5E5880')}>Che browser usi? Ti mostro i passi giusti.</p>}
      {quick && (
        <button type="button" className="n-btn" onClick={install} style={sx('height: 58px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Aggiungi alla Home</button>
      )}
      {steps && !quick && (
        <ol style={sx('margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px')}>
          {steps.map((step, i) => (
            <li key={i} style={sx('display: flex; gap: 12px; align-items: flex-start; font-size: 16px; line-height: 1.45')}>
              <span aria-hidden="true" style={sx("flex-shrink: 0; width: 30px; height: 30px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid #17122B; background: #FFD23F; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 15px")}>{i + 1}</span>
              <span style={sx('padding-top: 3px')}>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {ios && browser && (
        <p style={sx('margin: 0; font-size: 14px; line-height: 1.45; color: #5E5880; text-wrap: pretty')}>La prima volta che lo apri dall'icona, scegli di nuovo nome e&nbsp;faccina.</p>
      )}
      <button type="button" onClick={onClose} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; cursor: pointer')}>Chiudi</button>
    </Sheet>
  );
}

export function ScoresSheet({ g, onClose, onExit }) {
  const rows = g.ranked;
  return (
    <Sheet onClose={onClose} gap={12} pad="12px 20px 20px" label="Classifica">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px")}>Classifica</h2>
      {rows.map((p, i) => (
        <div key={p.id} style={sx(`display: flex; align-items: center; gap: 12px; padding: 8px 14px 8px 10px; border-radius: 16px; border: 2.5px solid #17122B; background: ${p.id === g.uid ? '#FFF3C4' : '#FFFFFF'}; flex-shrink: 0`)}>
          <span style={sx("font-family: 'JetBrains Mono', monospace; font-weight: 700; width: 20px; text-align: center")}>{i + 1}°</span>
          <Face p={p} size={36} small />
          <span style={sx('flex-grow: 1; min-width: 0; font-size: 16px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{p.id === g.uid ? 'Tu' : p.name}</span>{p.bot && <BotTag />}
          <span style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 22px")}>{p.score || 0}</span>
        </div>
      ))}
      <button onClick={onExit} style={sx('height: 48px; flex-shrink: 0; border: 0; background: transparent; color: #C4300F; font-size: 15px; font-weight: 800; cursor: pointer')}>Esci dalla partita</button>
    </Sheet>
  );
}

export function ExitSheet({ onClose, onLeave }) {
  return (
    <Sheet onClose={onClose} gap={14} label="Esci dalla partita">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px")}>Esci dalla partita?</h2>
      <p style={sx('margin: 0; font-size: 15px; line-height: 1.45; color: #5E5880')}>Gli altri continuano senza di&nbsp;te e&nbsp;perdi i&nbsp;punti fatti&nbsp;finora.</p>
      <button className="n-btn" onClick={onClose} style={sx('height: 60px; flex-shrink: 0; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Resto a giocare</button>
      <button className="n-btn" onClick={onLeave} style={sx('height: 56px; flex-shrink: 0; border: 2.5px solid #17122B; border-radius: 18px; background: #FFFFFF; color: #C4300F; font-size: 17px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Esci</button>
    </Sheet>
  );
}

export function OfflineBanner() {
  return (
    <div className="n-down" role="status" style={sx('position: absolute; left: 10px; right: 10px; top: 10px; z-index: 50; border-radius: 18px; background: #17122B; color: #FFFFFF; padding: 14px 16px; box-shadow: 0 10px 30px rgba(23,18,43,0.35); display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 700')}>
      <span className="n-spin" style={sx('width: 18px; height: 18px; box-sizing: border-box; border-radius: 50%; border: 3px solid rgba(255,255,255,.3); border-top-color: #FFD23F; flex-shrink: 0')} />
      <span style={sx('flex-grow: 1')}>Connessione persa. Riprovo…</span>
      <span style={sx('font-size: 13px; color: #BDB6DC; text-align: right')}>Le tue parole sono&nbsp;salve</span>
    </div>
  );
}

export function Toast({ text }) {
  return <div className="n-toast" role="status" style={sx('position: absolute; top: 16px; left: 50%; z-index: 60; transform: translateX(-50%); max-width: calc(100% - 32px); min-height: 46px; padding: 10px 18px; box-sizing: border-box; border-radius: 999px; background: #17122B; color: #FFFFFF; display: flex; align-items: center; font-size: 15px; font-weight: 700; box-shadow: 0 10px 30px rgba(23,18,43,0.35); text-align: center')}>{text}</div>;
}

export function Loading() {
  return (
    <div style={sx('position: absolute; inset: 0; background: #FFD23F; display: flex; align-items: center; justify-content: center')} role="status" aria-label="Caricamento">
      <Face p={{ face: 0, color: 0 }} size={72} blink className="n-bob" />
    </div>
  );
}

/**
 * Host collegato che non va avanti: negli ultimi 10 secondi tutti vedono chi prenderà il posto e quando.
 * Così il passaggio automatico (dopo un minuto) è una regola visibile e non una sorpresa.
 */
export function IdleNotice({ g }) {
  const { room, round, uid, now } = g;
  if (!HOST_STEPS.includes(room.status) || !round?.stepAt) return null;
  const left = round.stepAt + IDLE_MS - now;
  if (left > 10000 || left < -3000) return null;
  const heirId = nextHost(withPresence(room), room.hostId);
  if (!heirId || !room.players[heirId]) return null;
  const s = Math.max(0, Math.ceil(left / 1000));
  const heir = room.players[heirId].name;
  const text = g.isHost ? <>Vai avanti tu, o tra <b>{s} s</b> decide {heir}</>
    : heirId === uid ? <>{g.hostName} non va avanti: tra <b>{s} s</b> tocca a te</>
      : <>{g.hostName} non va avanti: tra <b>{s} s</b> decide {heir}</>;
  return (
    <div className="n-down" role="status" style={sx('position: absolute; left: 10px; right: 10px; top: 10px; z-index: 45; border-radius: 18px; border: 2.5px solid #17122B; background: #FFD23F; color: #17122B; padding: 12px 16px; box-shadow: 0 5px 0 #17122B; font-size: 15px; font-weight: 700; text-align: center')}>
      {text}
    </div>
  );
}
