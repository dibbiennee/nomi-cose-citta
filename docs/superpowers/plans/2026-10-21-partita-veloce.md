# Partita veloce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Partita veloce" mette insieme fino a 4 persone in coda e avvia la partita da sola; dopo 20 secondi i posti vuoti li completano robot con l'etichetta "robot".

**Architecture:** Una coda in `queue/` su Firebase con un organizzatore deterministico (la voce più vecchia) che crea una stanza `quick: true` e assegna i giocatori con transazioni. I robot sono giocatori `bot: true` della stanza; ogni telefono ne calcola gli stessi piani con casualità ripetibile, scrive l'host o, se l'host non è attivo, il primo umano online. Regole del database estese al minimo: i giocatori umani di una stanza veloce possono scrivere a nome dei robot di quella stanza.

**Tech Stack:** React 18 (CRA), Firebase RTDB SDK 10 e regole, `node --test` sull'emulatore, Playwright per Python.

**Spec:** `docs/superpowers/specs/2026-10-21-partita-veloce-design.md`

## Global Constraints

- `src/engine/rules.js` non si modifica. Le stanze normali (senza `quick`) non cambiano comportamento: i test esistenti di `npm run test:room` restano verdi.
- Regole: nessun allentamento per le stanze normali; per le veloci solo quanto serve a coda e robot. Ogni regola nuova ha un test sull'emulatore che prova il permesso e il divieto.
- Robot: difficoltà `medio` con `doubtRate` 0,1 nelle partite veloci; nomi da `BOT_NAMES`, mai uguali a quelli dei giocatori; etichetta "robot" ovunque compaiono.
- Impostazioni della partita veloce: `cats` = Nomi, Cose, Città (`DEFAULT_CATEGORIES.slice(0, 3)`), `rounds` 3, `timer` 90, `hard` true, `maxPlayers` 4.
- Tempi: robot dopo 20 s di attesa della voce più vecchia; l'host aspetta gli assegnati al massimo 10 s.
- Statistiche: `partite_veloci` nuovo; la partita veloce conta anche in `partite_online` / `partite_online_finite`; `giocatori_online` solo umani; non conta in `stanze_create`. Presenza dal vivo con `where: 'coda'`.
- Testi in italiano, senza trattino lungo, a capo per unità di senso; stile di `.claude/design.md`.
- Niente deploy: regole e sito li pubblica Edoardo, prima le regole.

## Review Focus

1. **Due organizzatori nello stesso momento** (viste della coda diverse per qualche centinaio di millisecondi): nessuno deve finire in due stanze; chi perde la transazione resta in coda. Test in Task 4.
2. **Chi annulla o chiude l'app mentre viene assegnato**: la stanza parte comunque con chi è entrato e i robot completano; nessuno resta su "Cerco giocatori…" per sempre (chi è assegnato a una stanza che non riesce a raggiungere torna in coda). Test in Task 4.
3. **Host che va in secondo piano durante il round**: i robot continuano a scrivere (subentra il primo umano online) e allo STOP le loro parole già "scritte" ci sono. Test in Task 3.
4. **Un umano che prova a diventare robot o a scrivere per i robot di una stanza normale**: respinto dalle regole. Test in Task 1.
5. **Un robot che diventa host** quando gli umani escono: mai; se restano solo robot la stanza si chiude come quando l'ultimo esce. Test in Task 3.

---

### Task 1: Regole del database per coda, stanze veloci e robot

**Files:**
- Modify: `database.rules.json`
- Modify: `src/stats.js` (chiave `partite_veloci`, posto `coda`)
- Test: `src/engine/veloce.test.mjs` (nuovo, aggiunto a `test:room` in `package.json`)

**Interfaces:**
- Produces (regole):
  - `rooms/$code/quick`: booleano, scrivibile solo alla creazione della stanza (dentro la scrittura della stanza intera) e mai cambiato.
  - `rooms/$code/players/$uid/bot`: `true` ammesso solo se la stanza ha `quick: true` e `$uid` corrisponde a `/^bot[1-3]$/`; scrive solo l'host. Un uid vero non può avere `bot`.
  - `answers/$uid`, `round/stoppedBy`, `votes/$cat/$target/$voter`: in più di oggi, li può scrivere a nome di un giocatore `bot: true` qualunque giocatore **non robot** della stessa stanza veloce, con gli stessi vincoli di stato e tempo che valgono per i giocatori normali.
  - `presence/botN`: la scrive l'host (già permesso oggi).
  - `queue/$uid`: `{ name, color, face, char?, at, room? }`; scrive e cancella solo `$uid`, tranne `room`, che può scrivere chiunque se è vuoto e `root.child('rooms').child(newData.val()).child('hostId').val() === auth.uid`. Leggibile da utenti autenticati. `at` deve essere `now` quando si crea la voce.
  - `stats`: chiave `partite_veloci` nell'elenco; `live/$uid/where` ammette `coda`.

