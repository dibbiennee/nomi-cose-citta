# Ritorno giornaliero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far tornare le persone ogni giorno: scala dei giorni di fila con traguardi, tre sfide al giorno, scrigno a fine partita, con sei accessori nuovi.

**Architecture:** Logica pura (serie, sfide, scrigno) in `src/ritorno/`, provata con `node --test`. Dati in `users/{uid}`, protetti da regole del database generate da `scripts/regole-catalogo.mjs` (stesso metodo dei prezzi) e provate sull'emulatore. Interfaccia: scheda "Oggi" in home, foglio dei traguardi, scrigno sul podio.

**Tech Stack:** React (CRA), Firebase Realtime Database + Auth, `node --test`, emulatore su porte 9100/9199.

**Spec:** `docs/superpowers/specs/2026-10-21-ritorno-giornaliero-design.md`

## Global Constraints

- Italiano, mai il trattino lungo, a capo per unità di senso, parole corte incollate con `&nbsp;`. Stile `.claude/design.md`: bordo 2.5px inchiostro, ombra netta, aree di tocco 44×44, responsive fino a 360px, `prefers-reduced-motion`.
- Solo con l'account. Chi non è registrato vede l'anteprima dei premi e non accumula.
- Regole del database: pubblicate **prima** del sito, ogni permesso nuovo ha un test sull'emulatore. I campi che controllano i premi **non si cancellano** (modello di `lastEarn` in `database.rules.json`: `users/$uid/.write` vieta di far sparire un campo di controllo già scritto).
- `src/engine/rules.js` non si tocca. Le partite non cambiano comportamento.
- Giorno di Roma = `dayKey(ms)` di `src/stats.js`. Il bonus in monete resta con intervallo di 20 ore (`lastDailyAt`).
- Tetti anti-trucco decisi (costo accettato: estetica, non soldi):
  - `streak` e `migliorSerie` crescono al massimo di 1 per scrittura e mai oltre `(now - createdAt)/86400000 + 2`;
  - `lastDay` avanza solo se è passato almeno `10800000` ms (3 ore) da `lastDayAt`;
  - premio a fine partita: partita fino a 20 + scrigno fino a 40, sotto `lastEarn` (60 s); massimo 10 scrigni per giorno (`scrigni = {g: lastDay, n}`);
  - sfide: riscossione una per scrittura, al massimo +110, intervallo 20 s (`lastSfida`), id solo dal pool `s1..s8`;
  - traguardi: una volta per serie (`milestoni/{serieId}_{n}`), accessori di serie solo con `migliorSerie >= n`.
- Tabella dei traguardi (giorno → monete, accessorio): 3 → 50; 7 → 150 + `cornice_scintille`; 14 → 300; 30 → 800 + `mantello_notte`; 50 → 1200; 100 → 3000 + `corona_fiamme`; poi 3000 ogni multiplo di 100.
- Accessori rari dello scrigno: `cappello_mago` (cappello), `occhiali_arcobaleno` (occhiali), `collare_gemme` (vestito).

## Review Focus

- Salto di un giorno con scudo disponibile / già usato nel mese: la serie continua / riparte da 1, mai valori negativi o saltati.
- Apertura a mezzanotte (23:50 poi 00:10): la serie avanza, il bonus monete aspetta le 20 ore e non si perde.
- Chi ha già `streak` e `lastDaily` ma non `lastDay`: nessuna serie persa dopo l'aggiornamento.
- Doppio clic su "Prendi" per una sfida o un traguardo: una sola riscossione.
- Partita senza rete a fine partita: scrigno e sfide non si perdono né si contano due volte.
- Account cancellato e ricreato: nessuna serie, traguardo o accessorio che resta.

---

### Task 1: Logica pura della serie, delle sfide e dello scrigno

**Files:**
- Create: `src/ritorno/serie.js`, `src/ritorno/sfide.js`, `src/ritorno/scrigno.js`, `src/ritorno/ritorno.test.mjs`
- Modify: `package.json` (aggiungere `src/ritorno/*.test.mjs` a `test:rules`)

