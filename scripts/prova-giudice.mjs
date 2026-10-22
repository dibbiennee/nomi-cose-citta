// Prova del giudice di parole con Haiku 5.5: quanto ci azzecca sui casi veri del gioco e quanto costa.
// Non tocca il gioco né il database: manda 3 richieste all'API e stampa un riepilogo.
//
// Uso (la chiave resta nel tuo terminale, non va incollata in nessuna chat):
//   export ANTHROPIC_API_KEY=sk-ant-...        # creala su console.anthropic.com, con un limite di spesa basso
//   node scripts/prova-giudice.mjs             # confronta Haiku 5.5 e Sonnet 5.5 sugli stessi casi
//   node scripts/prova-giudice.mjs claude-haiku-5-5   # un modello solo
import Anthropic from '@anthropic-ai/sdk';

const MODELLI = process.argv.slice(2).length ? process.argv.slice(2) : ['claude-haiku-5-5', 'claude-sonnet-5-5'];
const PREZZI = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] }; // $ per milione di token (in, out)

// cat, lettera, parola, atteso: 'ok' valida, 'no' non valida
const CASI = [
  // valide e comuni
  ['nomi', 'A', 'Andrea', 'ok'], ['cose', 'B', 'Bicchiere', 'ok'], ['citta', 'C', 'Catania', 'ok'], ['animali', 'D', 'Delfino', 'ok'],
  ['mestieri', 'F', 'Falegname', 'ok'], ['cibi', 'L', 'Lasagne', 'ok'], ['film', 'T', 'Titanic', 'ok'], ['calciatori', 'M', 'Maradona', 'ok'],
  // valide ma rare o difficili: sono quelle che gli altri giocatori potrebbero bocciare
  ['animali', 'Q', 'Quokka', 'ok'], ['animali', 'U', 'Uistitì', 'ok'], ['animali', 'Z', 'Zibellino', 'ok'], ['nomi', 'G', 'Gaetano', 'ok'],
  ['nomi', 'Y', 'Yuri', 'ok'], ['nomi', 'Z', 'Zoe', 'ok'], ['citta', 'V', 'Vipiteno', 'ok'], ['citta', 'T', 'Tbilisi', 'ok'],
  ['citta', 'N', 'Nuuk', 'ok'], ['cose', 'Z', 'Zaino', 'ok'], ['cose', 'K', 'Kayak', 'ok'], ['mestieri', 'A', 'Arrotino', 'ok'],
  ['mestieri', 'M', 'Maniscalco', 'ok'], ['cibi', 'P', 'Panzerotto', 'ok'], ['cibi', 'S', 'Sfogliatella', 'ok'], ['film', 'S', 'Shining', 'ok'],
  ['film', 'I', 'Inception', 'ok'], ['film', 'A', 'Avatar', 'ok'], ['calciatori', 'R', 'Ronaldinho', 'ok'], ['calciatori', 'B', 'Baggio', 'ok'],
  ['calciatori', 'T', 'Totti', 'ok'], ['animali', 'N', 'Narvalo', 'ok'], ['citta', 'R', 'Reykjavik', 'ok'], ['cibi', 'T', 'Tiramisù', 'ok'],
  // sbagliate: lettera diversa
  ['animali', 'C', 'Elefante', 'no'], ['citta', 'M', 'Torino', 'no'], ['nomi', 'A', 'Marco', 'no'], ['cibi', 'P', 'Lasagne', 'no'],
  // sbagliate: categoria diversa
  ['animali', 'L', 'Lampada', 'no'], ['citta', 'A', 'Arancia', 'no'], ['mestieri', 'P', 'Pizza', 'no'], ['cibi', 'M', 'Medico', 'no'],
  ['film', 'B', 'Banana', 'no'], ['nomi', 'C', 'Computer', 'no'],
  // inventate o senza senso
  ['animali', 'B', 'Blorfo', 'no'], ['cose', 'P', 'Pizzigolo', 'no'], ['nomi', 'Q', 'Qwertz', 'no'], ['citta', 'Z', 'Zzzzzz', 'no'],
  ['mestieri', 'S', 'Sgrumbolaro', 'no'], ['cibi', 'G', 'Gnorfetti', 'no'], ['film', 'K', 'Kjhgfd', 'no'], ['calciatori', 'X', 'Xyzabc', 'no'],
  // categorie aperte: inventate che sembrano vere
  ['calciatori', 'P', 'Paolo Rossolini Mastrangelo', 'no'], ['film', 'L', 'Il lago delle mucche volanti', 'no'],
];

const CATEGORIE = {
  nomi: 'nome proprio di persona', cose: 'cosa, oggetto concreto', citta: 'città, anche estera', animali: 'animale',
  mestieri: 'mestiere o professione', cibi: 'cibo o piatto', film: 'titolo di un film', calciatori: 'calciatore (nome o cognome)',
};

