// Scrive in database.rules.json la regola dei prezzi del negozio, ricavata da src/shop/catalogo.js.
// Un accessorio si possiede solo se nello stesso salvataggio le monete scendono esattamente del suo prezzo,
// oppure se è un esclusivo e l'account è tra i primi 100.
import { readFileSync, writeFileSync } from 'node:fs';
import { ITEMS } from '../src/shop/catalogo.js';

const FILE = new URL('../database.rules.json', import.meta.url);
const rules = JSON.parse(readFileSync(FILE, 'utf8'));
const coinsNow = "newData.parent().parent().child('coins').val()";
const coinsBefore = "data.parent().parent().child('coins').val()";
const paid = ITEMS.filter((i) => !i.esclusivo).map((i) => `($item === '${i.id}' && ${coinsNow} === ${coinsBefore} - ${i.prezzo})`);
const free = ITEMS.filter((i) => i.esclusivo).map((i) => `$item === '${i.id}'`);
// Già posseduto: resta (il profilo si riscrive intero nelle transazioni). Nuovo: pagato, o esclusivo dei primi 100.
const rule = `newData.val() === true && (data.exists() || ${paid.join(' || ')} || ((${free.join(' || ')}) && newData.parent().parent().child('primi100').val() === true))`;

rules.rules.users = rules.rules.users || { $uid: {} };
const user = rules.rules.users.$uid;
user.owned = user.owned || {};
user.owned.$item = { '.validate': rule };
// Accessori indossati dentro le stanze: per ogni tipo solo gli id di quel tipo.
const players = rules.rules.rooms.$code.players.$uid;
players.acc = { $tipo: { '.validate': ['cappello', 'occhiali', 'vestito', 'cornice']
  .map((t) => `($tipo === '${t}' && newData.val().matches(/^(${ITEMS.filter((i) => i.tipo === t).map((i) => i.id).join('|')})$/))`).join(' || ') } };

writeFileSync(FILE, `${JSON.stringify(rules, null, 2)}\n`);
