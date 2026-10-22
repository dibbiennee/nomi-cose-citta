import React, { useEffect, useRef, useState } from 'react';
import { sx, INK, Face, hostButtonStyle, BotTag, useCompact } from '../ui/kit';
import { scoreCategory } from '../engine/rules';
import { dizionarioCorrente, tentativiSuParoleVere, caricaDizionario } from '../giudice/protezione';
import { applicaGiudizio, statoRisposta } from '../giudice/decisione';
import { chiaveParola } from '../giudice/chiave.mjs';

const TAGS = { empty: 'vuota', wrongLetter: 'lettera sbagliata', rejected: 'bocciata dalla stanza', solo: 'unico a rispondere', duplicate: 'doppia', unique: 'unica' };
const PTS_BG = { 20: '#FFD23F', 10: '#6EE7A8', 5: '#5CD0FF', 0: '#E6E0F7' };
const REACTIONS = ['Ahah', 'Geniale', 'Ma dai!', 'Rubata', 'Non esiste'];

/** Bolle delle reazioni: compaiono a tutti appena arrivano, salgono e spariscono. */
function useReactions(room, now) {
  const seen = useRef(new Set());
  const [list, setList] = useState([]);
  useEffect(() => {
    // Una casella per giocatore (reactions/{uid}): ogni nuova reazione ha un'ora diversa, quindi la chiave è uid + ora.
    const fresh = Object.entries(room.reactions || {})
      .map(([uid, r]) => ({ ...r, uid, id: `${uid}:${r.at}` }))
      .filter((r) => !seen.current.has(r.id) && typeof r.at === 'number' && now - r.at < 2500);
    if (!fresh.length) return;
    fresh.forEach((r) => seen.current.add(r.id));
    setList((l) => l.concat(fresh.map((r) => ({ ...r, left: `${16 + (seen.current.size * 67) % 190}px` }))));
    fresh.forEach((r) => setTimeout(() => setList((l) => l.filter((x) => x.id !== r.id)), 1900));
  }, [room.reactions, now]);
  return list;
}