const SISTEMA = `Fai il giudice nel gioco "Nomi, Cose, Città". Per ogni risposta decidi se è valida.
Una risposta è valida solo se: (1) inizia con la lettera data, ignorando maiuscole e accenti; (2) appartiene davvero alla categoria; (3) è una parola, un nome o un titolo reale, non inventato.
Sii equo, non severo: accetta parole rare, nomi stranieri, nomi di battesimo e cognomi veri, varianti italiane comuni. Non accettare parole inventate, né risposte della categoria sbagliata.
Rispondi con "valida", "non_valida", oppure "incerta" quando non sei sicuro che esista.
Rispondi SOLO con un array JSON, senza altro testo: [{"id":0,"verdetto":"valida"}, ...]`;

const client = new Anthropic();
const gruppi = [CASI.slice(0, 20), CASI.slice(20, 40), CASI.slice(40)];

async function giudica(model) {
  let tokIn = 0, tokOut = 0;
  const esiti = [];
  const t0 = Date.now();
  for (const gruppo of gruppi) {
    const righe = gruppo.map(([cat, lettera, parola], i) => `${i}. categoria: ${CATEGORIE[cat]} | lettera: ${lettera} | risposta: ${parola}`).join('\n');
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: SISTEMA,
      messages: [{ role: 'user', content: righe }],
    });
    tokIn += res.usage.input_tokens;
    tokOut += res.usage.output_tokens;
    const testo = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let verdetti = [];
    try { verdetti = JSON.parse(testo.slice(testo.indexOf('['), testo.lastIndexOf(']') + 1)); } catch (e) { console.error(`${model}: risposta non leggibile:`, testo.slice(0, 200)); }
    gruppo.forEach(([cat, lettera, parola, atteso], i) => {
      esiti.push({ cat, lettera, parola, atteso, v: verdetti.find((x) => x.id === i)?.verdetto || 'nessuno' });
    });
  }
  const [pi, po] = PREZZI[model] || [0, 0];
  return { model, esiti, tokIn, tokOut, secondi: (Date.now() - t0) / 1000, costo: (tokIn * pi + tokOut * po) / 1e6 };
}

const giusto = (e) => (e.atteso === 'ok' ? e.v === 'valida' : e.v === 'non_valida');
const pct = (n, tot) => `${n}/${tot} (${Math.round((100 * n) / tot)}%)`;
const risultati = [];
for (const m of MODELLI) {
  try { risultati.push(await giudica(m)); } catch (e) { console.error(`${m}: errore ${e.status || ''} ${e.message}`); }
}

for (const r of risultati) {
  const validi = r.esiti.filter((e) => e.atteso === 'ok');
  const invalidi = r.esiti.filter((e) => e.atteso === 'no');
  console.log(`\n=== ${r.model}: ${r.esiti.length} casi in ${gruppi.length} chiamate, ${r.secondi.toFixed(1)} s ===`);
  console.log(`Parole vere accettate:  ${pct(validi.filter(giusto).length, validi.length)}   (le vere bocciate sono il danno peggiore)`);
  console.log(`Parole false respinte:  ${pct(invalidi.filter(giusto).length, invalidi.length)}`);
  console.log(`Detti "incerta":        ${r.esiti.filter((e) => e.v === 'incerta').length}`);
  for (const e of r.esiti.filter((x) => !giusto(x))) console.log(`  ${e.atteso === 'ok' ? 'VERA  non accettata' : 'FALSA non respinta'}: ${e.cat} ${e.lettera} "${e.parola}" -> ${e.v}`);
  console.log(`Token: ${r.tokIn} in, ${r.tokOut} out. Costo: circa ${(r.costo * 100).toFixed(3)} centesimi di dollaro; per una partita di 3 round circa ${((r.costo / gruppi.length) * 3 * 100).toFixed(3)} centesimi.`);
}

if (risultati.length === 2) {
  const [a, b] = risultati;
  console.log(`\n=== Dove ${a.model} e ${b.model} non sono d'accordo ===`);
  let diversi = 0;
  a.esiti.forEach((e, i) => {
    const f = b.esiti[i];
    if (e.v !== f.v) { diversi++; console.log(`  ${e.cat} ${e.lettera} "${e.parola}" (atteso ${e.atteso === 'ok' ? 'valida' : 'non valida'}): ${a.model.replace('claude-', '')} ${e.v}, ${b.model.replace('claude-', '')} ${f.v}`); }
  });
  if (!diversi) console.log('  nessuna: rispondono uguale su tutti i casi');
  const rapporto = b.costo / (a.costo || 1);
  console.log(`\nCosto: ${b.model} costa circa ${rapporto.toFixed(0)} volte ${a.model}.`);
}
