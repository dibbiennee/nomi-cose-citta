import React from 'react';
import { sx, Face } from '../ui/kit';
import { ProfilePicker } from './Home';

/** Arrivo dal link /r/CODICE: chi ti aspetta, scegli faccina, colore e nome, entra. */
export default function Invite({ code, room, profile, setProfile, onJoin, busy }) {
  const players = Object.entries(room.players || {}).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const host = room.players?.[room.hostId];
  const names = players.map(([, p]) => p.name);
  const who = names.length === 0 ? '' : names.length === 1 ? `${names[0]} è già dentro`
    : names.length <= 3 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} sono già dentro`
      : `${names.slice(0, 2).join(', ')} e altri ${names.length - 2} sono già dentro`;
  return (
    <div className="n-screen" style={sx('position: absolute; inset: 0; background: #B79CFF; padding: 28px 24px 28px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; overflow-y: auto')}>
      <span style={sx('height: 34px; padding: 0 14px; border-radius: 999px; border: 2.5px solid #17122B; background: #FFFFFF; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; display: flex; align-items: center; white-space: nowrap')}>STANZA {code}</span>
      <h1 className="n-pop" style={sx("margin: 18px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 34px; line-height: 1.05; text-align: center")}>{host ? <><span className="ph">{host.name}</span> ti&nbsp;aspetta!</> : 'Ti aspettano!'}</h1>
      <div style={sx('margin-top: 18px; display: flex; padding-left: 10px')}>
        {players.slice(0, 6).map(([id, p], i) => (
          <span key={id} className="n-bob" style={sx(`display: block; margin-left: -10px; animation-delay: ${i * 200}ms`)}><Face p={p} size={56} /></span>
        ))}
      </div>
      <span style={sx('margin-top: 8px; font-size: 14px; font-weight: 700; text-align: center')}>{who}</span>
      <div className="n-up" style={sx('margin-top: 22px; width: 100%; box-sizing: border-box; padding: 20px; border-radius: 28px; border: 2.5px solid #17122B; background: #FFFFFF; box-shadow: 0 6px 0 #17122B; display: flex; flex-direction: column; align-items: center; gap: 14px; animation-delay: .25s')}>
        <span style={sx('font-size: 15px; font-weight: 800')}>Tu chi sei?</span>
        <ProfilePicker profile={profile} setProfile={setProfile} faceSize={88} inputBg="#F6F3FF" inputH={56} gap={8} withBadge={false} />
      </div>
      <button className="n-btn" onClick={onJoin} disabled={busy} style={sx('margin-top: auto; flex-shrink: 0; width: 100%; height: 62px; border: 2.5px solid #17122B; border-radius: 20px; background: #FFD23F; color: #17122B; font-size: 19px; font-weight: 800; box-shadow: 0 5px 0 #17122B; cursor: pointer')}>Entra nella stanza</button>
    </div>
  );
}
