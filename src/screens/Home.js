import React, { useEffect, useState } from 'react';
import { sx, INK, COLORS, FACES, Face } from '../ui/kit';
import { isStandalone } from '../ui/installa';
import { CLUB } from '../club/contenuti';

const WORDS = [['N', 'O', 'M', 'I'], ['C', 'O', 'S', 'E'], ['C', 'I', 'T', 'T', 'À']];
const WCOL = ['#FF8A65', '#5CD0FF', '#B79CFF'];
const ROTS = ['-5deg', '3deg', '-2deg', '5deg', '-3deg'];

const REFRESH = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#17122B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
);

/**
 * Faccina che si cambia toccandola, colori e nome. La usano la home e l'invito.
 * Con la Modalità Fondatore (founder) si può scegliere anche un personaggio del club; toccando la faccia si torna alle faccine.
 */
export function ProfilePicker({ profile, setProfile, faceSize = 108, inputBg = '#FFFFFF', inputH = 58, gap = 10, withBadge = true, founder = false }) {
  const set = (patch) => setProfile({ ...profile, ...patch });
  return (
    <>
      <button className="n-press" aria-label="Cambia faccia" onClick={() => set(profile.char ? { char: undefined } : { face: (profile.face + 1) % FACES.length })}
        style={sx(`width: ${faceSize}px; height: ${faceSize}px; padding: 0; border: 0; background: transparent; cursor: pointer; position: relative`)}>
        <Face p={profile} size={faceSize} stroke={faceSize > 100 ? 2 : 2.2} blink />
        {withBadge && (
          <span style={sx('position: absolute; right: 0; bottom: 2px; width: 36px; height: 36px; box-sizing: border-box; border-radius: 50%; background: #FFFFFF; border: 2.5px solid #17122B; display: flex; align-items: center; justify-content: center')}>{REFRESH}</span>
        )}
      </button>
      {founder && CLUB.avatar.map((a) => {
        const on = profile.char === a.id;
        return (
          <button key={a.id} type="button" className="n-press" aria-pressed={on} onClick={() => set({ char: on ? undefined : a.id })}
            style={sx(`height: 44px; padding: 0 16px 0 4px; border-radius: 999px; border: 2.5px solid #17122B; background: ${on ? '#B79CFF' : '#FFFFFF'}; color: #17122B; font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 8px; box-shadow: ${on ? '0 1px 0' : '0 4px 0'} #17122B; transform: translateY(${on ? '3px' : '0'}); cursor: pointer`)}>
            <Face p={{ char: a.id, color: profile.color }} size={32} small />{on ? `Sei ${a.nome}` : `Gioca come ${a.nome}`}
          </button>
        );
      })}
      <div style={sx(`display: flex; justify-content: center; width: 100%; gap: ${gap}px`)} role="radiogroup" aria-label="Colore">
        {COLORS.map((c, i) => {
          const on = profile.color === i;
          return (
            <button key={c} className="n-press" role="radio" aria-checked={on} aria-label={`Colore ${i + 1}`} onClick={() => set({ color: i })}
              style={sx(`flex: 0 1 44px; min-width: 34px; aspect-ratio: 1; padding: 0; border-radius: 50%; border: 2.5px solid #17122B; background: ${c}; cursor: pointer; box-shadow: ${on ? '0 4px 0 ' + INK : 'none'}; transform: ${on ? 'scale(1.12) translateY(-2px)' : 'scale(1)'}; transition: transform .25s cubic-bezier(.2,.9,.3,1.5)`)} />
          );
        })}
      </div>
      <input type="text" aria-label="Il tuo nome" value={profile.name} onChange={(e) => set({ name: e.target.value.slice(0, 14) })} maxLength={14} placeholder="Il tuo nome" autoComplete="nickname" enterKeyHint="done"
        style={sx(`width: 100%; box-sizing: border-box; height: ${inputH}px; padding: 0 18px; border-radius: ${inputH > 56 ? 18 : 16}px; border: 2.5px solid #17122B; background: ${inputBg}; color: #17122B; font-size: 20px; font-weight: 800; text-align: center; outline: none`)} />
    </>
  );
}

