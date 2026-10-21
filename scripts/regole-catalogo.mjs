// Scrive in database.rules.json la regola dei prezzi del negozio, ricavata da src/shop/catalogo.js.
// Un accessorio si possiede solo se nello stesso salvataggio le monete scendono esattamente del suo prezzo,
// oppure se è un esclusivo e l'account è tra i primi 100.
import { readFileSync, writeFileSync } from 'node:fs';
import { ITEMS, EARN } from '../src/shop/catalogo.js';
import { MILESTONES, EVERY_AFTER_100 } from '../src/ritorno/serie.js';
import { POOL, ALL_DONE_BONUS } from '../src/ritorno/sfide.js';

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
// Si mostra solo ciò che l'account possiede davvero (users/{uid}/owned): niente esclusivi senza i primi 100.
players.acc = { $tipo: { '.validate': `(${['cappello', 'occhiali', 'vestito', 'cornice']
  .map((t) => `($tipo === '${t}' && newData.val().matches(/^(${ITEMS.filter((i) => i.tipo === t).map((i) => i.id).join('|')})$/))`).join(' || ')}) && root.child('users').child($uid).child('owned').child(newData.val()).val() === true` } };

// ---- Ritorno giornaliero: serie di giorni, traguardi, sfide e scrigno (spec 2026-10-21-ritorno-giornaliero) ----
// Tutto in users/$uid, scritto dal telefono e controllato qui. Tetti decisi nel piano (costo accettato: estetica, non
// soldi): la serie non supera i giorni di vita dell'account + 2 e sale di 1 alla volta; il giorno avanza al massimo
// ogni 3 ore; scrigni al massimo 10 per giorno; sfide una alla volta ogni 20 secondi. Le riscossioni che portano
// monete lasciano un segno in claims/$uid/$key che si può solo creare (si toglie solo cancellando l'intero profilo).
const P = 'newData.parent()';
const D = 'data.parent()';
const ROOT_NEW = 'newData.parent().parent().parent()';
const DATE = '/^20[0-9]{2}-[01][0-9]-[0-3][0-9]$/';
const earnCond = `${P}.child('lastEarn').val() === now && (!${D}.child('lastEarn').exists() || ${D}.child('lastEarn').val() + 60000 <= now)`;
const sc = `${P}.child('scrigni')`;
const claim = (keyExpr) => `${ROOT_NEW}.child('claims').child($uid).child(${keyExpr}).val() === true && !root.child('claims').child($uid).child(${keyExpr}).exists()`;
const ageBound = `(now - ${P}.child('createdAt').val()) / 86400000 + 2`;
const milestones = [...MILESTONES.map((m) => [m.n, m.coins])];
for (let n = 2 * EVERY_AFTER_100.every; n <= 1000; n += EVERY_AFTER_100.every) milestones.push([n, EVERY_AFTER_100.coins]);
const branches = [
  // benvenuto
  `(!data.exists() && newData.val() <= (${P}.child('primi100').val() === true ? ${EARN.benvenutoPrimi} : ${EARN.benvenuto}) + 20 + (${P}.child('invitedBy').exists() ? ${EARN.invito} : 0))`,
  // spesa
  '(data.exists() && newData.val() <= data.val())',
  // partita finita: fino a 20 monete
  `(data.exists() && newData.val() <= data.val() + 20 && ${earnCond})`,
  // partita finita con scrigno: fino a 60, scrigno contato (al massimo ${EARN.scrigniGiorno} per giorno)
  `(data.exists() && newData.val() <= data.val() + 60 && ${earnCond} && ${sc}.child('n').val() === (${D}.child('scrigni').child('g').val() === ${sc}.child('g').val() ? ${D}.child('scrigni').child('n').val() + 1 : 1) && ${sc}.child('n').val() <= ${EARN.scrigniGiorno} && ${sc}.child('g').val() === ${P}.child('lastDay').val())`,
  // bonus del giorno
  `(data.exists() && newData.val() <= data.val() + ${EARN.giornalieroMax} && ${P}.child('lastDailyAt').val() === now && (!${D}.child('lastDailyAt').exists() || ${D}.child('lastDailyAt').val() + 72000000 <= now))`,
  // invito riscosso
  `(data.exists() && newData.val() <= data.val() + ${EARN.invito} && ${P}.child('invitesClaimed').val() === ${D}.child('invitesClaimed').val() + 1 && ${P}.child('invitesClaimed').val() <= ${EARN.maxInviti} && root.child('invites').child($uid).child(${P}.child('lastInvite').val()).val() === true && ${ROOT_NEW}.child('invites').child($uid).child(${P}.child('lastInvite').val()).val() === 'preso')`,
  // traguardi della serie: una volta per serie
  ...milestones.map(([n, coins]) => `(data.exists() && newData.val() <= data.val() + ${coins} && ${P}.child('streak').val() >= ${n} && ${claim(`'m_' + ${P}.child('serieId').val() + '_${n}'`)})`),
  // sfide: una alla volta, ognuna col suo premio (più il bonus per averle fatte tutte)
  ...POOL.map((c) => `(data.exists() && newData.val() <= data.val() + ${c.reward + ALL_DONE_BONUS} && ${P}.child('lastSfida').val() === now && (!${D}.child('lastSfida').exists() || ${D}.child('lastSfida').val() + 20000 <= now) && ${P}.child('ultimaSfida').val() === 's_' + ${P}.child('lastDay').val() + '_${c.id}' && ${P}.child('sfideFatte').child(${P}.child('lastDay').val()).child('${c.id}').val() === true && ${claim(`'s_' + ${P}.child('lastDay').val() + '_${c.id}'`)})`),
];
user.coins = { '.validate': `newData.isNumber() && newData.val() >= 0 && (${branches.join(' || ')})` };
const keepFields = ['lastEarn', 'lastDailyAt', 'invitesClaimed', 'lastDay', 'lastDayAt', 'migliorSerie', 'serieId', 'scrigni', 'lastSfida'];
user['.write'] = `auth != null && auth.uid === $uid && (!newData.exists() || !data.exists() || (${keepFields.map((f) => `(!data.child('${f}').exists() || newData.child('${f}').exists())`).join(' && ')}))`;
const stamp = (ms) => `newData.isNumber() && (data.exists() ? (newData.val() === data.val() || (newData.val() === now && data.val() + ${ms} <= now)) : newData.val() === now)`;
user.lastDayAt = { '.validate': stamp(10800000) };
user.lastDay = { '.validate': `newData.isString() && newData.val().matches(${DATE}) && (data.exists() ? (newData.val() === data.val() || (newData.val() > data.val() && ${P}.child('lastDayAt').val() === now)) : ${P}.child('lastDayAt').val() === now)` };
user.streak = { '.validate': `newData.isNumber() && newData.val() >= 1 && newData.val() <= 1000 && newData.val() <= ${ageBound} && (newData.val() === 1 || (data.exists() && (newData.val() === data.val() || newData.val() === data.val() + 1)))` };
user.migliorSerie = { '.validate': `newData.isNumber() && newData.val() >= 1 && newData.val() <= 1000 && newData.val() <= ${ageBound} && (data.exists() ? (newData.val() === data.val() || newData.val() === data.val() + 1) : newData.val() <= ${P}.child('streak').val())` };
user.serieId = { '.validate': `newData.isString() && newData.val().matches(${DATE}) && (!data.exists() || newData.val() === data.val() || ${P}.child('streak').val() === 1)` };
user.scudo = { '.validate': "newData.isString() && newData.val().matches(/^20[0-9]{2}-[01][0-9]$/) && (!data.exists() || newData.val() === data.val() || newData.val() > data.val())" };
user.scrigni = {
  '.validate': "newData.hasChildren(['g', 'n']) && (!data.exists() || newData.child('g').val() !== data.child('g').val() || newData.child('n').val() >= data.child('n').val())",
  g: { '.validate': `newData.isString() && newData.val().matches(${DATE}) && ((data.exists() && newData.val() === data.val()) || newData.val() === newData.parent().parent().child('lastDay').val())` },
  n: { '.validate': `newData.isNumber() && newData.val() >= 1 && newData.val() <= ${EARN.scrigniGiorno}` },
  $other: { '.validate': false },
};
user.lastSfida = { '.validate': stamp(20000) };
user.ultimaSfida = { '.validate': `newData.isString() && newData.val().matches(/^s_20[0-9]{2}-[01][0-9]-[0-3][0-9]_s[1-8]$/)` };
user.sfideFatte = { $day: { $id: { '.validate': `$day.matches(${DATE}) && $id.matches(/^s[1-8]$/) && newData.val() === true && (data.exists() || $day === ${ROOT_NEW.replace('newData.parent().parent().parent()', 'newData.parent().parent().parent()')}.child('lastDay').val())` } } };
// i campi con $other: false restano in fondo
const other = user.$other; delete user.$other; user.$other = other;
rules.rules.claims = { $uid: {
  '.read': 'auth != null && auth.uid === $uid',
  '.write': "auth != null && auth.uid === $uid && !newData.exists() && !newData.parent().parent().child('users').child($uid).exists()",
  $key: {
    '.write': 'auth != null && auth.uid === $uid && !data.exists() && newData.exists()',
    '.validate': "newData.val() === true && $key.matches(/^(m_20[0-9]{2}-[01][0-9]-[0-3][0-9]_[0-9]{1,4}|s_20[0-9]{2}-[01][0-9]-[0-3][0-9]_s[1-8])$/)",
  },
} };

writeFileSync(FILE, `${JSON.stringify(rules, null, 2)}\n`);
