import React from 'react';
import { sx, Sheet, Face } from '../ui/kit';
import { itemById } from '../shop/catalogo';
import { POOL } from '../ritorno/sfide';

const primary = sx('height: 56px; border: 2.5px solid #17122B; border-radius: 18px; background: #FFD23F; color: #17122B; font-size: 18px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer');
const small = (bg, fg) => sx(`min-height: 44px; padding: 0 14px; border-radius: 14px; border: 2.5px solid #17122B; background: ${bg}; color: ${fg}; font-size: 14px; font-weight: 800; box-shadow: 0 3px 0 #17122B; cursor: pointer; white-space: nowrap`);

/** La riga in home: giorni di fila e sfide, in una riga sola. Senza account invita a registrarsi. */
export function OggiRow({ r, onOpen, onAccount, compact }) {
  const h = compact ? 46 : 52;
  if (!r.registered) {
    return (
      <button type="button" className="n-btn" onClick={onAccount} style={sx(`height: ${h}px; padding: 0 16px; border-radius: 16px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 15px; font-weight: 800; box-shadow: 0 4px 0 #17122B; cursor: pointer; text-align: left`)}>
        Con l'account ricevi premi ogni&nbsp;giorno
      </button>
    );
  }
  return (
    <button type="button" className="n-btn" onClick={onOpen} style={sx(`height: ${h}px; padding: 0 16px; border-radius: 16px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; box-shadow: 0 4px 0 #17122B; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left`)}>
      <span style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 19px; white-space: nowrap")}>Giorno {Math.max(1, r.streak)}</span>
      <span style={sx('flex-grow: 1; font-size: 14px; font-weight: 700; color: #5E5880; white-space: nowrap')}>
        {r.daPrendere ? `${r.daPrendere} ${r.daPrendere === 1 ? 'premio da prendere' : 'premi da prendere'}` : `${r.fatte} ${r.fatte === 1 ? 'sfida' : 'sfide'} su 3`}
      </span>
      {r.daPrendere > 0 && <span aria-hidden="true" style={sx('width: 12px; height: 12px; border-radius: 999px; border: 2px solid #17122B; background: #FF5E3A')} />}
    </button>
  );
}

/** I dettagli: giorni di fila, prossimo premio, scudo e le tre sfide con il tasto per prenderle. */
export function OggiSheet({ r, onClose }) {
  const item = r.prossimo.item ? itemById(r.prossimo.item) : null;
  return (
    <Sheet onClose={onClose} gap={14} label="Oggi">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; line-height: 1.1")}>{Math.max(1, r.streak)} {Math.max(1, r.streak) === 1 ? 'giorno' : 'giorni'} di fila</h2>
      <p style={sx('margin: 0; font-size: 15px; line-height: 1.45; color: #5E5880; text-wrap: pretty')}>
        Al giorno {r.prossimo.n} ricevi {r.prossimo.coins}&nbsp;monete{item ? ` e ${item.nome}` : ''}. {r.scudoLibero ? 'Se salti un giorno, lo scudo del mese tiene la tua serie.' : 'Lo scudo di questo mese è già usato: salta un giorno e la serie riparte.'}
      </p>
      <div style={sx('display: flex; flex-direction: column; gap: 10px')}>
        {r.sfide.map((s) => (
          <div key={s.id} style={sx(`display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 18px; border: 2.5px solid #17122B; background: ${s.riscossa ? '#EDE8FB' : '#FFFFFF'}`)}>
            <span style={sx('flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px')}>
              <span style={sx('font-size: 16px; font-weight: 800; line-height: 1.2')}>{s.nome}</span>
              <span style={sx('font-size: 13px; font-weight: 700; color: #5E5880')}>{s.reward} monete</span>
            </span>
            {s.riscossa ? <span style={sx('font-size: 14px; font-weight: 800; color: #5E5880')}>Presa</span>
              : s.fatta ? <button type="button" className="n-btn" disabled={r.busy} onClick={() => r.riscuoti(s.id)} style={small('#6EE7A8', '#17122B')}>{r.busy ? 'Un attimo…' : <>Prendi le {s.reward}&nbsp;monete</>}</button>
                : <span style={sx('font-size: 14px; font-weight: 700; color: #6F698F')}>Da fare</span>}
          </div>
        ))}
      </div>
      <p style={sx('margin: 0; font-size: 13px; line-height: 1.4; color: #5E5880; text-wrap: pretty')}>Le tre sfide cambiano ogni giorno. Fatte tutte e tre, ricevi 50&nbsp;monete in&nbsp;più.</p>
      <button type="button" className="n-btn" onClick={onClose} style={primary}>Chiudi</button>
    </Sheet>
  );
}

/** Traguardo raggiunto: foglio di festa con il premio. */
export function FestaSheet({ festa, face, onClose }) {
  const item = festa.items?.[0] ? itemById(festa.items[0]) : null;
  return (
    <Sheet onClose={onClose} gap={14} label="Traguardo raggiunto">
      <h2 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 30px; line-height: 1.1; text-wrap: balance")}>{festa.n} giorni di&nbsp;fila!</h2>
      {item && (
        <div style={sx('display: flex; justify-content: center; padding: 14px 0 4px')}>
          <Face p={{ ...face, acc: { [item.tipo]: item.id } }} size={96} />
        </div>
      )}
      <p style={sx('margin: 0; font-size: 17px; line-height: 1.45; text-wrap: pretty')}>
        Hai preso {festa.coins}&nbsp;monete{item ? ` e ${item.nome}, che trovi nel negozio` : ''}. Torna domani e la serie continua.
      </p>
      <button type="button" className="n-btn" onClick={onClose} style={primary}>Continua</button>
    </Sheet>
  );
}

/** Sul podio: lo scrigno che si apre (un solo momento animato) e le sfide completate in questa partita. */
export function Scrigno({ line }) {
  const { chest, done = [] } = line;
  const names = done.map((id) => POOL.find((c) => c.id === id)?.nome).filter(Boolean);
  const item = chest?.item ? itemById(chest.item) : null;
  return (
    <div className="n-up" role="status" style={sx('margin: 0 0 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; animation-delay: 1.8s')}>
      <p style={sx('margin: 0; font-size: 15px; font-weight: 800; text-align: center')}>+{line.amount}&nbsp;monete di partita</p>
      {chest && (
        <div style={sx('display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-radius: 20px; border: 2.5px solid #17122B; background: #FFFFFF; box-shadow: 0 4px 0 #17122B')}>
          <svg width="44" height="38" viewBox="0 0 44 38" aria-hidden="true" style={{ overflow: 'visible' }}>
            <rect x="4" y="16" width="36" height="20" rx="4" fill="#FF8A65" stroke="#17122B" strokeWidth="2.5" />
            <g className="n-lid"><path d="M4 16q0-12 18-12t18 12z" fill="#FFD23F" stroke="#17122B" strokeWidth="2.5" strokeLinejoin="round" /></g>
            <rect x="18" y="20" width="8" height="9" rx="2" fill="#17122B" />
          </svg>
          <span className="n-reward" style={sx('font-size: 17px; font-weight: 800; line-height: 1.2')}>
            {item ? `${item.nome}: un raro!` : `+${chest.coins} monete dallo scrigno`}
          </span>
        </div>
      )}
      {names.map((n) => <p key={n} style={sx('margin: 0; font-size: 14px; font-weight: 700; color: #17122B')}>Sfida fatta: {n}. La prendi da Oggi.</p>)}
    </div>
  );
}
