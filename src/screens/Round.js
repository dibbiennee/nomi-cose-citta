import React, { useEffect, useRef, useState } from 'react';
import { sx, Face, hostButtonStyle, BotTag } from '../ui/kit';
import { ranking } from '../engine/rules';

/** Il conteggio che sale da 0 a 1 in ~1 secondo, come nel prototipo. */
function useCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let raf, t0 = null;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const t = Math.min(1, (ts - t0 - 350) / 900);
      setCount(t < 0 ? 0 : 1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return count;
}

export default function Round({ g }) {
  const { room, round, uid, isHost } = g;
  const count = useCount();
  const points = round.points || {};
  const ranked = ranking(room.players);
  const maxScore = Math.max(1, ...ranked.map((p) => p.score || 0));
  const lead = ranked[0];
  const last = round.n >= room.settings.rounds;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const next = () => {
    if (!isHost) { g.toast(`Va avanti ${g.hostName}`); return; }
    if (busyRef.current) return; // un tocco solo: i ripetuti non fanno partire due volte la lettera
    busyRef.current = true; setBusy(true);
    g.act(() => g.engine.nextRound(g.code)).finally(() => { busyRef.current = false; setBusy(false); });
  };

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header className="n-up" style={sx('padding: 16px 20px 4px; display: flex; flex-direction: column; gap: 2px')}>
        <span style={sx('font-size: 12px; font-weight: 800; letter-spacing: 0.12em; color: #5E5880')}>LETTERA {round.letter} · ROUND {round.n} DI {room.settings.rounds}</span>
        <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 30px; line-height: 1.05")}>{lead ? (lead.id === uid ? 'Sei in testa!' : <><span className="ph">{lead.name}</span> è in&nbsp;testa</>) : ''}</h1>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 12px 20px 10px; display: flex; flex-direction: column; gap: 10px')}>
        {ranked.map((p, i) => {
          const plus = points[p.id] || 0;
          const prev = (p.score || 0) - plus;
          const pct = `${Math.max(14, ((p.score || 0) / maxScore) * 100)}%`;
          return (
            <div key={p.id} className="n-up" style={sx(`display: flex; align-items: center; gap: 8px; min-height: 40px; animation-delay: ${Math.min(i, 8) * 70}ms; opacity: ${g.isOnline(p.id) ? '1' : '0.55'}`)}>
              <span style={sx("flex-shrink: 0; width: 22px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 12px; color: #5E5880")}>{i + 1}°</span>
              <span style={sx('flex-shrink: 0; width: 76px; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{p.id === uid ? 'Tu' : p.name}{p.bot && <BotTag />}</span>
              <span style={sx('position: relative; flex-grow: 1; min-width: 0; height: 36px')}>
                <span style={sx('position: absolute; left: 0; right: 0; top: 11px; height: 14px; box-sizing: border-box; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; overflow: hidden')}><span className="n-grow" style={sx(`display: block; width: ${pct}; height: 100%; background: ${['#FFD23F', '#FF8A65', '#5CD0FF', '#B79CFF', '#6EE7A8', '#FF7EB6'][p.color || 0]}; animation-delay: ${i * 70}ms`)} /></span>
                <span className="n-wgrow" style={sx(`position: absolute; top: 0; left: 0; width: ${pct}; height: 36px; display: flex; justify-content: flex-end; animation-delay: ${i * 70}ms`)}><Face p={p} size={36} /></span>
              </span>
              {p.waiting ? <span style={sx('flex-shrink: 0; font-size: 11px; font-weight: 700; color: #5E5880; white-space: nowrap')}>al prossimo</span>
                : <span className="n-pop" style={sx(`flex-shrink: 0; height: 24px; padding: 0 7px; border-radius: 8px; border: 2px solid #17122B; background: #6EE7A8; font-size: 12px; font-weight: 800; display: flex; align-items: center; transform: rotate(-3deg); white-space: nowrap; animation-delay: ${600 + i * 70}ms`)}>+{plus}</span>}
              <span style={sx("flex-shrink: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 24px; min-width: 40px; text-align: right")}>{Math.round(prev + plus * count)}</span>
            </div>
          );
        })}
      </div>
      <div style={sx('padding: 10px 16px 14px; border-top: 2px solid #E6E0F7')}>
        <button className="n-btn" onClick={next} style={{ ...hostButtonStyle(isHost), height: 54, fontSize: 18 }}>{!isHost ? `Va avanti ${g.hostName}…` : busy ? 'Un attimo…' : last ? 'Vai ai premi' : 'Prossima lettera'}</button>
      </div>
    </div>
  );
}
