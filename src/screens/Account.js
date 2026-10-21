import React, { useState } from 'react';
import { sx, BACK_ICON } from '../ui/kit';
import { isStandalone, platform } from '../ui/installa';

const big = (bg, fg, shadow = '#17122B') => sx(`width: 100%; min-height: 56px; padding: 0 16px; border: 2.5px solid #17122B; border-radius: 18px; background: ${bg}; color: ${fg}; font-size: 17px; font-weight: 800; box-shadow: 0 5px 0 ${shadow}; cursor: pointer`);
const card = sx('border-radius: 22px; border: 2.5px solid #17122B; background: #FFFFFF; padding: 16px; display: flex; flex-direction: column; gap: 12px');
const note = sx('margin: 0; font-size: 14px; line-height: 1.45; color: #5E5880; text-wrap: pretty');
const field = sx('width: 100%; box-sizing: border-box; height: 52px; padding: 0 16px; border-radius: 16px; border: 2.5px solid #17122B; background: #F6F3FF; color: #17122B; font-size: 17px; font-weight: 700; outline: none');
const NAME_MSG = { preso: 'Questo username è già di qualcun altro.', 'non valido': 'Da 5 a 14 caratteri: lettere, numeri e trattino basso.' };

/** Account: accesso con Google o email, username, monete, invito, uscita e cancellazione. */
export default function Account({ account, onBack, onShop, toast }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [name, setName] = useState(account.profile?.username || '');
  const [nameMsg, setNameMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const iosApp = isStandalone() && platform().ios;
  const inAppBrowser = platform().browser === 'app';
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const google = () => run(async () => {
    try { await account.google(); } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      toast(inAppBrowser ? 'Qui Google non funziona: usa l\'email o apri il gioco nel browser' : 'Accesso non riuscito, riprova');
    }
  });
  const sendLink = (e) => {
    e.preventDefault();
    run(async () => {
      try { await account.emailLink(email.trim()); setSent(true); } catch (err) { toast('Controlla l\'email e riprova'); }
    });
  };
  const saveName = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await account.setUsername(name.trim());
      setNameMsg(r === 'ok' ? '' : NAME_MSG[r]);
      if (r === 'ok') toast('Username salvato');
    });
  };
  const share = async () => {
    const text = `Giochiamo a Nomi Cose Città? Entra col mio invito e ricevi 200 monete: ${account.inviteLink}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(account.inviteLink); toast('Link copiato'); }
    } catch (e) { /* condivisione annullata */ }
  };

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header style={sx('display: flex; align-items: center; gap: 12px; padding: 20px 20px 10px')}>
        <button className="n-btn" aria-label="Indietro" onClick={onBack} style={sx('width: 46px; height: 46px; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; box-shadow: 0 4px 0 #17122B; display: flex; align-items: center; justify-content: center; cursor: pointer')}>{BACK_ICON}</button>
        <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px")}>Account</h1>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 10px 20px 28px; display: flex; flex-direction: column; gap: 16px')}>
        {!account.registered ? (
          <>
            <section style={card}>
              <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-size: 24px; line-height: 1.1")}>Crea l'account gratis</h2>
              <p style={note}>Salvi monete e accessori e li ritrovi su ogni telefono. Nome e partite di oggi restano&nbsp;tuoi.</p>
              <button type="button" className="n-btn" onClick={google} disabled={busy} style={big('#17122B', '#FFD23F', '#7A5F00')}>Continua con Google</button>
              {iosApp && <p style={note}>Dall'app sulla Home conviene Google: il link dell'email si apre in Safari, e poi dovresti accedere di nuovo&nbsp;qui.</p>}
            </section>
            <section style={card}>
              <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Oppure con l'email</h2>
              {sent ? <p role="status" style={note}>Ti abbiamo mandato un link a {email}. Aprilo da questo telefono per finire&nbsp;l'accesso.</p> : (
                <form onSubmit={sendLink} style={sx('display: flex; flex-direction: column; gap: 10px')}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="la-tua@email.it" aria-label="La tua email" autoComplete="email" style={field} />
                  <button type="submit" className="n-btn" disabled={busy || !email.includes('@')} style={big('#FFFFFF', '#17122B')}>Mandami il link</button>
                </form>
              )}
              <p style={note}>Niente password: ti arriva un link, lo apri e sei&nbsp;dentro. <a href="/privacy" style={sx('color: #17122B; font-weight: 700')}>Privacy</a></p>
            </section>
          </>
        ) : (
          <>
            <section style={card}>
              <span style={sx('font-size: 14px; font-weight: 700; color: #5E5880')}>{account.email || 'Account Google'}</span>
              <span style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 34px; line-height: 1")}>{account.coins} monete</span>
              <button type="button" className="n-btn" onClick={onShop} style={big('#FFD23F', '#17122B')}>Vai al negozio</button>
            </section>
            <section style={card}>
              <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Username</h2>
              <p style={note}>È il nome con cui giochi online. Unico, da 5 a 14&nbsp;caratteri.</p>
              <form onSubmit={saveName} style={sx('display: flex; flex-direction: column; gap: 10px')}>
                <input value={name} onChange={(e) => { setName(e.target.value.slice(0, 14)); setNameMsg(''); }} aria-label="Username" autoCapitalize="off" autoCorrect="off" spellCheck={false} style={field} />
                {nameMsg && <p role="alert" style={sx('margin: 0; font-size: 14px; font-weight: 700; color: #C4300F')}>{nameMsg}</p>}
                <button type="submit" className="n-btn" disabled={busy || name.trim() === (account.profile?.username || '')} style={big('#FFFFFF', '#17122B')}>Salva l'username</button>
              </form>
            </section>
            <section style={card}>
              <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Invita un amico</h2>
              <p style={note}>Se crea l'account dal tuo link, 200 monete a te e 200 a lui. Fino a 20&nbsp;amici.</p>
              <button type="button" className="n-btn" onClick={share} style={big('#B79CFF', '#17122B')}>Condividi il tuo invito</button>
            </section>
            <section style={sx('display: flex; flex-direction: column; gap: 10px')}>
              <button type="button" className="n-btn" onClick={() => run(account.signOut)} style={big('#FFFFFF', '#17122B')}>Esci</button>
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)} style={sx('min-height: 44px; border: 0; background: transparent; color: #5E5880; font-size: 15px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer')}>Cancella l'account</button>
              ) : (
                <div role="alert" style={card}>
                  <p style={sx('margin: 0; font-size: 16px; font-weight: 700; line-height: 1.45')}>Cancello account, monete, accessori e username. Non si può&nbsp;annullare.</p>
                  <button type="button" className="n-btn" onClick={() => run(account.remove)} style={big('#FF5E3A', '#FFFFFF')}>Sì, cancella tutto</button>
                  <button type="button" className="n-btn" onClick={() => setConfirmDelete(false)} style={big('#FFFFFF', '#17122B')}>No, tienilo</button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
