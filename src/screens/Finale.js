import React from 'react';
import { sx, INK, Face } from '../ui/kit';
import { computeAwards, ranking } from '../engine/rules';

const AWARD = {
  fulmine: { title: 'FULMINE', color: '#FFD23F', text: (n) => (n === 1 ? 'Ha gridato STOP una volta' : `Ha gridato STOP ${n} volte`) },
  originale: { title: 'ORIGINALE', color: '#6EE7A8', text: (n) => (n === 1 ? '1 parola che nessun altro aveva' : `${n} parole che nessun altro aveva`) },
  copione: { title: 'COPIONE', color: '#FF7EB6', text: (n) => (n === 1 ? '1 parola uguale a quella di un altro' : `${n} parole uguali a quelle degli altri`) },
};

export function Awards({ g }) {
  const { room, uid, isHost } = g;
  const awards = computeAwards(room.players);
  const next = () => {
    if (!isHost) { g.toast(`Va avanti ${g.hostName}`); return; }
    g.act(() => g.engine.showPodium(g.code));
  };
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; background: #5CD0FF; display: flex; flex-direction: column')}>
      <header style={sx('padding: 30px 20px 8px; display: flex; flex-direction: column; gap: 4px')}>
        <span style={sx('font-size: 13px; font-weight: 800; letter-spacing: 0.12em')}>PRIMA DEL PODIO</span>
        <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 40px; line-height: 1")}>I premi</h1>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; justify-content: center')}>
        {awards.map((a, i) => {
          const p = room.players[a.playerId], def = AWARD[a.key];
          return (
            <div key={a.key} className="n-card" style={sx(`position: relative; padding: 18px 16px 16px; border-radius: 24px; border: 2.5px solid #17122B; background: #FFFFFF; box-shadow: 0 6px 0 #17122B; display: flex; align-items: center; gap: 14px; transform: rotate(${['-2deg', '1.5deg', '-1deg'][i]}); animation-delay: ${300 + i * 550}ms; flex-shrink: 0`)}>
              <span style={sx(`position: absolute; top: -13px; left: 16px; height: 26px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 2px solid #17122B; background: ${def.color}; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; display: flex; align-items: center`)}>{def.title}</span>
              <Face p={p} size={60} style={{ flexShrink: 0 }} />
              <span style={sx('display: flex; flex-direction: column; gap: 2px; min-width: 0')}><span style={sx("font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 24px")}>{a.playerId === uid ? 'Tu' : p.name}</span><span style={sx('font-size: 14px; color: #5E5880; line-height: 1.35')}>{def.text(a.value)}</span></span>
            </div>
          );
        })}
      </div>
      <div style={sx('padding: 14px 20px 26px')}>
        <button className="n-btn" onClick={next} style={sx(`width: 100%; height: 62px; border: 2.5px solid ${isHost ? INK : '#CFC8EA'}; border-radius: 20px; background: ${isHost ? INK : '#FFFFFF'}; color: ${isHost ? '#FFD23F' : '#6F698F'}; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer`)}>{isHost ? 'Vai al podio' : `Va avanti ${g.hostName}…`}</button>
      </div>
    </div>
  );
}

const PODIUM = [
  { h: '190px', block: INK, fg: '#FFD23F', size: 76, delay: '500ms', avDelay: '1300ms' },
  { h: '136px', block: '#FFFFFF', fg: INK, size: 60, delay: '250ms', avDelay: '1050ms' },
  { h: '96px', block: '#FFFFFF', fg: INK, size: 60, delay: '0ms', avDelay: '800ms' },
];
const CC = ['#FFFFFF', '#FF8A65', '#5CD0FF', '#B79CFF', '#6EE7A8', '#FF7EB6'];
const CONFETTI = Array.from({ length: 24 }, (_, ci) => ({ left: `${(ci * 37) % 100}%`, w: `${7 + (ci % 3) * 3}px`, color: CC[ci % 6], dur: `${2.4 + (ci % 5) * 0.4}s`, delay: `${((ci * 0.23) % 2.4).toFixed(2)}s` }));

