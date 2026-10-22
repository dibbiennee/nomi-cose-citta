import React, { useEffect, useState } from 'react';
import { ref, onValue, query, orderByKey, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { sx } from '../ui/kit';
import { dayKey } from '../stats';

// Pagina /statistiche: chi c'è adesso, chi arriva e chi torna, il percorso fino alla partita, online, da soli,
// ore del giorno. Solo conteggi anonimi (src/stats.js), dal vivo. Le visite per pagina, paese e dispositivo
// sono su Vercel Analytics.
const LIVE_MAX_AGE_MS = 6 * 3600 * 1000; // una presenza più vecchia è un telefono rimasto appeso: non si conta
const BAR = '#5B3FD6'; // una sola serie per grafico: un solo colore, con contrasto sul bianco
const LEVELS = [['facile', 'Facile'], ['medio', 'Medio'], ['difficile', 'Difficile'], ['impossibile', 'Impossibile']];
const prevDay = (k, n = 1) => { const d = new Date(`${k}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const shortDay = (k) => { const [, m, d] = k.split('-'); return `${+d}/${+m}`; };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

const card = sx('border-radius: 22px; border: 2.5px solid #17122B; background: #FFFFFF; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px');
const h2 = sx('margin: 0; font-size: 17px; font-weight: 800');
const note = sx('margin: 0; font-size: 13px; line-height: 1.4; color: #5E5880');
const num = sx("font-family: 'JetBrains Mono', monospace; font-weight: 700");

function Tile({ label, value, bg = '#FFFFFF', sub }) {
  return (
    <div style={sx(`padding: 12px 14px; border-radius: 20px; border: 2.5px solid #17122B; background: ${bg}; box-shadow: 0 4px 0 #17122B; display: flex; flex-direction: column; gap: 2px; min-width: 0`)}>
      <span style={sx('font-size: 14px; font-weight: 800')}>{label}</span>
      <span aria-live="polite" style={sx("font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 34px; line-height: 1")}>{value}</span>
      {sub && <span style={sx('font-size: 12px; font-weight: 700; color: #5E5880')}>{sub}</span>}
    </div>
  );
}

/** Righe con barra orizzontale: etichetta, barra proporzionale al massimo, numero. */
function Bars({ rows, max }) {
  const top = max || Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div style={sx('display: flex; flex-direction: column; gap: 8px')}>
      {rows.map(([label, v, extra]) => (
        <div key={label} title={`${label}: ${v}`} style={sx('display: grid; grid-template-columns: minmax(0, 9em) 1fr auto; align-items: center; gap: 10px')}>
          <span style={sx('font-size: 14px; font-weight: 700')}>{label}</span>
          <span style={sx('height: 14px; border-radius: 4px; background: #EDE8FB; overflow: hidden')}>
            <span style={sx(`display: block; height: 100%; width: ${Math.round((v / top) * 100)}%; background: ${BAR}; border-radius: 4px`)} />
          </span>
          <span style={num}>{v}{extra ? <span style={sx('color: #5E5880; font-weight: 500')}> {extra}</span> : null}</span>
        </div>
      ))}
    </div>
  );
}

