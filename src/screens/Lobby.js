import React, { useState } from 'react';
import { sx, INK, Face } from '../ui/kit';

export default function Lobby({ g }) {
  const { room, code, uid, isHost, players, onlineCount } = g;
  const [copied, setCopied] = useState(false);
  const s = room.settings;
  const link = `${window.location.origin}/r/${code}`;
  const canStart = isHost && onlineCount >= 2;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) { g.toast(link); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = () => {
    const text = `Giochiamo a Nomi Cose Città? Entra nella mia stanza: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const start = () => {
    if (!isHost) { g.toast(`Decide ${g.hostName}`); return; }
    if (!canStart) { g.toast('Manda il link a qualcuno'); return; }
    g.act(() => g.engine.startGame(code));
  };

  const empty = [];
  for (let e = players.length; e < Math.min(s.maxPlayers, 8); e++) empty.push(e);
  const chips = s.cats.map((c) => ({ label: c.label, bg: c.color }))
    .concat([{ label: `${s.rounds} round`, bg: '#FFFFFF' }, { label: s.timer === 120 ? '2 minuti' : s.timer ? `${s.timer} secondi` : 'senza tempo', bg: '#FFFFFF' }]);
  const startBg = canStart ? '#FFD23F' : '#EDE8FB', startFg = canStart ? INK : '#6F698F', startBorder = canStart ? INK : '#CFC8EA';

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <section style={sx('background: #B79CFF; border-bottom: 2.5px solid #17122B; border-radius: 0 0 34px 34px; padding: 20px 20px 24px; display: flex; flex-direction: column; gap: 18px')}>
        <div style={sx('display: flex; align-items: center; justify-content: space-between')}>
          <button className="n-btn" onClick={g.leave} style={sx('height: 44px; padding: 0 16px; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 14px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer')}>Esci</button>
          {isHost && <button className="n-btn" onClick={g.openSettings} style={sx('height: 44px; padding: 0 16px; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 14px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer')}>Impostazioni</button>}
        </div>
        <div style={sx('display: flex; flex-direction: column; align-items: center; gap: 12px')}>
          <h1 style={sx('margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.12em')}>CODICE STANZA</h1>
          <div style={sx('display: flex; gap: 10px')} aria-label={`Codice ${code.split('').join(' ')}`} role="img">
            {code.split('').map((ch, i) => (
              <span key={i} className="n-pop" aria-hidden="true" style={sx(`width: 60px; height: 70px; box-sizing: border-box; border-radius: 16px; border: 2.5px solid #17122B; background: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 34px; box-shadow: 0 5px 0 #17122B; animation-delay: ${i * 80}ms`)}>{ch}</span>
            ))}
          </div>
        </div>
        <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
          <button className="n-btn" onClick={copy} style={sx(`height: 52px; border-radius: 16px; border: 2.5px solid #17122B; background: ${copied ? '#6EE7A8' : '#FFFFFF'}; color: #17122B; font-size: 15px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer; transition: background .25s`)}>{copied ? 'Copiato!' : 'Copia link'}</button>
          <button className="n-btn" onClick={share} style={sx('height: 52px; border-radius: 16px; border: 2.5px solid #17122B; background: #17122B; color: #FFFFFF; font-size: 15px; font-weight: 800; box-shadow: 0 4px 0 #5B3FD6; cursor: pointer')}>WhatsApp</button>
        </div>
      </section>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 22px 20px 16px; display: flex; flex-direction: column; gap: 18px')}>
        <div style={sx('display: flex; justify-content: space-between; align-items: baseline')}><h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Chi c'è</h2><span style={sx("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #5E5880")}>{players.length} di {s.maxPlayers}</span></div>
        <div style={sx('display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 8px; padding-top: 6px')}>
          {players.map((p, i) => {
            const isMe = p.id === uid;
            return (
              <div key={p.id} className="n-new" style={sx(`display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; min-width: 0; opacity: ${p.online ? '1' : '0.45'}`)}>
                <span className="n-bob" style={sx(`display: block; width: 64px; height: 64px; animation-delay: ${i * 180}ms`)}><Face p={p} size={64} stroke={2.4} blink delay={`${i * 180}ms`} /></span>
                <span style={sx('font-size: 13px; font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{isMe ? 'Tu' : p.name}</span>
                {!p.online && <span style={sx('font-size: 11px; font-weight: 700; color: #5E5880')}>offline</span>}
                {p.id === room.hostId && <span style={sx('position: absolute; top: -8px; left: 50%; transform: translateX(-50%); height: 20px; padding: 0 8px; border-radius: 999px; border: 2px solid #17122B; background: #FFD23F; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; display: flex; align-items: center')}>HOST</span>}
                {isHost && !isMe && (
                  <button aria-label={`Rimuovi ${p.name}`} onClick={() => g.act(async () => { await g.engine.kickPlayer(code, p.id); g.toast(`Hai rimosso ${p.name} dalla stanza`); })}
                    style={sx('position: absolute; top: -10px; right: -4px; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; display: flex; align-items: flex-start; justify-content: flex-end')}>
                    <span style={sx('width: 24px; height: 24px; box-sizing: border-box; border-radius: 50%; border: 2px solid #17122B; background: #FFFFFF; display: flex; align-items: center; justify-content: center')}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#17122B" strokeWidth="4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></span>
                  </button>
                )}
              </div>
            );
          })}
          {empty.map((e) => (
            <div key={e} style={sx('display: flex; flex-direction: column; align-items: center; gap: 6px')} aria-hidden="true">
              <span style={sx('width: 64px; height: 64px; box-sizing: border-box; border-radius: 50%; border: 2.5px dashed #BDB6DC; display: flex; align-items: center; justify-content: center; color: #8D87AE; font-size: 24px; font-weight: 700')}>+</span>
              <span style={sx('font-size: 13px; color: #6F698F')}>libero</span>
            </div>
          ))}
        </div>
        <div style={sx('display: flex; flex-wrap: wrap; gap: 8px')} aria-label="Impostazioni della partita">
          {chips.map((c, i) => <span key={i} style={sx(`height: 32px; padding: 0 12px; border-radius: 999px; background: ${c.bg}; border: 2px solid #17122B; font-size: 13px; font-weight: 800; display: flex; align-items: center; white-space: nowrap`)}>{c.label}</span>)}
        </div>
      </div>
      <div style={sx('padding: 14px 20px 26px; border-top: 2px solid #E6E0F7')}>
        <button className="n-btn" onClick={start} style={sx(`width: 100%; height: 62px; border: 2.5px solid ${startBorder}; border-radius: 20px; background: ${startBg}; color: ${startFg}; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 ${startBorder}; cursor: pointer; transition: background .3s`)}>
          {!isHost ? `Va avanti ${g.hostName}…` : canStart ? 'Inizia partita' : 'Aspetta almeno un amico'}
        </button>
      </div>
    </div>
  );
}