- [ ] **Step 1: Write the failing tests** in `src/engine/veloce.test.mjs` (stesso aiuto `phone()` di `room.test.mjs`), uno per riga:
  - l'host crea una stanza con `quick: true` e aggiunge `bot1` con `bot: true`: ok; in una stanza senza `quick` aggiungere un `bot: true`: respinto; cambiare `quick` dopo: respinto; un umano che scrive `bot: true` su sé stesso: respinto.
  - un umano della stanza veloce scrive `answers/bot1` durante `play`: ok; un estraneo: respinto; un umano scrive `answers/bot1` in una stanza normale con un giocatore `bot1` impossibile da creare: respinto (`answers/bot1` senza giocatore).
  - un umano scrive `round/stoppedBy = 'bot1'` in `play`: ok; `stoppedBy = 'bot9'` (non esiste): respinto.
  - un umano scrive un voto con `$voter = bot1` in `review`: ok; con `$voter` = un altro umano: respinto.
  - coda: A scrive la propria voce: ok; scrive la voce di B: respinto; B (host di una stanza) assegna `queue/A/room` col proprio codice: ok; la riassegna a un altro codice: respinto; un non-host assegna: respinto.
  - `track(db, 'partite_veloci')` ok; `setLive(db, uid, 'coda')` ok.
- [ ] **Step 2: Run** `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`. Expected: i nuovi test FAIL, gli altri PASS.
- [ ] **Step 3: Implement** le regole e le due aggiunte in `src/stats.js` e nella sua regola.
- [ ] **Step 4: Run** lo stesso comando. Expected: tutto PASS.
- [ ] **Step 5: Commit** `git commit -m "Partita veloce: regole del database per coda, stanze veloci e robot"`

### Task 2: Robot online con piani ripetibili

**Files:**
- Create: `src/engine/robotOnline.js`
- Test: `src/engine/robotOnline.test.mjs` (aggiunto a `test:rules`)

**Interfaces:**
- Consumes: `planBot`, `botVote`, `LEVELS`, `makeBots`, `BOT_NAMES` da `src/solo/robot.js`; `Dictionary` da `src/solo/dizionario.js`.
- Produces:
  - `QUICK_LEVEL = { ...LEVELS.medio, doubtRate: 0.1 }`
  - `seededRandom(...parts: (string|number)[]) -> () => number`: stessa sequenza per le stesse parti.
  - `planFor(room, code, botId, dict) -> { writes, stopAt }`: `planBot(room.players[botId], catKeys, round.letter, QUICK_LEVEL, dict, seededRandom(code, round.n, round.letter, botId), round.startsAt)`; stesso risultato su ogni telefono.
  - `dueAnswers(room, code, botId, dict, now) -> { [cat]: word }`: le scritture del piano con `at <= min(now, round.stoppedAt || Infinity)`.
  - `dueStop(room, code, dict, now) -> botId | null`: il robot con `stopAt <= now` più basso, se il round è in `play` e senza `stoppedBy`.
  - `botVotesFor(room, code, dict) -> Array<{ cat, target, voter }>`: voti "Non vale" dei robot, con `seededRandom(code, round.n, 'voti', voter, cat, target)`.
  - `pickBots(n, takenNames: string[], random) -> Array<{ id, name, face, color, quirk }>` con id `bot1..botN`.

- [ ] **Step 1: Write the failing tests**: due chiamate di `planFor` con gli stessi argomenti danno piani identici; `dueAnswers` dopo uno STOP non include scritture successive a `stoppedAt`; `dueStop` torna `null` se c'è già `stoppedBy`; `botVotesFor` non contiene mai voti contro parole che il dizionario conosce con la lettera giusta; `pickBots(3, ['Giulia'])` non usa "Giulia"; la frequenza di dubbio sulle parole sconosciute degli umani è intorno a 0,1 su 4000 prove.
- [ ] **Step 2: Run** `node --test src/engine/robotOnline.test.mjs`. Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement** `src/engine/robotOnline.js`.
- [ ] **Step 4: Run** `npm run test:rules`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Partita veloce: robot online con piani uguali su ogni telefono"`