**Interfaces:**
- Produces:
  - `MILESTONES: {n:number, coins:number, item?:string}[]` e `milestoneFor(n): {coins,item?}|null` (include i multipli di 100 oltre il 100) in `serie.js`.
  - `advanceStreak(state:{lastDay?:string, streak?:number, migliorSerie?:number, serieId?:string, scudo?:string}, today:string): {state, event:'nuovo'|'continua'|'stesso-giorno'|'scudo'|'riparte', reached:number[]}` in `serie.js`. `reached` = traguardi del `MILESTONES` raggiunti da questo avanzamento (solo il giorno nuovo, nessuno già raggiunto in `state`).
  - `dayBefore(day:string, n=1): string` in `serie.js`.
  - `POOL: {id:'s1'..'s8', tier:'facile'|'media'|'difficile', nome, reward:15|30|60, test:(g)=>boolean}[]` e `challengesFor(day:string): POOL[]` (esattamente 3: una per livello, scelta deterministica dalla data) e `ALL_DONE_BONUS = 50` in `sfide.js`. `g = {mode:'online'|'veloce'|'solo', won:boolean, unique:number, rank:number, players:number, humans:number}`.
  - `completed(day, g): string[]` (id delle sfide di oggi soddisfatte da questa partita) in `sfide.js`.
  - `rollChest(rng:()=>number, owned:Record<string,true>): {kind:'monete', coins:number}|{kind:'raro', item:string, coins:0}` in `scrigno.js`; mai più di 40 monete.

- [ ] **Step 1: Write the failing tests** in `src/ritorno/ritorno.test.mjs` con le asserzioni:
  - `advanceStreak({}, '2026-10-21')` → `streak 1`, `serieId '2026-10-21'`, `event 'nuovo'`, `reached []`.
  - Giorno dopo (`lastDay '2026-10-20', streak 2` → today `'2026-10-21'`) → `streak 3`, `reached [3]`.
  - Stesso giorno → `event 'stesso-giorno'`, stato invariato.
  - Un giorno saltato con `scudo` diverso dal mese di `today` → `streak` continua (+1), `event 'scudo'`, `state.scudo === '2026-10'`.
  - Un giorno saltato con `scudo === '2026-10'` → `streak 1`, `event 'riparte'`, `serieId` nuovo, `migliorSerie` invariato.
  - Due giorni saltati (anche con scudo libero) → riparte.
  - `migliorSerie` non scende mai; `reached` non ripete un traguardo già raggiunto in `migliorSerie` solo se è la stessa serie (nuova serie che ripassa dal 7 rimette `7` in `reached`).
  - Migrazione: `{streak: 5, lastDaily: '2026-10-20'}` senza `lastDay` e today `'2026-10-21'` → `streak 6` (si usa `lastDaily` come `lastDay`).
  - `milestoneFor(3)` → `{coins:50}`, `milestoneFor(7).item === 'cornice_scintille'`, `milestoneFor(100)` → 3000 + `corona_fiamme`, `milestoneFor(200)` → `{coins:3000}`, `milestoneFor(4)` → `null`.
  - `challengesFor(d)` ha 3 elementi con livelli `['facile','media','difficile']`, è uguale per due chiamate, e in 30 giorni consecutivi compaiono almeno 5 id diversi.
  - `completed` su casi: partita online con 4 giocatori (3 umani), `rank 2`, `unique 3` → include la sfida delle 3 parole uniche e quella dei primi 3 (se presenti oggi); partita solo con `won true` non completa "Vinci" né "Primi 3"; `humans 1` non completa "con un amico".
  - `rollChest(() => 0.5, {})` dà monete tra 5 e 40; `rollChest(() => 0.99, {})` dà un `raro` tra i tre; con tutti i rari in `owned` dà `monete` da 50 invece dell'accessorio (eccezione ai 40: è il premio fisso concordato nella spec).
  - Media su 10 000 lanci con `Math.random` sotto 30 monete.
