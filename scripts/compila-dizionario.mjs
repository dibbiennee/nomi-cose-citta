// Compila il dizionario che protegge le parole (src/giudice/liste/*.js) dalle fonti in scripts/dizionario-fonti/.
// Uso: node scripts/compila-dizionario.mjs   (poi npm run test:rules)
//
// Per ogni categoria: unione di
//   - le liste dei robot (src/solo/parole/*.js)
//   - le liste compilate e controllate in scripts/dizionario-fonti/<categoria>.json
//   - i comuni italiani dell'ISTAT (comuni-istat.json) e le città estere (citta_estere.json) per "citta"
// meno le voci che il revisore indipendente ha bocciato (<categoria>.togli.json, vedi docs/dizionario-fonti.md).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LISTE as ROBOT } from '../src/solo/parole/index.js';
import { normalize } from '../src/engine/rules.js';

const FONTI = new URL('./dizionario-fonti/', import.meta.url);
const leggi = (nome) => (existsSync(new URL(nome, FONTI)) ? JSON.parse(readFileSync(new URL(nome, FONTI), 'utf8')) : []);
const robot = (cat) => Object.values(ROBOT[cat] || {}).flat().map(([parola]) => parola);

const FONTI_PER_CATEGORIA = {
  nomi: () => [...robot('nomi'), ...leggi('nomi.json')],
  cose: () => robot('cose'),
  citta: () => [...robot('citta'), ...leggi('comuni-istat.json'), ...leggi('citta_estere.json')],
  animali: () => [...robot('animali'), ...leggi('animali.json')],
  cibi: () => [...robot('cibi'), ...leggi('cibi.json')],
  mestieri: () => [...robot('mestieri'), ...leggi('mestieri.json')],
  film: () => robot('film'),
  calciatori: () => robot('calciatori'),
};

const pulisci = (voce) => String(voce).replace(/\s+/g, ' ').trim();
let totale = 0;
for (const [cat, fonte] of Object.entries(FONTI_PER_CATEGORIA)) {
  const tolte = new Set([...leggi(`${cat}.togli.json`), ...(cat === 'citta' ? leggi('citta_estere.togli.json') : [])].map((v) => normalize(pulisci(v))));
  const viste = new Map();
  for (const grezza of fonte()) {
    const voce = pulisci(grezza);
    const n = normalize(voce);
    if (voce.length < 2 || !/^\p{L}/u.test(voce) || tolte.has(n) || viste.has(n)) continue;
    viste.set(n, voce);
  }
  const lista = [...viste.values()].sort((a, b) => a.localeCompare(b, 'it'));
  writeFileSync(new URL(`../src/giudice/liste/${cat}.js`, import.meta.url), `// Generato da scripts/compila-dizionario.mjs: non modificare a mano.\nconst lista = ${JSON.stringify(lista)};\nexport default lista;\n`);
  totale += lista.length;
  console.log(`${cat}: ${lista.length} voci (${tolte.size} tolte dai controlli)`);
}
const categorie = Object.keys(FONTI_PER_CATEGORIA);
writeFileSync(new URL('../src/giudice/liste/index.js', import.meta.url), `// Le parole che il dizionario riconosce, per categoria. Generato da scripts/compila-dizionario.mjs.\n${categorie.map((c) => `import ${c} from './${c}.js';`).join('\n')}\n\nexport const LISTE = { ${categorie.join(', ')} };\n`);
console.log(`Totale: ${totale} voci`);
