import React from 'react';
import { sx, INK, Face } from '../ui/kit';
import { normalize, startsWithLetter } from '../engine/rules';

const CUP = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></svg>
);

const filled = (a, cats) => cats.filter((c) => ((a || {})[c.key] || '').trim()).length;

export default function Play({ g }) {
  const { room, round, uid, answers, now } = g;
  const s = room.settings, cats = s.cats, L = round.letter, nCats = cats.length, two = nCats > 4;
  const myFilled = filled(answers, cats);
  const allFilled = myFilled === nCats;
  const open = room.status === 'play';

  const tl = s.timer ? Math.max(0, Math.ceil((round.endsAt - now) / 1000)) : 0;
  const low = s.timer && tl <= 10;
  const timerText = s.timer ? `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}` : '∞';

  const stop = () => {
    if (!open) return;
    if (!allFilled) { g.toast('Riempi tutte le categorie per fermare'); return; }
    g.act(() => g.engine.pressStop(g.code, answers));
  };

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header style={sx('padding: 18px 20px 14px; display: flex; flex-direction: column; gap: 14px; background: #FFFFFF; border-bottom: 2.5px solid #17122B')}>
        <div style={sx('display: flex; align-items: center; gap: 14px')}>
          <span className="n-flip" aria-hidden="true" style={sx("width: 58px; height: 64px; box-sizing: border-box; border-radius: 16px; border: 2.5px solid #17122B; background: #FFD23F; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 40px; box-shadow: 0 5px 0 #17122B; flex-shrink: 0")}>{L}</span>
          <span style={sx('flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px')}>
            <span style={sx('font-size: 12px; font-weight: 800; letter-spacing: 0.1em; color: #5E5880; white-space: nowrap')}>ROUND {round.n} DI {s.rounds}</span>
            <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 22px")}>Tutto con la&nbsp;{L}</h1>
          </span>
          <button className="n-press" aria-label="Classifica" onClick={() => g.setSheet('scores')} style={sx('width: 46px; height: 46px; flex-shrink: 0; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; display: flex; align-items: center; justify-content: center; cursor: pointer')}>{CUP}</button>
        </div>
        <div style={sx('display: flex; align-items: center; gap: 12px')}>
          <div role="progressbar" aria-label="Tempo rimasto" aria-valuemin={0} aria-valuemax={s.timer || 1} aria-valuenow={s.timer ? tl : 1} style={sx('flex-grow: 1; height: 16px; box-sizing: border-box; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; overflow: hidden')}>
            <div style={sx(`width: ${s.timer ? (tl / s.timer) * 100 : 100}%; height: 100%; background: ${low ? '#FF5E3A' : '#6EE7A8'}; transition: width 1s linear, background .3s`)} />
          </div>
          <span className={low ? 'n-pulse' : ''} style={sx(`font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 18px; min-width: 44px; text-align: right; color: ${low ? '#C4300F' : INK}`)}>{timerText}</span>
        </div>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 24px')}>
        <div style={sx('display: flex; gap: 14px; flex-wrap: wrap')} aria-label="Quante categorie hanno riempito gli altri">
          {g.active.map((p) => {
            const done = p.id === uid ? myFilled : filled(room.answers?.[p.id], cats);
            return (
              <div key={p.id} style={sx(`display: flex; align-items: center; gap: 6px; opacity: ${p.online ? '1' : '0.45'}`)} aria-label={`${p.id === uid ? 'Tu' : p.name}: ${done} su ${nCats}`}>
                <Face p={p} size={30} small />
                <span style={sx(`font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: ${done === nCats ? '#0E7A45' : '#5E5880'}`)}>{done}/{nCats}</span>
              </div>
            );
          })}
        </div>
        <div style={sx(`display: grid; grid-template-columns: ${two ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))'}; gap: 24px 12px`)}>
          {cats.map((c, i) => {
            const v = answers[c.key] || '';
            const ok = startsWithLetter(v, L), bad = !!normalize(v) && !ok;
            return (
              <label key={c.key} className="n-up" style={sx(`position: relative; display: block; min-width: 0; border-radius: 18px; border: 2.5px solid ${bad ? '#FF5E3A' : INK}; background: ${ok ? c.color + '40' : '#FFFFFF'}; box-shadow: 0 4px 0 ${bad ? '#FF5E3A' : INK}; animation-delay: ${i * 50}ms; transition: background .25s`)}>
                <span style={sx(`position: absolute; top: -13px; left: 12px; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; height: 24px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; border: 2px solid #17122B; background: ${c.color}; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; display: flex; align-items: center; white-space: nowrap`)}>{c.label.toUpperCase()}</span>
                <input type="text" value={v} onChange={(e) => g.setAnswer(c.key, e.target.value)} placeholder={`${L}…`} aria-label={c.label} autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="words" maxLength={40} disabled={!open} enterKeyHint="next"
                  style={sx(`width: 100%; box-sizing: border-box; height: ${two ? '54px' : '62px'}; padding: 8px 14px 0; border: 0; border-radius: 16px; background: transparent; color: #17122B; font-size: ${two ? '17px' : '22px'}; font-weight: 800; outline: none`)} />
                {bad && <span style={sx('position: absolute; right: 10px; bottom: -12px; height: 22px; padding: 0 8px; border-radius: 6px; background: #17122B; color: #FFFFFF; font-size: 11px; font-weight: 700; display: flex; align-items: center; white-space: nowrap')}>Inizia con {L}</span>}
              </label>
            );
          })}
        </div>
      </div>
      <div style={sx('padding: 12px 20px 26px; border-top: 2px solid #E6E0F7')}>
        <button className={allFilled ? 'n-btn n-wiggle' : 'n-btn'} onClick={stop} aria-disabled={!allFilled} aria-label={allFilled ? 'STOP' : `Ancora ${nCats - myFilled} per lo STOP`}
          style={sx('position: relative; overflow: hidden; width: 100%; height: 66px; border: 2.5px solid #17122B; border-radius: 22px; background: #FFFFFF; color: #17122B; box-shadow: 0 5px 0 #17122B; cursor: pointer; padding: 0')}>
          <span style={sx(`position: absolute; left: 0; top: 0; bottom: 0; width: ${(myFilled / nCats) * 100}%; background: #FF5E3A; transition: width .45s cubic-bezier(.2,.8,.2,1)`)} />
          <span style={sx(`position: relative; font-family: 'Bricolage Grotesque Variable', sans-serif; font-size: ${allFilled ? '30px' : '18px'}; font-weight: 800; letter-spacing: 0.02em`)}>{allFilled ? 'STOP!' : `Ancora ${nCats - myFilled} per lo STOP`}</span>
        </button>
      </div>
    </div>
  );
}

/** La scritta STOP a tutto schermo quando il round si chiude. */
export function StopOverlay({ g }) {
  const by = g.round?.stoppedBy;
  const p = by && by !== 'time' ? g.room.players?.[by] : null;
  const text = by === g.uid ? 'Hai fermato tu il round' : p ? `${p.name} ha fermato il round` : 'Tempo scaduto';
  return (
    <div className="n-fade" role="alert" style={sx('position: absolute; inset: 0; z-index: 40; background: #FF5E3A; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px')}>
      <span className="n-stop" style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: min(124px, 31vw); line-height: 1; color: #FFFFFF; text-shadow: 0 8px 0 #17122B")}>STOP!</span>
      <span className="n-up" style={sx('height: 46px; padding: 0 20px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 17px; font-weight: 800; display: flex; align-items: center; white-space: nowrap; animation-delay: .3s')}>{text}</span>
    </div>
  );
}