export default function Statistiche() {
  const [live, setLive] = useState(null);
  const [days, setDays] = useState(null);
  const [giudice, setGiudice] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [span, setSpan] = useState('oggi'); // oggi | 7
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    document.title = 'Statistiche · Nomi Cose Città';
    const offLive = onValue(ref(db, 'live'), (s) => setLive(s.val() || {}), () => setLive({}));
    // 15 giorni: 7 da mostrare più quelli che servono per calcolare chi torna dopo una settimana.
    const offDays = onValue(query(ref(db, 'stats/days'), orderByKey(), limitToLast(15)), (s) => setDays(s.val() || {}), () => setDays({}));
    const offGiudice = onValue(query(ref(db, 'giudizi_meta/giorni'), orderByKey(), limitToLast(31)), (s) => setGiudice(s.val() || {}), () => setGiudice({}));
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => { offLive(); offDays(); offGiudice(); clearInterval(iv); meta.remove(); };
  }, []);

  const fresh = Object.values(live || {}).filter((p) => typeof p.at === 'number' && now - p.at < LIVE_MAX_AGE_MS);
  const count = (w) => fresh.filter((p) => p.where === w).length;
  const today = dayKey(now);
  const week = Array.from({ length: 7 }, (_, i) => prevDay(today, i));
  const keys = span === 'oggi' ? [today] : week;
  const D = days || {};
  const sum = (k, list = keys) => list.reduce((t, d) => t + ((D[d] || {})[k] || 0), 0);
  const sumMany = (ks, list) => ks.reduce((t, k) => t + sum(k, list), 0);
  const soloKeys = LEVELS.map(([l]) => `solo_${l}`);

  // Chi torna: tornati il giorno dopo / nuovi del giorno prima, e lo stesso a 7 giorni.
  const d1 = keys.reduce((t, d) => t + ((D[d] || {}).tornati_d1 || 0), 0);
  const d1base = keys.reduce((t, d) => t + ((D[prevDay(d)] || {}).telefoni_nuovi || 0), 0);
  const d7 = keys.reduce((t, d) => t + ((D[d] || {}).tornati_d7 || 0), 0);
  const d7base = keys.reduce((t, d) => t + ((D[prevDay(d, 7)] || {}).telefoni_nuovi || 0), 0);

  const opens = sum('aperture');
  const funnel = [
    ['Aprono il gioco', opens],
    ['Scelgono come giocare', sum('scelta_online') + sum('scelta_solo')],
    ['Iniziano una partita', sum('giocatori_online') + sumMany(soloKeys)],
    ['La finiscono', sum('giocatori_al_podio') + sum('solo_finite')],
  ];
  const finishedOnline = sum('partite_online_finite');
  const finishedSolo = sum('solo_finite');
  const hours = Array.from({ length: 24 }, (_, h) => [h, sum(`ora_${String(h).padStart(2, '0')}`)]);
  const hourMax = Math.max(1, ...hours.map((x) => x[1]));
  const loading = days === null;
  const G = giudice || {};
  const sumG = (k, list = keys) => list.reduce((t, d) => t + ((G[d] || {})[k] || 0), 0);
  const mese = Object.keys(G).filter((d) => d.slice(0, 7) === today.slice(0, 7));
  const dollari = (c) => `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

  const tabBtn = (id, label) => (
    <button key={id} type="button" role="radio" aria-checked={span === id} className="n-btn" onClick={() => setSpan(id)}
      style={sx(`height: 44px; padding: 0 18px; border-radius: 999px; border: 2.5px solid #17122B; background: ${span === id ? '#FFD23F' : '#FFFFFF'}; color: #17122B; font-size: 15px; font-weight: 800; box-shadow: ${span === id ? '0 1px 0' : '0 4px 0'} #17122B; transform: translateY(${span === id ? '3px' : '0'}); cursor: pointer`)}>{label}</button>
  );

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; overflow-y: auto; padding: 24px 20px 30px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px')}>
      <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 34px; line-height: 1.05")}>Statistiche</h1>

      <section style={sx('display: flex; flex-direction: column; gap: 10px')}>
        <h2 style={h2}>Adesso</h2>
        <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
          <Tile label="Collegati" value={live === null ? '…' : fresh.length} bg="#FFD23F" />
          <Tile label="In home" value={live === null ? '…' : count('home')} />
          <Tile label="In una stanza" value={live === null ? '…' : count('stanza')} bg="#B79CFF" />
          <Tile label="Da soli" value={live === null ? '…' : count('solo')} bg="#6EE7A8" />
          <Tile label="In coda" value={live === null ? '…' : count('coda')} bg="#5CD0FF" sub="partita veloce" />
        </div>
        <p style={note}>Chi gioca da solo senza rete non risulta: si conta solo chi è collegato.</p>
      </section>

      <div role="radiogroup" aria-label="Periodo" style={sx('display: flex; gap: 10px; position: sticky; top: -24px; padding: 8px 0; background: #F6F3FF; z-index: 2')}>
        {tabBtn('oggi', 'Oggi')}{tabBtn('7', 'Ultimi 7 giorni')}
      </div>
      {loading ? <p style={note}>Carico…</p> : (
        <>
          <section style={card}>
            <h2 style={h2}>Chi arriva e chi torna</h2>
            <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
              <Tile label="Aperture" value={opens} />
              <Tile label="Telefoni nuovi" value={sum('telefoni_nuovi')} />
              <Tile label="Tornano il giorno dopo" value={pct(d1, d1base)} sub={`${d1} su ${d1base} nuovi`} />
              <Tile label="Tornano dopo 7 giorni" value={pct(d7, d7base)} sub={`${d7} su ${d7base} nuovi`} />
            </div>
            <p style={note}>Telefoni di ritorno: {sum('telefoni_tornati')}. Installazioni sulla Home: {sum('installazioni')}.</p>
            <Bars rows={[['Dal sito', sum('diretta')], ['Da un link', sum('da_link')], ['Dall\'icona', sum('da_icona')]]} />
          </section>

          <section style={card}>
            <h2 style={h2}>Il percorso</h2>
            <p style={note}>Quante aperture arrivano a ogni passaggio. Ogni telefono conta per sé.</p>
            <Bars rows={funnel.map(([l, v], i) => [l, v, i ? pct(v, opens) : ''])} max={Math.max(1, opens)} />
          </section>

          <section style={card}>
            <h2 style={h2}>Online</h2>
            <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
              <Tile label="Stanze create" value={sum('stanze_create')} sub={`mai partite: ${Math.max(0, sum('stanze_create') - sum('stanze_avviate'))}`} />
              <Tile label="Partite" value={sum('partite_online')} sub={`finite ${finishedOnline}, rivincite ${sum('rivincite')}, veloci ${sum('partite_veloci')}`} />
              <Tile label="Durata media" value={finishedOnline ? `${Math.round(sum('minuti_online') / finishedOnline)} min` : '—'} />
              <Tile label="Inviti" value={sum('inviti_whatsapp') + sum('link_copiati')} sub={`WhatsApp ${sum('inviti_whatsapp')}, link ${sum('link_copiati')}`} />
            </div>
            <h3 style={sx('margin: 4px 0 0; font-size: 15px; font-weight: 800')}>Persone per partita</h3>
            <Bars rows={[['2', sum('giocatori_2')], ['3', sum('giocatori_3')], ['4', sum('giocatori_4')], ['5 o più', sum('giocatori_5piu')]]} />
            <h3 style={sx('margin: 4px 0 0; font-size: 15px; font-weight: 800')}>Come entrano e cosa va storto</h3>
            <Bars rows={[
              ['Entrano da link', sum('ingressi_link')], ['Entrano col codice', sum('ingressi_codice')],
              ['Stanza non trovata', sum('errori_non_trovata')], ['Stanza piena', sum('errori_piena')],
              ['Partita già iniziata', sum('errori_iniziata')], ['Senza rete', sum('errori_rete')],
            ]} />
          </section>

          <section style={card}>
            <h2 style={h2}>Da soli</h2>
            <div style={sx('overflow-x: auto')}>
              <table style={sx('width: 100%; border-collapse: collapse; font-size: 14px')}>
                <thead><tr>{['', 'Iniziate', 'Finite', 'Vinte'].map((t) => <th key={t} scope="col" style={sx('text-align: right; padding: 6px 8px; border-bottom: 2px solid #E6E0F7; white-space: nowrap')}>{t}</th>)}</tr></thead>
                <tbody>
                  {LEVELS.map(([l, label]) => (
                    <tr key={l}>
                      <th scope="row" style={sx('text-align: left; padding: 6px 8px; font-weight: 700')}>{label}</th>
                      {[`solo_${l}`, `solo_${l}_finite`, `solo_${l}_vinte`].map((k) => <td key={k} style={{ ...num, textAlign: 'right', padding: '6px 8px' }}>{sum(k)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={note}>Record battuti: {sum('record_battuti')}. Durata media: {finishedSolo ? `${Math.round(sum('minuti_solo') / finishedSolo)} min` : '—'}.</p>
          </section>

          <section style={card}>
            <h2 style={h2}>A che ora si gioca</h2>
            <div role="img" aria-label={`Aperture per ora: ${hours.map(([h, v]) => `${h}: ${v}`).join(', ')}`} style={sx('display: flex; align-items: flex-end; gap: 2px; height: 120px')}>
              {hours.map(([h, v]) => (
                <span key={h} title={`ore ${h}: ${v} aperture`} style={sx(`flex: 1; min-width: 0; height: ${Math.max(2, Math.round((v / hourMax) * 120))}px; background: ${v ? BAR : '#EDE8FB'}; border-radius: 4px 4px 0 0`)} />
              ))}
            </div>
            <div aria-hidden="true" style={sx('display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #5E5880')}><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
          </section>

          <section style={card}>
            <h2 style={h2}>Account e richiesta</h2>
            <p style={note}>Account creati: {sum('account_creati')}. Iscritti alla lista d'attesa: {sum('lista_attesa')}. I prodotti a soldi veri sono solo in vetrina: qui si vede chi ha toccato "Compra".</p>
            <Bars rows={[['500 monete', sum('richiesta_monete_500')], ['1200 monete', sum('richiesta_monete_1200')], ['3500 monete', sum('richiesta_monete_3500')], ['Username corto', sum('richiesta_username_corto')]]} />
          </section>

          <section style={card}>
            <h2 style={h2}>Ritorno</h2>
            <p style={note}>Chi arriva ai giorni di fila, chi perde la serie e quante sfide e scrigni si aprono. Serve a capire se i premi fanno tornare la gente.</p>
            <Bars rows={[['3 giorni di fila', sum('serie_3')], ['7 giorni', sum('serie_7')], ['14 giorni', sum('serie_14')], ['30 giorni', sum('serie_30')], ['50 giorni', sum('serie_50')], ['100 giorni', sum('serie_100')]]} />
            <h3 style={sx('margin: 4px 0 0; font-size: 15px; font-weight: 800')}>Serie perse e scudi</h3>
            <Bars rows={[['Serie ripartite da 1', sum('serie_persa')], ['Scudi usati', sum('scudo_usato')]]} />
            <h3 style={sx('margin: 4px 0 0; font-size: 15px; font-weight: 800')}>Sfide prese e scrigni</h3>
            <Bars rows={[['Sfide facili', sum('sfida_facile')], ['Sfide medie', sum('sfida_media')], ['Sfide difficili', sum('sfida_difficile')], ['Tutte e tre in un giorno', sum('sfide_tutte')], ['Scrigni aperti', sum('scrigni_aperti')], ['Accessori rari trovati', sum('scrigni_rari')]]} />
          </section>

          <section style={card}>
            <h2 style={h2}>Giudice delle parole</h2>
            <div style={sx('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px')}>
              <Tile label="Richieste" value={sumG('richieste')} sub="una per round online" />
              <Tile label="Costo stimato" value={dollari(sumG('centesimi'))} sub={`mese: ${dollari(sumG('centesimi', mese))}`} />
            </div>
            <Bars rows={[['Valide', sumG('valide')], ['Non valide', sumG('non_valide')], ['Incerte', sumG('incerte')], ['Già in archivio', sumG('in_archivio')]]} />
            <p style={note}>Parole giudicate dall'IA: {sumG('valide') + sumG('non_valide') + sumG('incerte')}. Le incerte si votano come sempre.</p>
          </section>

          <section style={card}>
            <h2 style={h2}>Il resto</h2>
            <Bars rows={[['Fondatore', sum('fondatore_attivato')], ['Raffaella', sum('raffaella_scelta')], ['Guida aperta', sum('guida_aperta')], ['Installazioni', sum('installazioni')]]} />
          </section>

          <section style={card}>
            <h2 style={h2}>Giorno per giorno</h2>
            <div style={sx('overflow-x: auto')}>
              <table style={sx('width: 100%; border-collapse: collapse; font-size: 14px')}>
                <thead><tr><th scope="col" style={sx('padding: 6px 8px; border-bottom: 2px solid #E6E0F7')}>&nbsp;</th>{week.map((d) => <th key={d} scope="col" style={sx(`padding: 6px 8px; border-bottom: 2px solid #E6E0F7; white-space: nowrap; ${d === today ? 'background: #FFD23F' : ''}`)}>{d === today ? 'Oggi' : shortDay(d)}</th>)}</tr></thead>
                <tbody>
                  {[['Aperture', ['aperture']], ['Nuovi', ['telefoni_nuovi']], ['Partite online', ['partite_online']], ['Da soli', soloKeys], ['Stanze create', ['stanze_create']]].map(([label, ks]) => (
                    <tr key={label}>
                      <th scope="row" style={sx('text-align: left; padding: 6px 8px; font-weight: 700; white-space: nowrap')}>{label}</th>
                      {week.map((d) => <td key={d} style={{ ...num, textAlign: 'center', padding: '6px 8px' }}>{sumMany(ks, [d])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <p style={note}>Visite, pagine, paesi e dispositivi sono su Vercel, nella&nbsp;scheda Analytics del&nbsp;progetto.</p>
    </div>
  );
}
