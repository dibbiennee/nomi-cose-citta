import React, { useEffect, useState } from 'react';
import { characterOf } from '../club/contenuti';
import { ACCESSORI } from '../shop/accessori';

// Ordine di disegno degli accessori sopra la faccina: vestito sotto, poi occhiali, cappello, cornice.
const ACC_ORDER = ['vestito', 'occhiali', 'cappello', 'cornice'];

export const INK = '#17122B';
export const COLORS = ['#FFD23F', '#FF8A65', '#5CD0FF', '#B79CFF', '#6EE7A8', '#FF7EB6'];
export const FACES = [
  { eyes: 'M17 19v3M31 19v3', mouth: 'M16 29q8 8 16 0', fill: 'none' },
  { eyes: 'M13 21q3.5-5 7 0M28 21q3.5-5 7 0', mouth: 'M15 28h18q-1 10-9 10t-9-10z', fill: '#17122B' },
  { eyes: 'M17 19v3M28 21h7', mouth: 'M17 31q8 5 15-3', fill: 'none' },
  { eyes: 'M17 18v5M31 18v5', mouth: 'M24 29a4.5 4.5 0 1 0 .01 0z', fill: '#17122B' },
  { eyes: 'M14 20h6M28 20h6', mouth: 'M18 32h12', fill: 'none' },
  { eyes: 'M13 21q3.5-5 7 0M28 21q3.5-5 7 0', mouth: 'M16 29q8 8 16 0M21 34v3q3 3 6 0v-3', fill: 'none' },
];
export const CUSTOM_COLORS = ['#7FE3D0', '#FFA6C9', '#C7F06B', '#FFC78A'];

/**
 * Converte una stringa CSS (copiata dal prototipo) in un oggetto style di React.
 * Così gli stili restano identici al prototipo e leggibili come lì.
 */
const cache = new Map();
export function sx(css) {
  let o = cache.get(css);
  if (o) return o;
  o = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (!k) continue;
    o[k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(i + 1).trim();
  }
  if (cache.size > 3000) cache.clear();
  cache.set(css, o);
  return o;
}

/**
 * Faccina: cerchio colorato, occhi e bocca. small = versione con tratti più spessi per le misure piccole.
 * Se il giocatore ha scelto un personaggio del club, al posto della faccina c'è lui, con l'espressione `mood`
 * (normale, ride, urla, trionfo, disperato): cambiando espressione rimbalza.
 */
export function Face({ p, size = 44, small = false, stroke, blink = false, delay, className, style, mood = 'normale' }) {
  const ch = p && p.char ? characterOf(p.char) : null;
  if (ch) {
    const border = Math.max(2, ((stroke || (small ? 3 : 2.6)) * size) / 48);
    return (
      <span aria-hidden="true" className={className}
        style={{ ...sx(`display: inline-block; flex-shrink: 0; width: ${size}px; height: ${size}px; box-sizing: border-box; border-radius: 50%; border: ${border}px solid ${INK}; background: ${COLORS[p.color || 0] || COLORS[0]}; overflow: hidden; vertical-align: middle`), ...style }}>
        <img key={mood} className="n-swap" src={ch.espressioni[mood] || ch.espressioni.normale} alt="" draggable="false"
          style={sx('display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; transform: scale(1.12); transform-origin: 50% 38%')} />
      </span>
    );
  }
  const f = FACES[(p && p.face) || 0] || FACES[0];
  const bg = COLORS[(p && p.color) || 0] || COLORS[0];
  const r = small ? 22 : 22.5;
  const sw = stroke || (small ? 3 : 2.6);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className} style={p?.acc ? { overflow: 'visible', ...style } : style}>
      <circle cx="24" cy="24" r={r} fill={bg} stroke={INK} strokeWidth={sw} />
      <path className={blink ? 'n-blink' : undefined} d={f.eyes} fill="none" stroke={INK} strokeWidth={small ? 3.6 : 3.4} strokeLinecap="round" style={delay ? { animationDelay: delay } : undefined} />
      <path d={f.mouth} fill={f.fill} stroke={INK} strokeWidth={small ? 3.2 : 3} strokeLinecap="round" strokeLinejoin="round" />
      {p?.acc && ACC_ORDER.filter((t) => ACCESSORI[p.acc[t]]).map((t) => (
        <g key={t}>{ACCESSORI[p.acc[t]].map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}</g>
      ))}
    </svg>
  );
}

/** Pannello dal basso con lo sfondo scuro. */
export function Sheet({ onClose, gap = 16, pad = '12px 22px 22px', label, children }) {
  return (
    <div style={sx('position: absolute; inset: 0; z-index: 30')} role="dialog" aria-modal="true" aria-label={label}>
      <div className="n-fade" onClick={onClose} style={sx('position: absolute; inset: 0; background: rgba(23,18,43,0.55)')} />
      <div className="n-sheet" style={sx(`position: absolute; left: 8px; right: 8px; bottom: 8px; border-radius: 30px; border: 2.5px solid #17122B; background: #FFFFFF; padding: ${pad}; display: flex; flex-direction: column; gap: ${gap}px; max-height: calc(100% - 40px); overflow-y: auto`)}>
        <span style={sx('width: 40px; height: 5px; border-radius: 999px; background: #D9D2F2; align-self: center; flex-shrink: 0')} />
        {children}
      </div>
    </div>
  );
}

/** Pulsante dell'host: per gli altri è spento e dice chi decide. */
export function hostButtonStyle(isHost) {
  const bg = isHost ? '#FFD23F' : '#EDE8FB', fg = isHost ? INK : '#6F698F', border = isHost ? INK : '#CFC8EA';
  return sx(`width: 100%; height: 62px; border: 2.5px solid ${border}; border-radius: 20px; background: ${bg}; color: ${fg}; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 ${border}; cursor: pointer`);
}

export const BACK_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
);

/** Etichetta accanto al nome dei robot della partita veloce: con sconosciuti non si fanno passare per persone. */
export function BotTag() {
  return <span style={sx('display: inline-flex; align-items: center; height: 18px; padding: 0 6px; margin-left: 6px; border-radius: 999px; border: 1.5px solid #17122B; background: #EDE8FB; color: #17122B; font-size: 11px; font-weight: 800; vertical-align: middle; flex-shrink: 0; white-space: nowrap')}>robot</span>;
}

/** Schermo basso (telefoni piccoli, o barre del browser aperte): le schermate di gioco stringono righe e margini. */
export function useCompact() {
  const low = () => typeof window !== 'undefined' && window.innerHeight < 780;
  const [compact, setCompact] = useState(low);
  useEffect(() => {
    const onResize = () => setCompact(low());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}