export default function Review({ g }) {
  const { room, round, uid, isHost } = g;
  const cats = room.settings.cats;
  const idx = Math.min(round.reviewIdx || 0, cats.length - 1);
  const cat = cats[idx];
  const ids = g.scoring.map((p) => p.id);
  const catAnswers = {};
  for (const id of ids) catAnswers[id] = (room.answers?.[id] || {})[cat.key] || '';
  // Dizionario e giudice: le parole che esistono non si bocciano votando, quelle che non esistono sono bocciate. Stessa
  // funzione che usa il punteggio (room.js); senza dizionario o verdetti si vota come sempre.
  const votiGrezzi = room.votes?.[cat.key] || {};
  const votes = room.solo ? votiGrezzi : (applicaGiudizio({ [cat.key]: votiGrezzi }, room.answers, round.letter, g.archivio, ids, dizionarioCorrente())[cat.key] || {});
  const res = scoreCategory(ids, catAnswers, votes, round.letter);
  const bubbles = useReactions(room, g.now);
  // La lista resta la stessa tra una categoria e l'altra: a ogni "avanti" si riparte dalla prima parola in alto.
  const c = useCompact(); // schermo basso: righe e margini più stretti
  const lista = useRef(null);
  useEffect(() => { lista.current?.scrollTo({ top: 0 }); }, [idx]);
  const voters = Math.max(1, ids.length - 1);
  const need = Math.floor(voters / 2) + 1; // bocciata se vota contro più di metà degli altri (isRejected)

  const next = () => {
    if (!isHost) { g.toast(`Va avanti ${g.hostName}`); return; }
    // L'host riprova a caricare il dizionario proprio ora (se all'ingresso non era arrivato): i punti si calcolano qui.
    g.act(async () => { await caricaDizionario(); await g.attendiGiudice?.(); return g.engine.nextCategory(g.code); });
  };

  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; display: flex; flex-direction: column')}>
      <header style={sx(`padding: ${c ? '8px 20px 10px' : '12px 20px 14px'}; background: ${cat.color}; border-bottom: 2.5px solid #17122B; border-radius: 0 0 26px 26px; display: flex; flex-direction: column; gap: 8px; transition: background .35s`)}>
        <div style={sx('display: flex; align-items: center; justify-content: space-between')}>
          <span style={sx('font-size: 12px; font-weight: 800; letter-spacing: 0.12em; white-space: nowrap')}>CORREZIONE · {idx + 1} DI {cats.length}</span>
          <span style={sx('display: flex; gap: 6px')} aria-hidden="true">
            {cats.map((c, i) => <span key={c.key} style={sx(`width: ${i === idx ? '22px' : '9px'}; height: 9px; box-sizing: border-box; border-radius: 999px; border: 2px solid #17122B; background: ${i <= idx ? INK : '#FFFFFF'}; transition: width .35s cubic-bezier(.2,.8,.2,1)`)} />)}
          </span>
        </div>
        <div style={sx('display: flex; align-items: center; gap: 12px')}>
          <span aria-hidden="true" style={sx("width: 44px; height: 48px; flex-shrink: 0; box-sizing: border-box; border-radius: 12px; border: 2.5px solid #17122B; background: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; box-shadow: 0 3px 0 #17122B")}>{round.letter}</span>
          <span style={sx('min-width: 0; display: flex; flex-direction: column; gap: 2px')}>
            <h1 style={sx("margin: 0; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 28px; line-height: 1.05; overflow-wrap: anywhere")}>{cat.label}</h1>
            {!room.solo && <span style={sx('font-size: 12px; font-weight: 700; line-height: 1.3')}>{need === 1 ? 'Basta 1 «non vale» per bocciare una parola' : `Servono ${need} «non vale» per bocciare una parola`}</span>}
          </span>
        </div>
      </header>
      <div ref={lista} className="n-scroll" style={sx(`flex-grow: 1; overflow-y: auto; padding: ${c ? '8px 16px 8px' : '10px 16px 10px'}; display: flex; flex-direction: column; gap: ${c ? 6 : 8}px`)}>
        {g.scoring.map((p, i) => {
          const r = res[p.id], isMe = p.id === uid;
          const rejected = r.status === 'rejected';
          const valid = ['solo', 'duplicate', 'unique'].includes(r.status);
          // Le parole che esistono (dizionario o giudice) non si bocciano votando; quelle che il giudice ha dichiarato
          // inesistenti sono bocciate. La persona non vede da dove viene l'informazione: la riga è uguale alle altre.
          const stato = room.solo ? 'voto' : statoRisposta({ cat: cat.key, testo: r.text, lettera: round.letter, voce: g.archivio?.[cat.key]?.[chiaveParola(r.text)], dizionario: dizionarioCorrente() });
          const esiste = valid && (room.solo ? !!room.solo.known?.[cat.key]?.[p.id] : stato === 'dizionario' || stato === 'verificata');
          const nonEsiste = !room.solo && stato === 'non_esiste';
          const canVote = !isMe && !esiste && !nonEsiste && r.status !== 'empty' && r.status !== 'wrongLetter';
          const myVote = !!votes[p.id]?.[uid];
          const tag = (r.status === 'rejected' && room.solo ? 'bocciata dai robot' : nonEsiste ? 'non esiste' : TAGS[r.status]) + (valid && r.votesAgainst && !room.solo ? ` · ${r.votesAgainst} su ${need} per bocciarla` : '');
          const tastoStile = (acceso) => sx(`height: 44px; min-width: 78px; padding: 0 10px; flex-shrink: 0; border-radius: 12px; border: 2px solid #17122B; background: ${acceso ? '#FF5E3A' : '#FFFFFF'}; color: ${acceso ? '#FFFFFF' : INK}; font-size: 13px; font-weight: 800; cursor: pointer; transition: background .2s`);
          return (
            <div key={`${cat.key}-${p.id}`} className={rejected || nonEsiste ? 'n-no' : idx % 2 ? 'n-up2' : 'n-up'}
              style={sx(`display: flex; align-items: center; gap: 10px; padding: ${c ? '6px 8px' : '8px 10px'}; min-height: ${c ? 54 : 60}px; box-sizing: border-box; border-radius: 16px; border: 2.5px solid #17122B; background: ${rejected || nonEsiste ? '#FFE3DB' : '#FFFFFF'}; animation-delay: ${rejected ? 0 : Math.min(i, 6) * 50}ms; transition: background .25s`)}>
              <Face p={p} size={c ? 32 : 36} style={{ flexShrink: 0 }} mood={rejected || nonEsiste ? 'disperato' : r.points > 0 ? 'ride' : 'normale'} className={(rejected || nonEsiste) && p.char ? 'n-droop' : undefined} />
              <span style={sx('flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 0')}>
                <span style={sx('font-size: 12px; font-weight: 700; color: #5E5880; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')}>{isMe ? 'Tu' : p.name}{p.bot && <BotTag />} · {tag}</span>
                <span style={sx(`font-family: 'Bricolage Grotesque Variable', sans-serif; font-size: 19px; line-height: 1.1; font-weight: 800; text-decoration: ${rejected || nonEsiste || r.status === 'wrongLetter' ? 'line-through' : 'none'}; opacity: ${valid ? '1' : '0.45'}; overflow-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden`)}>{r.text || '—'}</span>
              </span>
              <span key={r.points} className="n-pop" style={sx(`min-width: 40px; height: 32px; padding: 0 6px; box-sizing: border-box; border-radius: 10px; border: 2.5px solid #17122B; background: ${PTS_BG[r.points]}; font-family: 'Bricolage Grotesque Variable', sans-serif; font-weight: 800; font-size: 17px; display: flex; align-items: center; justify-content: center; transform: rotate(3deg); flex-shrink: 0`)}>{r.points > 0 ? `+${r.points}` : '0'}</span>
              {canVote && (
                <button className="n-press" aria-pressed={myVote} aria-label={`${myVote ? 'Annulla il voto su' : 'Non vale:'} ${r.text} di ${p.name}`} onClick={() => g.act(() => g.engine.vote(g.code, cat.key, p.id, !myVote))}
                  style={tastoStile(myVote)}>{myVote ? 'Annulla' : 'Non vale'}</button>
              )}
              {!isMe && esiste && (
                <button className="n-press" aria-label={`Non vale: ${r.text} di ${p.name}`}
                  onClick={() => {
                    // La parola esiste: il voto non conta. Si spiega una volta, e chi lo prova su più parole che esistono riceve un avviso solo suo.
                    const t = tentativiSuParoleVere.registra(g.code, `${cat.key}:${p.id}`);
                    g.toast(t.avviso ? `Hai provato a bocciare ${t.n} parole che esistono: non serve votare.` : `«${r.text}» esiste: vale per tutti, il voto non conta.`);
                  }}
                  style={tastoStile(false)}>Non vale</button>
              )}
            </div>
          );
        })}
      </div>
      <div style={sx('position: absolute; left: 0; right: 0; bottom: 140px; height: 0; pointer-events: none')} aria-hidden="true">
        {bubbles.map((x) => {
          const p = room.players?.[x.uid];
          return (
            <span key={x.id} className="n-react" style={sx(`position: absolute; bottom: 0; left: ${x.left}; height: 40px; padding: 0 14px 0 5px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; white-space: nowrap; box-shadow: 0 4px 0 #17122B`)}>
              <Face p={p} size={28} small />{x.text}
            </span>
          );
        })}
      </div>
      <div style={sx(`padding: ${c ? '6px 16px 10px' : '8px 16px 14px'}; border-top: 2px solid #E6E0F7; display: flex; flex-direction: column; gap: ${c ? 6 : 8}px`)}>
        <div className="n-scroll" style={sx('display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px; padding: 0 16px')} aria-label="Reazioni">
          {REACTIONS.map((t) => <button key={t} className="n-press" onClick={() => g.act(() => g.engine.react(g.code, t))} style={sx('height: 44px; padding: 0 16px; flex-shrink: 0; border-radius: 999px; border: 2px solid #17122B; background: #FFFFFF; color: #17122B; font-size: 14px; font-weight: 800; cursor: pointer')}>{t}</button>)}
        </div>
        <button className="n-btn" onClick={next} style={{ ...hostButtonStyle(isHost), height: c ? 50 : 54, fontSize: 18 }}>
          {!isHost ? `Va avanti ${g.hostName}…` : idx < cats.length - 1 ? 'Prossima categoria' : 'Vedi i punteggi'}
        </button>
      </div>
    </div>
  );
}
