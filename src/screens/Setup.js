import React, { useState } from 'react';
import { sx, INK, CUSTOM_COLORS, BACK_ICON } from '../ui/kit';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../engine/rules';

const TIMERS = [[60, '60s'], [90, '90s'], [120, '2 min'], [0, 'Libero']];
// Partite già pronte: più categorie vuol dire una correzione più lunga.
const PRESETS = [['Veloce', 3], ['Classica', 5], ['Maratona', 8]];

/** Nuova stanza (crea) o Impostazioni dalla lobby (modifica, solo host). */
export default function Setup({ initial, editing, onBack, onSave, toast }) {
  const start = initial || DEFAULT_SETTINGS;
  const [cats, setCats] = useState(start.cats.map((c) => c.key));
  const [custom, setCustom] = useState(start.cats.filter((c) => !DEFAULT_CATEGORIES.some((d) => d.key === c.key)));
  const [rounds, setRounds] = useState(start.rounds);
  const [maxPlayers, setMaxPlayers] = useState(start.maxPlayers);
  const [timer, setTimer] = useState(start.timer);
  const [hard, setHard] = useState(start.hard);
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);

  const all = DEFAULT_CATEGORIES.concat(custom);
  const toggle = (key) => {
    const on = cats.includes(key);
    if (on && cats.length <= 2) { toast('Servono almeno 2 categorie'); return; }
    setCats(on ? cats.filter((k) => k !== key) : all.map((c) => c.key).filter((k) => k === key || cats.includes(k)));
  };
  const addCat = () => {
    const lab = newCat.trim();
    if (!lab) return;
    if (all.some((c) => c.label.toLowerCase() === lab.toLowerCase())) { toast('Questa categoria c\'è già'); return; }
    if (cats.length >= 12) { toast('Al massimo 12 categorie'); return; }
    const c = { key: 'x' + Date.now().toString(36), label: (lab.charAt(0).toUpperCase() + lab.slice(1)).slice(0, 16), color: CUSTOM_COLORS[custom.length % 4] };
    setCustom(custom.concat([c]));
    setCats(cats.concat([c.key]));
    setNewCat('');
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const settings = { cats: all.filter((c) => cats.includes(c.key)), rounds, maxPlayers, timer, hard };
    try { await onSave(settings); } finally { setBusy(false); }
  };

  const stepper = (label, value, dec, inc, decLabel, incLabel) => (
    <div style={sx('display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 12px 16px; border-bottom: 2px solid #E6E0F7')}>
      <span style={sx('font-size: 16px; font-weight: 800')}>{label}</span>
      <span style={sx('display: flex; align-items: center; gap: 12px')}>
        <button className="n-press" aria-label={decLabel} onClick={dec} style={sx('width: 44px; height: 44px; border-radius: 12px; border: 0; background: #EDE8FB; color: #17122B; font-size: 22px; font-weight: 800; cursor: pointer')}>−</button>
        <span aria-live="polite" style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px; width: 30px; text-align: center")}>{value}</span>
        <button className="n-press" aria-label={incLabel} onClick={inc} style={sx('width: 44px; height: 44px; border-radius: 12px; border: 0; background: #EDE8FB; color: #17122B; font-size: 22px; font-weight: 800; cursor: pointer')}>+</button>
      </span>
    </div>
  );

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header style={sx('display: flex; align-items: center; gap: 12px; padding: 20px 20px 10px')}>
        <button className="n-btn" aria-label="Indietro" onClick={onBack} style={sx('width: 46px; height: 46px; border-radius: 14px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; box-shadow: 0 4px 0 #17122B; display: flex; align-items: center; justify-content: center; cursor: pointer')}>{BACK_ICON}</button>
        <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 26px")}>{editing ? 'Impostazioni' : 'Nuova stanza'}</h1>
      </header>
      <div className="n-scroll" style={sx('flex-grow: 1; overflow-y: auto; padding: 14px 20px 24px; display: flex; flex-direction: column; gap: 24px')}>
        <section className="n-up" style={sx('flex-shrink: 0; display: flex; flex-direction: column; gap: 12px')}>
          <div style={sx('display: flex; justify-content: space-between; align-items: baseline')}><h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Categorie</h2><span style={sx('font-size: 13px; font-weight: 600; color: #5E5880')}>{cats.length} scelte</span></div>
          <div style={sx('display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px')} role="radiogroup" aria-label="Partite già pronte">
            {PRESETS.map(([name, n]) => {
              const keys = DEFAULT_CATEGORIES.slice(0, n).map((c) => c.key);
              const on = cats.length === n && keys.every((k) => cats.includes(k));
              return (
                <button key={name} className="n-press" role="radio" aria-checked={on} onClick={() => setCats(keys)}
                  style={sx(`height: 56px; border-radius: 14px; border: 2.5px solid ${on ? INK : '#CFC8EA'}; background: ${on ? '#FFD23F' : '#FFFFFF'}; color: #17122B; box-shadow: ${on ? '0 3px 0 ' + INK : 'none'}; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; transition: all .2s`)}>
                  <span style={sx('font-size: 15px; font-weight: 800')}>{name}</span>
                  <span style={sx('font-size: 12px; font-weight: 600; color: #5E5880')}>{n} categorie</span>
                </button>
              );
            })}
          </div>
          <div style={sx('display: flex; flex-wrap: wrap; gap: 8px')}>
            {all.map((c) => {
              const on = cats.includes(c.key);
              return (
                <button key={c.key} className="n-press" aria-pressed={on} onClick={() => toggle(c.key)}
                  style={sx(`height: 46px; padding: 0 16px; border-radius: 999px; border: 2.5px solid ${on ? INK : '#CFC8EA'}; background: ${on ? c.color : '#FFFFFF'}; color: ${on ? INK : '#5E5880'}; font-size: 15px; font-weight: 800; box-shadow: ${on ? '0 3px 0 ' + INK : 'none'}; cursor: pointer; transition: background .2s, box-shadow .2s`)}>{c.label}</button>
              );
            })}
          </div>
          <form style={sx('display: flex; gap: 8px')} onSubmit={(e) => { e.preventDefault(); addCat(); }}>
            <input type="text" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={16} placeholder="Inventa una categoria" aria-label="Nuova categoria" enterKeyHint="done"
              style={sx('flex-grow: 1; min-width: 0; height: 50px; padding: 0 16px; border-radius: 16px; border: 2.5px dashed #A39DC4; background: transparent; color: #17122B; font-size: 16px; font-weight: 700; outline: none')} />
            <button type="submit" className="n-press" aria-label="Aggiungi categoria" style={sx(`width: 50px; height: 50px; border-radius: 16px; border: 2.5px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 24px; font-weight: 800; cursor: pointer; opacity: ${newCat.trim() ? '1' : '0.4'}`)}>+</button>
          </form>
        </section>
        <section className="n-up" style={sx('flex-shrink: 0; border-radius: 22px; border: 2.5px solid #17122B; background: #FFFFFF; overflow: hidden; animation-delay: .08s')}>
          {stepper('Round', rounds, () => setRounds(Math.max(1, rounds - 1)), () => setRounds(Math.min(10, rounds + 1)), 'Meno round', 'Più round')}
          {stepper('Giocatori max', maxPlayers, () => setMaxPlayers(Math.max(2, maxPlayers - 1)), () => setMaxPlayers(Math.min(12, maxPlayers + 1)), 'Meno giocatori', 'Più giocatori')}
          <button role="switch" aria-checked={hard} aria-label="Niente lettere difficili: esclude H, J, K, Q, W, X, Y" onClick={() => setHard(!hard)} style={sx('width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 14px 14px 16px; border: 0; background: transparent; color: #17122B; cursor: pointer; text-align: left; white-space: normal')}>
            <span style={sx('display: flex; flex-direction: column; gap: 2px')}><span style={sx('font-size: 16px; font-weight: 800')}>Niente lettere difficili</span><span style={sx('font-size: 13px; color: #5E5880')}>Esclude H, J, K, Q, W, X, Y</span></span>
            <span style={sx(`width: 54px; height: 32px; box-sizing: border-box; border-radius: 999px; border: 2.5px solid #17122B; background: ${hard ? '#6EE7A8' : '#FFFFFF'}; position: relative; flex-shrink: 0; transition: background .3s`)}><span style={sx(`position: absolute; top: 2px; left: 2px; width: 23px; height: 23px; border-radius: 50%; background: #17122B; transform: ${hard ? 'translateX(22px)' : 'translateX(0)'}; transition: transform .35s cubic-bezier(.2,.9,.3,1.4)`)} /></span>
          </button>
        </section>
        <section className="n-up" style={sx('flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; animation-delay: .14s')}>
          <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Tempo per round</h2>
          <div style={sx('display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px')} role="radiogroup" aria-label="Tempo per round">
            {TIMERS.map(([v, label]) => {
              const on = timer === v;
              return (
                <button key={v} className="n-press" role="radio" aria-checked={on} onClick={() => setTimer(v)}
                  style={sx(`height: 50px; border-radius: 14px; border: 2.5px solid ${on ? INK : '#CFC8EA'}; background: ${on ? '#FFD23F' : '#FFFFFF'}; color: #17122B; font-size: 15px; font-weight: 800; box-shadow: ${on ? '0 3px 0 ' + INK : 'none'}; cursor: pointer; transition: all .2s`)}>{label}</button>
              );
            })}
          </div>
          <span style={sx('font-size: 13px; color: #5E5880')}>{timer ? 'Quando il tempo scade il round si chiude da solo.' : 'Senza tempo: il round finisce quando qualcuno preme STOP.'}</span>
        </section>
      </div>
      <div style={sx('padding: 14px 20px 26px; background: #F6F3FF; border-top: 2px solid #E6E0F7')}>
        <button className="n-btn" onClick={save} disabled={busy} style={sx('width: 100%; height: 62px; border: 2.5px solid #17122B; border-radius: 20px; background: #FFD23F; color: #17122B; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>{editing ? 'Salva e torna alla stanza' : 'Crea stanza'}</button>
      </div>
    </div>
  );
}
