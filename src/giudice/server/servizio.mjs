// Il giudice delle parole sul server. Riceve la richiesta dell'host di una stanza in correzione, giudica le parole che il
// dizionario non conosce (Haiku per tutte, Sonnet per le dubbie) e scrive i verdetti nell'archivio condiviso
// (giudizi/{categoria}/{chiave}), che i telefoni leggono. Ogni guasto, tetto o spegnimento vale "si vota come oggi".
//
// Nessuna dipendenza da Vercel: admin = { auth, db } (Firebase Admin SDK) e anthropic (cliente con messages.create) si
// passano da fuori, così si prova con cliente finto e emulatori. Nessun segreto e nessun testo dei giocatori nei log.
import { startsWithLetter } from '../../engine/rules.js';
import { CATEGORIE_PROTETTE } from '../protezione.js';
import { chiaveParola } from '../chiave.mjs';
import { PROMPT_VERSIONE, SISTEMA, formattaParole, leggiVerdetti, combinaVerdetti, serveSonnet } from '../prompt.mjs';

export const CONFIG = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  tettoParole: 2000, // parole giudicate al giorno
  tettoCentesimi: 100, // centesimi di dollaro al giorno (stima)
  gruppo: 24, // parole per chiamata al modello
  maxParole: 40, // parole per richiesta
  maxLettere: 40, // lunghezza di una parola
  maxRichiesteRound: 3, // richieste per stanza e per round
  ripetiIncertaOre: 24,
  timeoutMs: 10000, // una chiamata, senza ripetizioni: Haiku e Sonnet di fila restano sotto i 30 secondi della funzione
  prezzi: { haiku: [0.1, 0.5], sonnet: [2, 10] }, // dollari per milione di token (entrata, uscita)
  costoPerParola: { haiku: 0.004, sonnet: 0.03 }, // centesimi, per riservare prima di chiamare
};