- [ ] **Step 2: Run** `node --test src/ritorno/ritorno.test.mjs` → FAIL (moduli mancanti).
- [ ] **Step 3: Implement** i tre moduli con le firme di Interfaces. `advanceStreak` confronta i giorni con `dayBefore`; il pool delle sfide: s1 "Gioca una partita" (facile, 15), s2 "Gioca con un amico" (facile: `humans >= 2`, `mode` online o veloce), s3 "Scrivi 3 parole uniche" (media, 30), s4 "Vinci una partita" (media: `won` e `mode !== 'solo'`), s5 "Arriva nei primi 3" (difficile, 60: `players >= 3 && humans >= 2 && rank <= 3 && mode !== 'solo'`), s6 "Scrivi 6 parole uniche" (difficile), s7 "Gioca una partita da solo" (facile), s8 "Vinci con 5 parole uniche" (media: `won && unique >= 5 && mode !== 'solo'`). La scelta del giorno: indice dal numero del giorno (data in giorni dall'epoca) modulo il numero di sfide del livello.
- [ ] **Step 4: Run** il test → PASS; poi `npm run test:rules` → tutto verde.
- [ ] **Step 5: Commit** `Ritorno: logica di serie, sfide e scrigno`.

---

### Task 2: Regole del database e funzioni del profilo

**Files:**
- Modify: `scripts/regole-catalogo.mjs` (genera anche le regole del ritorno), `database.rules.json` (rigenerato), `src/account/profilo.js`, `src/shop/catalogo.js` (solo `EARN`: aggiungere `scrigniGiorno: 10, scrignoMax: 40`), `src/shop/catalogo.test.mjs` (aggiornare l'asserzione di `EARN`)
- Test: `src/account/ritorno.test.mjs` (emulatore), da aggiungere a `test:room`

**Interfaces:**
- Consumes: `advanceStreak`, `milestoneFor`, `challengesFor`, `POOL`, `ALL_DONE_BONUS`, `completed`, `rollChest` dal Task 1.
- Produces in `profilo.js`:
  - `touchDay(db, uid, today): Promise<{event, streak, reached:number[]}|null>`: aggiorna `lastDay`, `lastDayAt` (server timestamp), `streak`, `migliorSerie`, `serieId`, `scudo`; null se il giorno è già registrato o la scrittura è rifiutata. Un solo `update` su `users/{uid}`.
  - `claimMilestones(db, uid, reached:number[]): Promise<{coins:number, items:string[]}>`: una scrittura per traguardo (`milestoni/{serieId}_{n}: true`, monete, accessorio se previsto); salta quelli già presi.
  - `finishGame(db, uid, {result, today}): Promise<{coins:number, chest:{kind,coins,item?}, done:string[]}>`: **una sola scrittura** con monete di partita (`gameCoins`), scrigno (`rollChest(Math.random, owned)`), `scrigni`, `lastEarn`, e le sfide completate (`sfideFatte/{today}/{id}: true`).
  - `claimChallenge(db, uid, today, id): Promise<'ok'|'già'|'non fatta'>`: monete della sfida (+`ALL_DONE_BONUS` se è la terza e ultima dell'oggi), `sfideRiscosse/{today}/{id}: true`, `lastSfida`.
  - `migrateLastDay(db, uid): Promise<void>`: se esistono `lastDaily` e non `lastDay`, scrive `lastDay = lastDaily` una volta sola.
- Dati in `users/{uid}`: `lastDay`, `lastDayAt`, `migliorSerie`, `serieId`, `scudo`, `milestoni/$m`, `sfideFatte/$day/$id`, `sfideRiscosse/$day/$id`, `scrigni {g,n}`, `lastSfida`. `deleteProfile` cancella già l'intero `users/{uid}`.

- [ ] **Step 1: Write the failing tests** in `src/account/ritorno.test.mjs` (stesso scheletro di `profilo.test.mjs`: account Google sull'emulatore, `setIscritti`, `adminSet`). Ogni test dice cosa è vietato:
  - `touchDay` crea `streak 1`; riesce due giorni dopo `+1`; lo stesso giorno due volte → null.
  - Rifiutati dalle regole: `streak` +2 in una scrittura; `streak` oltre `giorni dalla creazione + 2` (profilo nuovo con `streak 50`); `lastDay` che avanza due volte entro 3 ore; cancellare `lastDay`, `lastDayAt`, `migliorSerie`, `serieId`, `scrigni`, `lastSfida`, `milestoni/..`, `sfideRiscosse/..`.
  - `claimMilestones([3])` dà +50; seconda chiamata stessa serie → 0; con `migliorSerie` troppo basso (scritto via admin a 2) il traguardo 7 e il suo accessorio sono rifiutati dalle regole.
  - `finishGame`: una scrittura, monete tra 5+0 e 60, ≤10 scrigni nello stesso `lastDay` (l'11° rifiutato), non due volte in 60 s, accessorio raro accettato solo nella scrittura con `lastEarn === now`.
  - `claimChallenge`: una volta sola per id e giorno; +`ALL_DONE_BONUS` sull'ultima; id fuori da `s1..s8` rifiutato; due riscossioni entro 20 s → la seconda rifiutata; più di +110 rifiutato; sfida non fatta → `'non fatta'` senza scrivere.
  - `migrateLastDay`: profilo con `lastDaily '2026-10-20'` e senza `lastDay` → `lastDay '2026-10-20'`; seconda chiamata non cambia nulla.
  - Profilo cancellato e ricreato: nessuna serie, traguardo o accessorio resta.
  - Test che già esistono (`profilo.test.mjs`, `veloce.test.mjs`) restano verdi: il ramo del bonus del giorno e i rami `lastEarn` esistenti non cambiano significato.
- [ ] **Step 2: Run** `firebase emulators:exec --project demo-ncc --only auth,database "node --test --test-force-exit src/account/ritorno.test.mjs"` → FAIL.
- [ ] **Step 3: Implement** le regole in `scripts/regole-catalogo.mjs` (stessa tecnica dei prezzi: stringhe generate da `EARN` e `MILESTONES`) e le funzioni in `profilo.js`. Regole nuove nel ramo `coins` (si aggiungono con `||` ai rami esistenti, ognuno col suo campo timestamp): partita+scrigno (esteso il ramo `lastEarn`: fino a +60 solo se `scrigni.n` sale di 1 con `scrigni.g === lastDay` e `n <= 10`, altrimenti fino a +20), traguardo (`milestoni/{serieId}_{n}` appena scritto, importo = tabella), sfida (`lastSfida === now`, 20 s, ≤ +110). Il livello `users/$uid/.write` aggiunge i nuovi campi di controllo all'elenco dei non cancellabili (`lastDay`, `lastDayAt`, `migliorSerie`, `serieId`, `scrigni`, `lastSfida`; i nodi `milestoni`, `sfideFatte`, `sfideRiscosse` si possono solo aggiungere). Ogni `.validate` dei campi nuovi come nei Global Constraints.
- [ ] **Step 4: Run** il test di Task 2 → PASS; poi `npm run test:rules` e `npm run test:room` → tutto verde (anche `profilo.test.mjs`, `veloce.test.mjs`, `room.test.mjs`).
- [ ] **Step 5: Commit** `Ritorno: regole e funzioni del profilo per serie, sfide e scrigno`.

---

### Task 3: Sei accessori nuovi

**Files:**
- Modify: `src/shop/catalogo.js` (6 voci), `src/shop/accessori.js` (disegni), `src/shop/catalogo.test.mjs`, `scripts/regole-catalogo.mjs`, `database.rules.json` (rigenerato), `src/account/profilo.js` (`buyItem` non vende gli accessori di serie e rari), `src/screens/Negozio.js` (etichette)
- Test: `src/shop/catalogo.test.mjs`, `src/account/ritorno.test.mjs` (aggiunte)

**Interfaces:**
- Consumes: regole `owned.$item` generate dal catalogo; `migliorSerie`, `lastEarn` dal Task 2.
- Produces: voci `ITEMS` con `serie: 7|30|100` (non acquistabili) e `raro: true`; `ACCESSORI[id]` per tutti e sei; etichette del Negozio `Premio dei 7 giorni di fila`, `… 30 …`, `… 100 …`, `Raro: si trova negli scrigni`.

- [ ] **Step 1: Write the failing tests**: in `catalogo.test.mjs` 18 accessori, id unici, i tre `serie` con `[7,30,100]` e tipi diversi (cornice, vestito, cappello), i tre `raro` con tipi cappello, occhiali, vestito, e ogni id ha un disegno in `ACCESSORI`; in `ritorno.test.mjs`: possedere `cornice_scintille` senza `migliorSerie >= 7` è rifiutato, con `migliorSerie 7` accettato; `cappello_mago` accettato solo con `lastEarn === now` nella stessa scrittura; `buyItem` ritorna `'poveri'` per tutti i sei; in stanza si mostrano solo se posseduti (già vale).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: sei disegni SVG nello stile esistente (contorno `INK`, colori della palette, viewBox 48×48); catalogo; `node scripts/regole-catalogo.mjs`; `buyItem` rifiuta `esclusivo`, `serie` e `raro`; il Negozio li mostra con l'etichetta e senza "Compra" (come gli esclusivi). Guardare i disegni nel browser a 44 px e a 108 px.
- [ ] **Step 4: Run** `npm run test:rules` e `npm run test:room` → verdi.
- [ ] **Step 5: Commit** `Ritorno: sei accessori nuovi`.

---

### Task 4: Interfaccia: scheda Oggi, foglio dei traguardi, scrigno

**Files:**
- Create: `src/screens/Oggi.js` (scheda per la home e foglio dei traguardi), `src/ritorno/useRitorno.js` (hook)
- Modify: `src/App.js`, `src/screens/Home.js`, `src/screens/Finale.js`, `src/screens/Avvisi.js` (foglio traguardo), `src/account/useAccount.js`
- Test: `scripts/prova-ritorno.py` (Playwright sull'emulatore)

**Interfaces:**
- Consumes: `touchDay`, `claimMilestones`, `finishGame`, `claimChallenge`, `migrateLastDay` (Task 2), `challengesFor`, `completed` (Task 1).
- Produces:
  - `useRitorno({account, toast})` → `{ oggi: {streak, prossimo:{n,coins,item?}, sfide:[{id,nome,tier,reward,fatta,riscossa}], scudoDisponibile:boolean}, riscuoti(id), festa:{n,coins,item?}|null, chiudiFesta(), fineGiornata(result) }`.
  - `useAccount.earn(result)` ora chiama `finishGame` e restituisce `{amount, kept, late?, chest, done}` (stesso schema di oggi più `chest` e `done`); `result` = `{won, unique, mode, rank, players, humans}`.
  - Home: la scheda "Oggi" (serie, prossimo traguardo, tre sfide) sotto i tasti principali, solo per chi ha l'account; per gli altri una riga di anteprima "Con l'account: premi ogni giorno" che apre Account.
  - Finale: lo scrigno si apre una volta (animazione, un solo momento orchestrato) e mostra monete o accessorio raro, più le sfide fatte.

- [ ] **Step 1: Write the failing test** `scripts/prova-ritorno.py`: con l'emulatore acceso e un account creato come in `prova-account.py`: la scheda Oggi mostra "Giorno 1" e tre sfide; dopo una partita da soli compaiono scrigno e almeno la sfida "Gioca una partita da solo" o "Gioca una partita" completata; "Prendi le N monete" accredita una volta sola anche con doppio clic; riaperta il giorno dopo (si simula riscrivendo `lastDay` di ieri con l'amministratore) mostra "Giorno 2"; `lastDay` di 3 giorni fa con scudo libero → la serie non riparte; foglio di festa a 3 giorni (con `migliorSerie` e `streak` scritti come amministratore a 2 e `lastDay` di ieri); senza account l'anteprima c'è e niente scheda; nessun errore JS; nessun overflow orizzontale a 360px.
- [ ] **Step 2: Run** `python3 scripts/prova-ritorno.py http://localhost:3100` → FAIL (elementi assenti).
- [ ] **Step 3: Implement** hook e schermate. Una volta per apertura (come oggi `claimDaily`): `migrateLastDay`, `touchDay`, `claimMilestones`, bonus del giorno esistente (`claimDaily` resta, ora separato dalla serie), poi `claimInvites`. Testi: bottoni che dicono cosa succede ("Prendi le 30 monete"), foglio di festa senza trattino lungo e a capo per senso. Scheda Oggi compatta (la home deve restare tutta nella prima schermata a 390×844 e a 360×740: verificare con screenshot e `controlla-testi.py`). Animazione dello scrigno rispetta `prefers-reduced-motion`. `afterGame` in `App.js` passa `mode`, `rank`, `players`, `humans` (online: dal `ranking(room.players)`; solo: `mode 'solo'`, `rank` dalla classifica del motore, robot esclusi da `humans`).
- [ ] **Step 4: Run** `prova-ritorno.py` → PASS; poi `npm run test:rules`, `npm run test:room`, `CI=true npm run build`, e `scripts/prova-account.py`, `scripts/prova-offline.py` → come prima.
- [ ] **Step 5: Commit** `Ritorno: scheda Oggi, festa dei traguardi e scrigno`.

---

### Task 5: Statistiche del ritorno

**Files:**
- Modify: `src/stats.js` (`STAT_KEYS`), `database.rules.json` (regex dei contatori), `src/screens/Statistiche.js`, `src/ritorno/useRitorno.js` (le chiamate a `stat`)
- Test: `src/stats.test.mjs` (esistente: controlla che le chiavi siano accettate)

**Interfaces:**
- Produces: contatori `serie_3`, `serie_7`, `serie_14`, `serie_30`, `serie_50`, `serie_100`, `serie_persa`, `scudo_usato`, `sfida_facile`, `sfida_media`, `sfida_difficile`, `sfide_tutte`, `scrigni_aperti`, `scrigni_rari`; sezione "Ritorno" in `/statistiche` con barre per traguardi, serie perse, scudi, sfide per livello, scrigni.

- [ ] **Step 1: Write the failing test** in `stats.test.mjs`: ogni chiave nuova si può incrementare di uno e una chiave inventata no.
- [ ] **Step 2: Run** `npm run test:room` → FAIL sulle chiavi nuove.
- [ ] **Step 3: Implement** chiavi, regole, chiamate a `stat` (un traguardo raggiunto, una serie che riparte, uno scudo usato, ogni sfida riscossa per livello, ogni scrigno e ogni raro) e la sezione della pagina.
- [ ] **Step 4: Run** i test → verdi; controllare `/statistiche` nel browser a 390px (`controlla-testi.py`: zero problemi).
- [ ] **Step 5: Commit** `Ritorno: statistiche`.

---

### Task 6: Verifica finale

**Files:** nessun file nuovo.

- [ ] **Step 1:** `npm run test:rules`, `npm run test:room`, `CI=true npm run build`, `scripts/prova-account.py`, `scripts/prova-offline.py`, `scripts/prova-ritorno.py`, partita veloce: tutto verde. Riportare i numeri.
- [ ] **Step 2:** Revisione indipendente dell'intero ramo con un subagent su modello più capace, con le righe di Review Focus. Sistemare Critical e Important con prova che fallisce prima; i minori nel registro.
- [ ] **Step 3:** Pubblicare: regole (`firebase deploy --only database --project nomi-cose-citta-416e9`), merge in `main`, `git push origin main`, `vercel deploy --prod`; controllare sul sito vero che la home mostri la scheda e che nessuna schermata abbia errori.