/** Schermi bassi (iPhone con le barre di Safari, telefoni piccoli): tutto deve stare nella prima schermata. */
function useCompact() {
  const low = () => typeof window !== 'undefined' && window.innerHeight < 780;
  const [compact, setCompact] = useState(low);
  useEffect(() => {
    const onResize = () => setCompact(low());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}

export default function Home({ profile, setProfile, onOnline, onRules, founder, onFounder, onInstall, onSolo }) {
  let k = 0;
  const c = useCompact();
  const tile = c ? { w: 48, h: 52, f: 29, r: 13 } : { w: 52, h: 58, f: 32, r: 14 };
  return (
    <div className="n-screen" style={sx(`position: absolute; inset: 0; background: #FFD23F; padding: ${c ? '10px 24px 8px' : '20px 24px 28px'}; box-sizing: border-box; display: flex; flex-direction: column; overflow-y: auto`)}>
      <div style={sx('display: flex; justify-content: flex-end; gap: 10px')}>
        {founder && <button className="n-btn" onClick={onFounder} style={sx('height: 44px; padding: 0 16px; margin-right: auto; border-radius: 999px; border: 2.5px solid #17122B; background: #B79CFF; color: #17122B; font-size: 14px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer')}>Fondatore</button>}
        <button className="n-btn" onClick={onRules} style={sx('height: 44px; padding: 0 16px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 14px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer')}>Come si gioca</button>
      </div>
      <h1 style={sx('position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; margin: 0')}>Nomi Cose Città</h1>
      <div aria-hidden="true" style={sx(`display: flex; flex-direction: column; gap: ${c ? 6 : 12}px; align-items: center; padding: ${c ? 8 : 22}px 0 0`)}>
        {WORDS.map((w, wi) => (
          <span key={wi} style={sx('display: flex; gap: 8px; padding: 4px; margin: -4px')}>
            {w.map((ch, i) => {
              const d = k++;
              return (
                <span key={i} className="n-pop" style={sx(`display: inline-block; padding: 4px; margin: -4px; animation-delay: ${d * 55}ms`)}>
                  <span className="n-float" style={sx(`width: ${tile.w}px; height: ${tile.h}px; box-sizing: border-box; border-radius: ${tile.r}px; border: 2.5px solid #17122B; background: ${WCOL[wi]}; color: #17122B; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: ${tile.f}px; box-shadow: 0 ${c ? 4 : 5}px 0 #17122B; transform: rotate(${ROTS[(i + wi) % 5]}); animation-delay: ${d * 180}ms`)}>{ch}</span>
                </span>
              );
            })}
          </span>
        ))}
      </div>
      <div className="n-up" style={sx(`margin-top: ${c ? 12 : 30}px; display: flex; flex-direction: column; align-items: center; gap: ${c ? 10 : 14}px; animation-delay: .5s`)}>
        <ProfilePicker profile={profile} setProfile={setProfile} founder={founder} faceSize={c ? 96 : 108} inputH={c ? 52 : 58} />
      </div>
      <div className="n-up" style={sx(`display: flex; flex-direction: column; gap: ${c ? 10 : 14}px; margin-top: auto; padding-top: ${c ? 16 : 24}px; animation-delay: .6s`)}>
        <button className="n-btn" onClick={onOnline} style={sx(`height: ${c ? 56 : 62}px; border: 2.5px solid #17122B; border-radius: 20px; background: #17122B; color: #FFD23F; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 #7A5F00; cursor: pointer`)}>Gioca online</button>
        <button className="n-btn" onClick={onSolo} style={sx(`height: ${c ? 56 : 62}px; border: 2.5px solid #17122B; border-radius: 20px; background: #B79CFF; color: #17122B; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer`)}>Gioca da solo</button>
        {!isStandalone() && <button onClick={onInstall} style={sx('min-height: 44px; margin-bottom: -10px; border: 0; background: transparent; color: #17122B; font-size: 15px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer')}>Usalo come un'app</button>}
      </div>
    </div>
  );
}