### Task 3: Stanze veloci e robot nel motore

**Files:**
- Modify: `src/engine/room.js`
- Test: `src/engine/veloce.test.mjs`

**Interfaces:**
- Consumes: Task 1 (regole), Task 2 (`pickBots`, `dueAnswers`, `dueStop`, `botVotesFor`).
- Produces (metodi nuovi di `createEngine`):
  - `createQuickRoom(profile) -> code`: come `createRoom` con le impostazioni della partita veloce e `quick: true`.
  - `addBots(code, n) -> void` (solo host): aggiunge `bot1..botN` con `bot: true`, presenza `true`.
  - `driveBots(code, room, dict) -> Promise<void>`: scrive le risposte dovute dei robot (`answers/botN`), lo STOP dovuto (`closeRound(code, botId)` a nome del robot), e in `review` i voti mancanti dei robot. Idempotente: riscrivere gli stessi valori non cambia niente.
  - `shouldDriveBots(room, uid, now) -> boolean`: vero per l'host se presente; altrimenti per il primo umano online (per `joinedAt`) se l'host è offline o l'ultima scrittura dovuta dei robot è in ritardo di più di 4 s.
  - Nel passaggio di host (`subscribe`, `claimHost`, `claimIdleHost`) i giocatori `bot: true` non vengono mai scelti: si passa a `nextHost` solo l'elenco degli umani. Se in stanza restano solo robot, `leaveRoom` dell'ultimo umano cancella la stanza come oggi.
  - `pressStop`, `closeRound(code, by)` accettano `by` = id di un robot.

- [ ] **Step 1: Write the failing tests** (emulatore): partita veloce con 2 umani (A host, B) e 2 robot: `createQuickRoom`, `joinRoom`, `addBots(code, 2)`, `startGame`, `goPlay`; chiamando `driveBots` dal telefono di A a intervalli col tempo che passa, i robot scrivono e uno fa STOP; correzione con voti dei robot, punti, fino a `final`. Poi: A va offline durante `play` (come nel test "connessione persa"), `shouldDriveBots` diventa vero per B e `driveBots` da B completa le risposte dei robot. Poi: A e B escono, la stanza non ha mai `hostId` = `botN` e viene cancellata.
- [ ] **Step 2: Run** `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`. Expected: i nuovi FAIL.
- [ ] **Step 3: Implement** in `src/engine/room.js`.
- [ ] **Step 4: Run** lo stesso comando. Expected: tutto PASS (anche i test delle stanze normali).
- [ ] **Step 5: Commit** `git commit -m "Partita veloce: stanze veloci e robot nel motore, con passaggio a un altro telefono"`

### Task 4: La coda

**Files:**
- Create: `src/engine/coda.js`
- Test: `src/engine/coda.test.mjs` (funzioni pure, in `test:rules`) e casi in `src/engine/veloce.test.mjs` (emulatore)

**Interfaces:**
- Consumes: Task 1 (regole `queue`), Task 3 (`createQuickRoom`, `addBots`).
- Produces:
  - `QUICK_SIZE = 4`, `BOT_WAIT_MS = 20000`, `JOIN_WAIT_MS = 10000`.
  - `organizer(queue: { [uid]: { at, room? } }) -> uid | null`: voce senza `room` più vecchia (a parità uid minore).
  - `nextGroup(queue, now, waitMs = BOT_WAIT_MS) -> uid[] | null`: le prime `QUICK_SIZE` voci libere se sono 4, oppure tutte quelle libere (1..3) se la più vecchia aspetta da almeno `waitMs`; altrimenti `null`.
  - `createQueue(db, engine, uid)` con: `join(profile)`, `leave()`, `watch(onState)`. `onState({ waiting: n, room: code | null })`. Quando questo telefono è l'organizzatore e `nextGroup` non è null: `createQuickRoom`, poi una transazione su `queue/{u}/room` per ogni membro del gruppo (riesce solo se vuoto); i membri non riusciti si ignorano.
  - Chi vede `room` impostato smette di guardare la coda e restituisce il codice; se entro `JOIN_WAIT_MS` non riesce a entrare (stanza sparita), cancella `room` dalla propria voce e torna in coda.

