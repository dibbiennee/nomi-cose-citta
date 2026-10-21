import React, { useEffect, useState } from 'react';
import { ref, onValue, query, orderByKey, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { sx } from '../ui/kit';
import { dayKey } from '../stats';

// Pagina /statistiche: chi c'è adesso e i contatori degli ultimi giorni, dal vivo. Solo numeri, nessun dato personale.
const LIVE_MAX_AGE_MS = 6 * 3600 * 1000; // una presenza più vecchia è un telefono rimasto appeso: non si conta
const ROWS = [
  ['Partite online', (d) => d.partite_online],
  ['Arrivate al podio', (d) => d.partite_online_finite],
  ['Giocatori in partita', (d) => d.giocatori_online],
  ['Stanze create', (d) => d.stanze_create],
  ['Partite da soli', (d) => (d.solo_facile || 0) + (d.solo_medio || 0) + (d.solo_difficile || 0) + (d.solo_impossibile || 0)],
  ['Da soli finite', (d) => d.solo_finite],
  ['Facile', (d) => d.solo_facile],
  ['Medio', (d) => d.solo_medio],
  ['Difficile', (d) => d.solo_difficile],
  ['Impossibile', (d) => d.solo_impossibile],
  ['Installazioni', (d) => d.installazioni],
];
const shortDay = (k) => { const [, m, d] = k.split('-'); return `${+d}/${+m}`; };

export default function Statistiche() {
  const [live, setLive] = useState(null);
  const [days, setDays] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    document.title = 'Statistiche · Nomi Cose Città';
    const offLive = onValue(ref(db, 'live'), (s) => setLive(s.val() || {}), () => setLive({}));
    const offDays = onValue(query(ref(db, 'stats/days'), orderByKey(), limitToLast(7)), (s) => setDays(s.val() || {}), () => setDays({}));
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => { offLive(); offDays(); clearInterval(iv); meta.remove(); };
  }, []);

  const fresh = Object.values(live || {}).filter((p) => typeof p.at === 'number' && now - p.at < LIVE_MAX_AGE_MS);
  const count = (w) => fresh.filter((p) => p.where === w).length;
  const keys = Object.keys(days || {}).sort().reverse();
  const today = dayKey(now);
  const cell = (v) => (v ? v : <span style={sx('color: #A39DC4')}>0</span>);

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; overflow-y: auto; padding: 24px 20px 30px; box-sizing: border-box; display: flex; flex-direction: column; gap: 22px')}>
      <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 34px; line-height: 1.05")}>Statistiche</h1>
      <section style={sx('display: flex; flex-direction: column; gap: 10px')}>
        <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Adesso</h2>
        <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
          {[['Collegati', fresh.length, '#FFD23F'], ['In home', count('home'), '#FFFFFF'], ['In una stanza', count('stanza'), '#B79CFF'], ['Da soli', count('solo'), '#6EE7A8']].map(([label, v, bg]) => (
            <div key={label} style={sx(`padding: 12px 14px; border-radius: 20px; border: 2.5px solid #17122B; background: ${bg}; box-shadow: 0 4px 0 #17122B; display: flex; flex-direction: column; gap: 2px`)}>
              <span style={sx('font-size: 14px; font-weight: 800')}>{label}</span>
              <span aria-live="polite" style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 40px; line-height: 1")}>{live === null ? '…' : v}</span>
            </div>
          ))}
        </div>
        <p style={sx('margin: 0; font-size: 13px; line-height: 1.4; color: #5E5880')}>Chi gioca da solo senza rete non risulta: si conta solo chi è collegato.</p>
      </section>
      <section style={sx('display: flex; flex-direction: column; gap: 10px')}>
        <h2 style={sx('margin: 0; font-size: 17px; font-weight: 800')}>Ultimi 7 giorni</h2>
        {days === null ? <p style={sx('margin: 0; color: #5E5880')}>Carico…</p> : keys.length === 0 ? <p style={sx('margin: 0; color: #5E5880')}>Ancora nessuna partita registrata.</p> : (
          <div style={sx('overflow-x: auto; border-radius: 20px; border: 2.5px solid #17122B; background: #FFFFFF')}>
            <table style={sx('width: 100%; border-collapse: collapse; font-size: 14px')}>
              <thead>
                <tr>
                  <th scope="col" style={sx('text-align: left; padding: 10px 12px; border-bottom: 2px solid #E6E0F7')}>&nbsp;</th>
                  {keys.map((k) => <th key={k} scope="col" style={sx(`padding: 10px 8px; border-bottom: 2px solid #E6E0F7; font-weight: 800; white-space: nowrap; ${k === today ? 'background: #FFD23F' : ''}`)}>{k === today ? 'Oggi' : shortDay(k)}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, get]) => (
                  <tr key={label}>
                    <th scope="row" style={sx('text-align: left; padding: 8px 12px; border-bottom: 2px solid #F6F3FF; font-weight: 700; white-space: nowrap')}>{label}</th>
                    {keys.map((k) => <td key={k} style={sx("padding: 8px; border-bottom: 2px solid #F6F3FF; text-align: center; font-family: 'JetBrains Mono', monospace; font-weight: 700")}>{cell(get(days[k] || {}))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p style={sx('margin: 0; font-size: 13px; line-height: 1.4; color: #5E5880')}>Visite, pagine, paesi e dispositivi sono su Vercel, nella&nbsp;scheda Analytics del&nbsp;progetto.</p>
    </div>
  );
}
