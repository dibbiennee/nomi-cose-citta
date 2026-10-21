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
const rule = `newData.val() === true && !data.exists() && (${paid.join(' || ')} || ((${free.join(' || ')}) && newData.parent().parent().child('primi100').val() === true))`;

rules.rules.users = rules.rules.users || { $uid: {} };
const user = rules.rules.users.$uid;
user.owned = user.owned || {};
user.owned.$item = { '.validate': rule };
writeFileSync(FILE, `${JSON.stringify(rules, null, 2)}\n`);