- [ ] **Step 1: Write the failing tests**: pure: `organizer` e `nextGroup` con code di 1, 3, 4, 6 voci e tempi diversi (`nextGroup` con 3 voci e la più vecchia a 19 s: `null`; a 21 s: le 3). Emulatore (con `waitMs` corto, 2 s): 4 telefoni in coda finiscono tutti nella stessa stanza e nessuno in due; 6 telefoni: una stanza da 4, 2 restano in coda; 1 telefono: dopo l'attesa una stanza con lui solo (i robot li aggiunge il Task 5); due telefoni che organizzano insieme (forzando `organizer` su entrambi): nessuno in due stanze.
- [ ] **Step 2: Run** `npm run test:rules` e `npm run test:room` (con Java nel PATH). Expected: i nuovi FAIL.
- [ ] **Step 3: Implement** `src/engine/coda.js`.
- [ ] **Step 4: Run** gli stessi comandi. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Partita veloce: coda con organizzatore e assegnazione senza doppioni"`

### Task 5: Interfaccia e collegamento

**Files:**
- Modify: `src/screens/Avvisi.js` (`OnlineSheet`: terza scelta; schermata `Cerco`), `src/App.js`, `src/screens/Lobby.js`, `src/screens/Play.js`, `src/screens/Review.js`, `src/screens/Round.js`, `src/screens/Finale.js`, `src/screens/Statistiche.js`
- Create: un componente `BotTag` in `src/ui/kit.js` (pillola "robot")

**Interfaces:**
- Consumes: Task 3, Task 4, `track`/`setLive` di `src/stats.js`.

Comportamento:
- `OnlineSheet`: terza scelta "Partita veloce" con la riga "Ti mettiamo con altri giocatori. Se mancano, completano i robot." Serve il nome (`needName`) e la rete (`needNet`).
- Schermata di ricerca (vista `cerco` in App): "Cerco giocatori…", "Trovati N su 4", dopo 20 s "Completo con i robot"; pulsante "Annulla" che lascia la coda e torna alla home. Presenza dal vivo `coda`.
- Quando la coda dà un codice: `joinRoom`, poi `enterRoom`. L'host della stanza veloce, appena dentro: aspetta gli assegnati fino a `JOIN_WAIT_MS` (o finché sono tutti in stanza), poi `addBots(code, 4 - giocatori)` se servono e `startGame`; `track('partite_veloci')` e il conteggio di `partite_online` già esistente.
- Robot: su ogni telefono, in una stanza `quick` con robot, un effetto ogni 500 ms chiama `driveBots` se `shouldDriveBots`; carica il dizionario con `loadDictionary()` solo in quel caso.
- Etichetta: `BotTag` accanto al nome dei giocatori `bot: true` in lobby, nella striscia della partita, in correzione, nel fine round, nei premi e sul podio.
- `giocatori_online` contato solo dai telefoni umani (già così: ogni telefono conta sé stesso).
- `/statistiche`: riga "Partite veloci" e "In coda" nei riquadri dal vivo.

- [ ] **Step 1: Implement** pannello, schermata di ricerca e collegamento in App.
- [ ] **Step 2: Verify** con Playwright sul server di sviluppo e l'emulatore (`app-3100`, `sh scripts/emulatore.sh`): 2 contesti cercano partita, finiscono nella stessa stanza, dopo l'attesa entrano 2 robot con l'etichetta, la partita parte da sola e arriva al podio; 1 contesto da solo: partita con 3 robot; "Annulla" toglie dalla coda (controllo `queue/` sull'emulatore). Screenshot di pannello, ricerca, lobby con robot, partita, podio.
- [ ] **Step 3: Implement** etichette e statistiche; **Verify** che `/statistiche` mostri "In coda" e "Partite veloci".
- [ ] **Step 4: Run** `npm run test:rules`, `npm run test:room` (con Java), `CI=true npm run build`, `python3 scripts/prova-offline.py` (emulatore acceso). Expected: tutto PASS.
- [ ] **Step 5: Commit** `git commit -m "Partita veloce: pannello, ricerca, robot con etichetta e statistiche"`

### Task 6: Verifica finale

- [ ] **Step 1: Run** tutte le suite e la build; `controlla-testi.py` e `audit-design.py` su `/` e `/statistiche` a 360, 390 e 1440. Expected: zero problemi di testo, zero errori di design.
- [ ] **Step 2: Verify** una partita tra amici normale a 4 telefoni (script del pacchetto di revisione copiato nella scratchpad, come il 21 ottobre): 35 schermate su 35, nessun robot.
- [ ] **Step 3: Verify** il passaggio dei robot: partita veloce con 2 contesti, l'host va offline durante il round, i robot continuano.
- [ ] **Step 4: Report** a Edoardo, con l'ordine di pubblicazione: prima `firebase deploy --only database`, poi `vercel deploy --prod`.