export function Final({ g }) {
  const { room, uid, isHost } = g;
  const ranked = ranking(room.players);
  const name = (p) => (p.id === uid ? 'Tu' : p.name);
  const rematch = () => {
    if (!isHost) { g.toast(`Decide ${g.hostName}`); return; }
    g.act(() => g.engine.rematch(g.code));
  };
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; background: #FFD23F')}>
      <div style={sx('position: absolute; left: 0; right: 0; top: 0; height: 420px; pointer-events: none; overflow: hidden')} aria-hidden="true">
        {CONFETTI.map((k, i) => <span key={i} className="n-fall" style={sx(`position: absolute; top: 0; left: ${k.left}; width: ${k.w}; height: 14px; box-sizing: border-box; border-radius: 3px; border: 1.5px solid #17122B; background: ${k.color}; animation-duration: ${k.dur}; animation-delay: ${k.delay}`)} />)}
      </div>
      <div className="n-scroll" style={sx('position: relative; height: 100%; box-sizing: border-box; padding: 40px 20px 26px; display: flex; flex-direction: column; align-items: center; overflow-y: auto')}>
        <span className="n-up" style={sx('height: 32px; padding: 0 14px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; display: flex; align-items: center; white-space: nowrap')}>PARTITA FINITA</span>
        <h1 className="n-pop" style={sx("margin: 14px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 44px; text-align: center; line-height: 1")}>{ranked[0] ? (ranked[0].id === uid ? 'Hai vinto!' : <>Vince <span className="ph">{ranked[0].name}!</span></>) : ''}</h1>
        <div style={sx('flex-grow: 1; min-height: 300px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 10px')}>
          {[1, 0, 2].filter((i) => ranked[i]).map((i) => {
            const p = ranked[i], sp = PODIUM[i];
            return (
              <div key={p.id} style={sx('flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px')}>
                <span className="n-pop" style={sx(`position: relative; display: block; animation-delay: ${sp.avDelay}`)}>
                  {i === 0 && <svg className="n-drop" width="44" height="30" viewBox="0 0 44 30" aria-hidden="true" style={sx('position: absolute; top: -26px; left: 50%; margin-left: -22px; animation-delay: 1.9s')}><path d="M4 26 2 8l11 8 9-13 9 13 11-8-2 18z" fill="#FFFFFF" stroke="#17122B" strokeWidth="3" strokeLinejoin="round" /></svg>}
                  <Face p={p} size={sp.size} stroke={2.4} />
                </span>
                <span style={sx('font-size: 15px; font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{name(p)}</span>
                <div className="n-rise" style={sx(`width: 100%; height: ${sp.h}; box-sizing: border-box; border-radius: 20px 20px 0 0; border: 2.5px solid #17122B; border-bottom: 0; background: ${sp.block}; color: ${sp.fg}; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 12px; animation-delay: ${sp.delay}`)}>
                  <span style={sx("font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 44px; line-height: 1")}>{i + 1}</span>
                  <span style={sx("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; white-space: nowrap")}>{p.score || 0}&nbsp;pt</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={sx('width: 100%; box-sizing: border-box; border-top: 2.5px solid #17122B; padding-top: 14px; display: flex; flex-direction: column; gap: 12px')}>
          {ranked.slice(3).map((p, i) => (
            <div key={p.id} className="n-up" style={sx('display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 10px; border-radius: 16px; border: 2.5px solid #17122B; background: #FFFFFF; animation-delay: 1s')}>
              <span style={sx("font-family: 'JetBrains Mono', monospace; font-weight: 700; width: 22px; text-align: center")}>{i + 4}°</span>
              <Face p={p} size={32} small />
              <span style={sx('flex-grow: 1; min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{name(p)}</span>
              <span style={sx("font-family: 'JetBrains Mono', monospace; font-weight: 700; white-space: nowrap")}>{p.score || 0}&nbsp;pt</span>
            </div>
          ))}
          <button className="n-btn" onClick={rematch} style={sx(`height: 62px; flex-shrink: 0; border: 2.5px solid ${isHost ? INK : '#CFC8EA'}; border-radius: 20px; background: ${isHost ? INK : '#EDE8FB'}; color: ${isHost ? '#FFD23F' : '#6F698F'}; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 ${isHost ? '#7A5F00' : '#CFC8EA'}; cursor: pointer`)}>{isHost ? 'Rivincita' : `Rivincita: decide ${g.hostName}`}</button>
          <button className="n-btn" onClick={g.leave} style={sx('height: 54px; flex-shrink: 0; border-radius: 20px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 16px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Torna alla home</button>
        </div>
      </div>
    </div>
  );
}
