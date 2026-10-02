import React, { useEffect, useState } from 'react';
import { sx } from '../ui/kit';
import { COUNTDOWN_MS } from '../engine/room';

const ABC = 'ABCDEFGILMNOPRSTUVZ';

/** Estrazione: la lettera gira, si ferma con gli anelli, poi 3, 2, 1, Via! uguale per tutti (dall'ora del server). */
export default function Spin({ g }) {
  const { round, now } = g;
  const revealAt = round.startsAt - COUNTDOWN_MS;
  const done = now >= revealAt;
  const [spinLetter, setSpinLetter] = useState('A');
  useEffect(() => {
    if (done) return undefined;
    const iv = setInterval(() => setSpinLetter(ABC.charAt(Math.floor(Math.random() * ABC.length))), 75);
    return () => clearInterval(iv);
  }, [done]);

  const t = now - revealAt;
  const go = !done ? 0 : t < 800 ? 3 : t < 1600 ? 2 : t < 2400 ? 1 : -1;
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; background: #FF8A65; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; padding: 24px')}>
      <span className="n-up" style={sx('height: 36px; padding: 0 16px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 13px; font-weight: 800; letter-spacing: 0.12em; display: flex; align-items: center; white-space: nowrap')}>ROUND {round.n} DI {g.room.settings.rounds}</span>
      <div style={sx('position: relative; width: 210px; height: 230px; display: flex; align-items: center; justify-content: center')}>
        {done && <>
          <span className="n-ring" style={sx('position: absolute; width: 200px; height: 200px; border-radius: 50%; border: 5px solid #17122B')} />
          <span className="n-ring" style={sx('position: absolute; width: 200px; height: 200px; border-radius: 50%; border: 5px solid #FFFFFF; animation-delay: .2s')} />
        </>}
        <span key={done ? 'fatta' : 'gira'} className={done ? 'n-pop' : 'n-shake'} aria-hidden={!done}
          style={sx("width: 190px; height: 210px; box-sizing: border-box; border-radius: 40px; border: 4px solid #17122B; background: #FFFFFF; color: #17122B; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 136px; box-shadow: 0 12px 0 #17122B")}>{done ? round.letter : spinLetter}</span>
      </div>
      <h1 aria-live="polite" style={sx("margin: 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 30px; text-align: center; min-height: 40px")}>{done ? `Tutto con la ${round.letter}!` : 'Estraggo la lettera…'}</h1>
      <div style={sx('height: 76px; display: flex; align-items: center; justify-content: center')} aria-live="assertive">
        {go !== 0 && (
          <span key={go} className={(go + 4) % 2 ? 'n-pop' : 'n-pop2'} style={sx("min-width: 76px; height: 76px; padding: 0 18px; box-sizing: border-box; border-radius: 999px; border: 3px solid #17122B; background: #FFD23F; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 40px; box-shadow: 0 5px 0 #17122B")}>{go > 0 ? String(go) : 'Via!'}</span>
        )}
      </div>
    </div>
  );
}