const rifiuto = (motivo) => ({ stato: 'rifiutato', motivo });
const giornoRoma = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const testoDi = (risposta) => (risposta?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');

export function creaServizio({ admin, anthropic, dizionario, config = CONFIG, attivo = () => process.env.GIUDICE_ATTIVO === '1', ora = () => Date.now() }) {
  const { auth, db } = admin;

  /** Controlla il corpo della richiesta: solo forme attese. */
  function leggiRichiesta(r) {
    if (!r || typeof r.token !== 'string' || !r.token || r.token.length > 4000) return null;
    if (typeof r.codice !== 'string' || !/^[A-Z0-9]{4}$/.test(r.codice)) return null;
    if (!Array.isArray(r.parole) || r.parole.length < 1 || r.parole.length > config.maxParole) return null;
    const parole = [];
    for (const p of r.parole) {
      if (!p || typeof p.cat !== 'string' || !CATEGORIE_PROTETTE.includes(p.cat) || typeof p.testo !== 'string') return null;
      const testo = p.testo.trim();
      if (!testo || testo.length > config.maxLettere) return null;
      parole.push({ cat: p.cat, testo });
    }
    return { token: r.token, codice: r.codice, parole };
  }

  const costoCentesimi = (modello, tin, tout) => {
    const [pi, po] = config.prezzi[modello] || [0, 0];
    return ((tin * pi + tout * po) / 1e6) * 100;
  };

  async function chiama(modello, items, conto) {
    const risposta = await anthropic.messages.create({
      model: modello === 'haiku' ? config.haiku : config.sonnet,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: SISTEMA,
      messages: [{ role: 'user', content: formattaParole(items) }],
    }, { timeout: config.timeoutMs, maxRetries: 0 });
    const tin = risposta?.usage?.input_tokens || 0;
    const tout = risposta?.usage?.output_tokens || 0;
    conto.token_in += tin; conto.token_out += tout; conto.centesimi += costoCentesimi(modello, tin, tout);
    return leggiVerdetti(testoDi(risposta), items.length);
  }

  async function giudica(richiestaGrezza) {
    const richiesta = leggiRichiesta(richiestaGrezza);
    if (!richiesta) return rifiuto('richiesta');
    if (!attivo()) return { stato: 'spento' };
    if ((await db.ref('giudizi_meta/attivo').get()).val() !== true) return { stato: 'spento' };

    let uid;
    try { uid = (await auth.verifyIdToken(richiesta.token)).uid; } catch (e) { return rifiuto('token'); }

    const stanza = (await db.ref(`rooms/${richiesta.codice}`).get()).val();
    if (!stanza || stanza.status !== 'review' || stanza.hostId !== uid) return rifiuto('stanza');
    const lettera = stanza.round?.letter;
    // Il limite vale per ogni partita: startsAt cambia a ogni round e a ogni rivincita della stessa stanza.
    const idRound = stanza.round?.startsAt || stanza.round?.n || 0;

    // Solo parole che sono davvero risposte di giocatori (non robot) di questa stanza, con la lettera giusta e
    // sconosciute al dizionario, senza doppioni.
    const risposte = new Set();
    for (const [pid, per] of Object.entries(stanza.answers || {})) {
      if (stanza.players?.[pid]?.bot) continue;
      for (const [cat, t] of Object.entries(per || {})) if (typeof t === 'string' && t.trim()) risposte.add(`${cat}\u0000${t.trim()}`);
    }
    const visti = new Set();
    const candidate = [];
    for (const { cat, testo } of richiesta.parole) {
      const chiave = chiaveParola(testo);
      if (!chiave || visti.has(`${cat}/${chiave}`)) continue;
      if (!risposte.has(`${cat}\u0000${testo}`) || !startsWithLetter(testo, lettera) || dizionario.ha(cat, testo, lettera)) continue;
      visti.add(`${cat}/${chiave}`);
      candidate.push({ cat, lettera, testo, chiave });
    }

    // Archivio: salta le voci valide o non valide della versione corrente e le "incerta" recenti.
    const adesso = ora();
    const voci = await Promise.all(candidate.map((c) => db.ref(`giudizi/${c.cat}/${c.chiave}`).get().then((s) => s.val())));
    const fresca = (e) => e && (e.m === 'mano' || (e.p === PROMPT_VERSIONE && (e.v === 'valida' || e.v === 'non_valida' || (e.v === 'incerta' && adesso - (e.at || 0) < config.ripetiIncertaOre * 3600 * 1000))));
    const daGiudicare = candidate.filter((c, i) => !fresca(voci[i]));
    const inArchivio = candidate.length - daGiudicare.length;
    if (!daGiudicare.length) return { stato: 'ok', verdetti: {} };

    // Al massimo tre richieste per stanza e per round.
    const lim = await db.ref(`giudizi_meta/limiti/${richiesta.codice}/${idRound}`).transaction((n) => ((n || 0) >= config.maxRichiesteRound ? undefined : (n || 0) + 1));
    if (!lim.committed) return { stato: 'limite' };

    // Tetto del giorno: si riservano le parole prima di chiamare il modello.
    const giorno = giornoRoma(adesso);
    const refGiorno = db.ref(`giudizi_meta/giorni/${giorno}`);
    let concesse = 0;
    let prenotato = 0; // centesimi riservati per questa richiesta, restituiti a fine lavoro
    const arrotonda = (x) => Math.round(x * 10000) / 10000;
    await refGiorno.transaction((cur) => {
      const c = cur || {};
      const resto = Math.max(0, config.tettoParole - (c.parole || 0));
      concesse = (c.centesimi || 0) + (c.prenotati || 0) >= config.tettoCentesimi ? 0 : Math.min(daGiudicare.length, resto);
      prenotato = concesse * config.costoPerParola.haiku;
      return { ...c, parole: (c.parole || 0) + concesse, prenotati: arrotonda((c.prenotati || 0) + prenotato) };
    });
    if (concesse === 0) return { stato: 'limite' };
    const lavoro = daGiudicare.slice(0, concesse);

    const conto = { token_in: 0, token_out: 0, centesimi: 0, valide: 0, non_valide: 0, incerte: 0 };
    const verdetti = {};
    // Sonnet si prenota prima di chiamare: due gruppi in parallelo non vedono lo stesso residuo.
    const budgetSonnet = async (k) => {
      const costo = k * config.costoPerParola.sonnet;
      let ok = false;
      await refGiorno.transaction((cur) => {
        const c = cur || {};
        ok = (c.centesimi || 0) + (c.prenotati || 0) + costo <= config.tettoCentesimi;
        return ok ? { ...c, prenotati: arrotonda((c.prenotati || 0) + costo) } : undefined;
      });
      if (ok) prenotato += costo;
      return ok;
    };

    // Gruppi da 24 per categoria, in parallelo; ogni gruppo scrive i suoi verdetti appena è pronto.
    const gruppi = [];
    for (const cat of CATEGORIE_PROTETTE) {
      const della = lavoro.filter((c) => c.cat === cat);
      for (let i = 0; i < della.length; i += config.gruppo) gruppi.push(della.slice(i, i + config.gruppo));
    }
    await Promise.all(gruppi.map(async (items) => {
      let haiku;
      try { haiku = await chiama('haiku', items, conto); } catch (e) { return; }
      const sonnet = items.map(() => null);
      const dubbie = items.map((_, i) => i).filter((i) => serveSonnet(haiku[i]));
      if (dubbie.length && await budgetSonnet(dubbie.length)) {
        // Una parola per chiamata: il testo di un giocatore non arriva mai accanto a quello di un altro.
        await Promise.all(dubbie.map(async (i) => {
          try { sonnet[i] = (await chiama('sonnet', [items[i]], conto))[0]; } catch (e) { /* Sonnet non risponde: resta "incerta" */ }
        }));
      }
      await Promise.all(items.map(async (it, i) => {
        const { v, m } = combinaVerdetti(haiku[i], sonnet[i]);
        const voce = { v, at: adesso, p: PROMPT_VERSIONE };
        if (m) voce.m = m;
        // Un verdetto messo a mano (scripts/giudizio.mjs) non si sovrascrive, nemmeno se la richiesta era già partita.
        await db.ref(`giudizi/${it.cat}/${it.chiave}`).transaction((cur) => (cur && cur.m === 'mano' ? undefined : voce));
        verdetti[`${it.cat}/${it.chiave}`] = { v, m };
        conto[v === 'valida' ? 'valide' : v === 'non_valida' ? 'non_valide' : 'incerte'] += 1;
      }));
    }));

    await refGiorno.transaction((cur) => {
      const c = cur || {};
      const somma = (k, x) => ({ [k]: Math.round(((c[k] || 0) + x) * 10000) / 10000 });
      return { ...c, ...somma('richieste', 1), ...somma('in_archivio', inArchivio), ...somma('valide', conto.valide), ...somma('non_valide', conto.non_valide),
        ...somma('incerte', conto.incerte), ...somma('token_in', conto.token_in), ...somma('token_out', conto.token_out), ...somma('centesimi', conto.centesimi), prenotati: Math.max(0, arrotonda((c.prenotati || 0) - prenotato)) };
    });
    return { stato: 'ok', verdetti };
  }

  return { giudica };
}
