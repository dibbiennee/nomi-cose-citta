import React, { useState } from 'react';
import { sx, BACK_ICON, Face } from '../ui/kit';
import { ITEMS, PAID, TIPI, isBuyable } from '../shop/catalogo';

const TIPO_LABEL = { cappello: 'Cappelli', occhiali: 'Occhiali', vestito: 'Vestiti', cornice: 'Cornici' };
const btn = (bg, fg) => sx(`min-height: 44px; padding: 0 14px; border-radius: 14px; border: 2.5px solid #17122B; background: ${bg}; color: ${fg}; font-size: 14px; font-weight: 800; box-shadow: 0 3px 0 #17122B; cursor: pointer; white-space: nowrap`);

/**
 * Negozio: accessori con le monete (anteprima sulla propria faccina) e, sotto, monete e username a soldi veri:
 * per ora solo vetrina, "Compra" apre la lista d'attesa.
 */
export default function Negozio({ account, face, onBack, onAccount, onWaitlist, toast }) {
  const owned = account.profile?.owned || {};
  const equipped = account.profile?.equipped || {};
  const [preview, setPreview] = useState(null); // { tipo, id } provato senza comprarlo
  const [busy, setBusy] = useState(false);
  const shown = { ...equipped, ...(preview ? { [preview.tipo]: preview.id } : {}) };

  const buy = async (item) => {
    if (!account.registered) { onAccount(); return; }
    if (busy) return;
    setBusy(true);
    const r = await account.buy(item.id).catch(() => 'errore');
    setBusy(false);
    if (r === 'ok') { await account.equip(item.tipo, item.id).catch(() => {}); setPreview(null); toast(`${item.nome}: è tuo`); }
    else if (r === 'poveri') toast('Monete insufficienti: giocando se ne guadagnano');
    else if (r !== 'già') toast('Non è andata, riprova');
  };
  const wear = (item, on) => account.equip(item.tipo, on ? item.id : null).catch(() => toast('Non è andata, riprova'));

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header style={sx('display: flex; align-items: center; gap: 12px; padding: 20px 20px 10px')}>
        <button className="n-btn" aria-label="Indietro" onClick={onBack} style={sx('width: 46px; height: 46px; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; box-shadow: 0 4px 0 #17122B; display: flex; align-items: center; justify-content: center; cursor: pointer')}>{BACK_ICON}</button>
        <h1 style={sx("margin: 0; flex-grow: 1; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px")}>Negozio</h1>
        <span style={sx("font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 16px")}>{account.registered ? `${account.coins} monete` : ''}</span>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 10px 20px 28px; display: flex; flex-direction: column; gap: 20px')}>
        <div style={sx('display: flex; justify-content: center; padding: 22px 0 8px')}>
          <Face p={{ ...face, acc: shown }} size={108} />
        </div>
        {!account.registered && (
          <p style={sx('margin: 0; padding: 12px 14px; border-radius: 16px; border: 2.5px solid #17122B; background: #FFD23F; font-size: 15px; font-weight: 700; line-height: 1.4; text-wrap: pretty')}>
            Per comprare con le monete serve l'account gratis. <button type="button" onClick={onAccount} style={sx('border: 0; background: transparent; padding: 0; font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; color: #17122B')}>Crealo&nbsp;ora</button>
          </p>
        )}
        {TIPI.map((tipo) => (
          <section key={tipo} style={sx('display: flex; flex-direction: column; gap: 10px')}>
            <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>{TIPO_LABEL[tipo]}</h2>
            {ITEMS.filter((i) => i.tipo === tipo).map((item) => {
              const mine = !!owned[item.id], worn = equipped[tipo] === item.id;
              return (
                <div key={item.id} style={sx('display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 20px; border: 2.5px solid #17122B; background: #FFFFFF')}>
                  <button type="button" aria-label={`Prova ${item.nome}`} onClick={() => setPreview(preview?.id === item.id ? null : { tipo, id: item.id })} style={sx('padding: 6px; border: 0; background: transparent; cursor: pointer')}>
                    <Face p={{ ...face, acc: { [tipo]: item.id } }} size={44} />
                  </button>
                  <span style={sx('flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px')}>
                    <span style={sx('font-size: 16px; font-weight: 800')}>{item.nome}</span>
                    <span style={sx('font-size: 13px; font-weight: 700; color: #5E5880')}>{mine ? 'È tuo' : item.esclusivo ? 'Esclusivo dei primi 100 iscritti' : item.serie ? `Premio dei ${item.serie} giorni di fila` : item.raro ? 'Raro: si trova negli scrigni' : `${item.prezzo} monete`}</span>
                  </span>
                  {mine
                    ? <button type="button" className="n-btn" onClick={() => wear(item, !worn)} style={btn(worn ? '#6EE7A8' : '#FFFFFF', '#17122B')}>{worn ? 'Togli' : 'Indossa'}</button>
                    : isBuyable(item) && <button type="button" className="n-btn" disabled={busy} onClick={() => buy(item)} style={btn('#FFD23F', '#17122B')}>Compra</button>}
                </div>
              );
            })}
          </section>
        ))}
        <section style={sx('display: flex; flex-direction: column; gap: 10px')}>
          <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Monete e username</h2>
          <p style={sx('margin: 0; font-size: 14px; line-height: 1.45; color: #5E5880; text-wrap: pretty')}>Prezzi IVA inclusa. Gli acquisti apriranno presto: puoi metterti in lista d'attesa.</p>
          {PAID.map((p) => (
            <div key={p.id} style={sx('display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 20px; border: 2.5px solid #17122B; background: #FFFFFF')}>
              <span style={sx('flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px')}>
                <span style={sx('font-size: 16px; font-weight: 800')}>{p.nome}</span>
                <span style={sx("font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700")}>{p.prezzo}</span>
              </span>
              <button type="button" className="n-btn" onClick={() => onWaitlist(p)} style={btn('#B79CFF', '#17122B')}>Compra</button>
            </div>
          ))}
          <a href="/condizioni-acquisto" style={sx('align-self: flex-start; min-height: 44px; display: flex; align-items: center; color: #17122B; font-size: 14px; font-weight: 700')}>Condizioni di acquisto</a>
        </section>
      </div>
    </div>
  );
}
