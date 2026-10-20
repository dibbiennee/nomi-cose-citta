# Gioca da solo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una modalità "Gioca da solo" contro robot in quattro difficoltà, che funziona dall'apertura al podio anche senza internet.

**Architecture:** Un motore locale (`createSoloEngine`) con gli stessi nomi di metodo e la stessa forma di stato `room` del motore online, così `Spin`, `Play`, `Review`, `Round`, `Finale` si riusano. Robot, dizionario e record sono funzioni pure in `src/solo/`, provate con `node --test`. Il service worker passa da "solo pagina offline" a "gioco intero in memoria", con apertura che chiede prima alla rete (3 secondi al massimo).

**Tech Stack:** React 18 (create-react-app), JavaScript ES modules, `node --test`, service worker scritto a mano, Playwright per Python (già installato) per la prova offline.

**Spec:** `docs/superpowers/specs/2026-10-21-gioca-da-solo-design.md`

## Global Constraints

- `src/engine/rules.js` non si modifica. `src/engine/room.js` non cambia comportamento.
- `npm run test:rules` e `npm run test:room` (13 test, emulatore, serve `PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`) devono passare a ogni commit che tocca codice condiviso.
- Nessuna nuova dipendenza npm.
- "Gioca da solo" non chiama Firebase in nessun punto.
- Categorie della modalità: le otto di `DEFAULT_CATEGORIES` (`nomi, cose, citta, animali, cibi, mestieri, film, calciatori`), niente categorie inventate.
- Robot: da 1 a 5, predefiniti 3. Mai nelle stanze online.
- Record conta solo con almeno 3 categorie e almeno 2 robot. Partita a metà da più di 12 ore: scartata, non conta.
- Testi in italiano, mai il trattino lungo, a capo per unità di senso (`&nbsp;` dove serve). Stile da `.claude/design.md`: inchiostro `#17122B`, bordo 2.5px, ombra netta, aree di tocco ≥ 44px.
- Prima di dire finito: `python3 ~/.claude/skills/tipografia-web/scripts/controlla-testi.py` e `python3 ~/.claude/skills/design-web/scripts/audit-design.py` a zero errori sulla build.
- Niente deploy: lo fa Edoardo quando lo chiede.

## Review Focus

1. **Lettere difficili attive (`hard: false`)**: H, J, K, Q, W, X, Y possono uscire. Il dizionario può avere poche parole lì; i robot devono lasciare la casella vuota invece di bloccarsi o scrivere parole con la lettera sbagliata. Test in Task 3.
2. **Nome del giocatore uguale a un nome robot o vuoto**: nessun robot deve chiamarsi come il giocatore (confronto con `normalize`). Test in Task 3.
3. **Giocatore che preme STOP mentre i robot stanno scrivendo**: i robot consegnano solo le parole già "scritte" a quell'istante, nessuna dopo. Test in Task 5.
4. **App riaperta dopo ore a metà round con tempo scaduto**: si va in correzione, non si resta bloccati in `play`; oltre 12 ore la partita sparisce e non tocca i record. Test in Task 5.
5. **Storage pieno o assente** (navigazione privata): partita e record non devono rompere il gioco; si gioca, solo non si salva. Test in Task 4 e Task 5.

---

### Task 1: Indice del dizionario

**Files:**
- Create: `src/solo/dizionario.js`
- Test: `src/solo/dizionario.test.mjs`
- Modify: `package.json` (aggiungere i nuovi file `.test.mjs` di `src/solo/` a `test:rules`)

**Interfaces:**
- Produces:
  - Formato di una lista di parole (una per categoria): `{ [lettera]: Array<[parola: string, rarità: 0|1|2]> }`, lettere maiuscole A–Z; 0 = comune, 1 = media, 2 = rara.
  - `createDictionary(lists: { [catKey]: Lista }) -> Dictionary`
  - `Dictionary.has(catKey, text) -> boolean`: vero se `normalize(text)` è nella lista della categoria (qualsiasi lettera).
  - `Dictionary.pick(catKey, letter, weights: [number, number, number], random, exclude: Set<string>) -> string | null`: sceglie prima la rarità coi pesi, poi una parola a caso di quella rarità con iniziale `letter` non in `exclude` (normalizzate). Se quella rarità è vuota ripiega sulle altre; `null` se non c'è niente.
  - `Dictionary.wrong(catKey, letter, random) -> string | null`: una parola vera della categoria che NON comincia con `letter` (serve agli errori dei robot facili).

- [ ] **Step 1: Write the failing tests** con una lista di prova scritta nel test:
  - `has` ignora accenti, maiuscole e spazi: `has('citta', '  ROMA ')` vero, `has('citta', 'Rome')` falso, `has('nomi', 'Roma')` falso.
  - `pick` rispetta la lettera (1000 estrazioni, tutte cominciano con `M` secondo `startsWithLetter` di `rules.js`).
  - `pick` coi pesi `[0,0,1]` restituisce solo parole di rarità 2 quando esistono, e ripiega su altre rarità quando la 2 è vuota.
  - `pick` non restituisce parole in `exclude`; restituisce `null` per una lettera senza parole.
  - `wrong('citta','M')` restituisce una città che non comincia per M.
- [ ] **Step 2: Run** `node --test src/solo/dizionario.test.mjs`. Expected: FAIL, modulo mancante.
- [ ] **Step 3: Implement** `createDictionary` in `src/solo/dizionario.js`, usando `normalize` e `startsWithLetter` da `../engine/rules.js`. `random` sempre iniettato.
- [ ] **Step 4: Run** `node --test src/solo/dizionario.test.mjs`. Expected: PASS. Aggiungere `src/solo/*.test.mjs` a `test:rules` e lanciare `npm run test:rules`: tutto PASS.
- [ ] **Step 5: Commit** `git commit -m "Gioca da solo: indice del dizionario"`

### Task 2: Le parole (8 categorie)

**Files:**
- Create: `src/solo/parole/nomi.js`, `cose.js`, `citta.js`, `animali.js`, `cibi.js`, `mestieri.js`, `film.js`, `calciatori.js` (ognuno `export default { A: [...], ... }` nel formato del Task 1)
- Create: `src/solo/parole/index.js` con `export const LISTE = { nomi, cose, citta, animali, cibi, mestieri, film, calciatori }`
- Test: `src/solo/parole.test.mjs`

**Interfaces:**
- Consumes: formato lista e `createDictionary` del Task 1.
- Produces: `LISTE` (importata con `import()` dinamico dal Task 7, così finisce in un file a parte e non pesa sull'avvio).

Quantità: per ogni categoria, per ognuna delle 19 lettere non difficili (`ABCDEFGILMNOPRSTUVZ`) almeno 12 parole, con almeno 3 comuni, 3 medie, 3 rare; per le lettere difficili (H J K Q W X Y) quello che esiste davvero, anche zero. Regole di grafia dalla spec: calciatori col cognome e, quando è la forma conosciuta, anche nome e cognome (ognuno sotto la sua iniziale), famosi di ieri e di oggi; film col titolo italiano d'uscita più l'originale quando è quello conosciuto, articoli compresi come si scrivono. Niente parole volgari, offensive o su persone private.

- [ ] **Step 1: Write the failing test** `parole.test.mjs`: per ogni categoria e lettera, ogni parola comincia con la lettera sotto cui sta (`startsWithLetter`); rarità ∈ {0,1,2}; nessun doppione normalizzato dentro una categoria; minimi di quantità sopra rispettati sulle 19 lettere; nessuna parola in una piccola lista di parole vietate scritta nel test; dimensione totale di `JSON.stringify(LISTE)` sotto 400 000 caratteri.
- [ ] **Step 2: Run** `node --test src/solo/parole.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Write the eight lists.**
- [ ] **Step 4: Run** `node --test src/solo/parole.test.mjs`. Expected: PASS. Stampare la dimensione misurata.
- [ ] **Step 5: Checkpoint con Edoardo.** Generare un campione leggibile (per ogni categoria 3 lettere a caso, tutte le parole con la rarità) in un file nella scratchpad e mandarglielo con SendUserFile. Correggere quello che segnala. Non si va al Task 3 senza il suo ok sul campione.
- [ ] **Step 6: Commit** `git commit -m "Gioca da solo: dizionario delle otto categorie"`

### Task 3: I robot

**Files:**
- Create: `src/solo/robot.js`
- Test: `src/solo/robot.test.mjs`

**Interfaces:**
- Consumes: `Dictionary` (Task 1).
- Produces:
  - `DIFFICULTIES = ['facile', 'medio', 'difficile', 'impossibile']`
  - `LEVELS: { [difficoltà]: { fill: [min, max], weights: [n,n,n], errorRate: number, wordGapMs: [min, max], stop: { chance: number, delayMs: [min, max] }, doubtRate: number } }` con questi valori di partenza (spec, tabella):
    - facile: fill `[0.4, 0.6]`, weights `[0.85, 0.15, 0]`, errorRate `0.15`, wordGapMs `[8000, 15000]`, stop chance `0.05` delay `[15000, 25000]`, doubtRate `0.1`
    - medio: fill `[0.7, 0.85]`, weights `[0.6, 0.35, 0.05]`, errorRate `0.05`, wordGapMs `[5000, 9000]`, stop chance `0.3` delay `[8000, 15000]`, doubtRate `0.25`
    - difficile: fill `[0.9, 1]`, weights `[0.25, 0.5, 0.25]`, errorRate `0.01`, wordGapMs `[3000, 5000]`, stop chance `0.8` delay `[1000, 3000]`, doubtRate `0.4`
    - impossibile: fill `[1, 1]`, weights `[0.05, 0.3, 0.65]`, errorRate `0`, wordGapMs `[600, 1200]`, stop chance `1` delay `[0, 500]`, doubtRate `0.55`
  - `BOT_NAMES`: almeno 40 nomi italiani comuni, maschili e femminili.
  - `makeBots(n: 1..5, playerName: string, random) -> Array<{ id: 'bot1'..'botN', name, face: 0..5, color: 0..5, quirk: number }>`: nomi diversi tra loro e da `playerName` (con `normalize`); `quirk` in `[-0.1, 0.1]` sposta fill e velocità del singolo robot.
  - `planBot(bot, catKeys, letter, level, dict, random, startMs) -> { writes: Array<{ at: number, cat: string, word: string }>, stopAt: number | null }`: sceglie quante caselle riempire (fill + quirk), in che ordine, quale parola (`dict.pick` con `exclude` = parole già scelte da quel robot), con probabilità `errorRate` una parola sbagliata (`dict.wrong`); `at` crescenti a partire da `startMs` con intervalli in `wordGapMs`; `stopAt` solo se ha riempito tutte le caselle e la prova su `stop.chance` riesce, uguale all'ultima `at` + un ritardo in `delayMs`. Casella senza parole disponibili (lettere difficili): saltata.
  - `botVote(level, { known: boolean, wrongLetter: boolean, authorIsBot: boolean, botError: boolean }, random) -> boolean` (true = "Non vale"): mai su parole `known` con lettera giusta; sempre su `botError`; sulle parole del giocatore non conosciute vota contro con probabilità `doubtRate`.

- [ ] **Step 1: Write the failing tests** (`random` con seme fisso, dizionario di prova):
  - `makeBots(5, 'Giulia')` non contiene "Giulia" né "giulia", 5 nomi diversi; `makeBots(3, '')` funziona.
  - Su 200 piani `facile` con 8 categorie, la media di caselle riempite sta tra 0.4 e 0.6 delle categorie; `impossibile` riempie sempre tutto quando il dizionario ha parole.
  - `impossibile`: ultima `at - startMs` sotto 10 000 ms con 8 categorie; `facile`: primo `at - startMs` almeno 8000 × (1 - 0.1).
  - `facile` non ha mai `stopAt` se non ha riempito tutto; `impossibile` ha sempre `stopAt`.
  - Lettera senza parole nel dizionario: `writes` vuoto per quella categoria, nessuna parola con lettera sbagliata a parte gli errori voluti; con `errorRate 0` nessuna parola sbagliata.
  - Nessun robot scrive la stessa parola in due categorie.
  - `botVote` con `known: true, wrongLetter: false` è sempre false su 1000 prove per ogni livello; con `botError: true` sempre true.
- [ ] **Step 2: Run** `node --test src/solo/robot.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/solo/robot.js`.
- [ ] **Step 4: Run** `npm run test:rules`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Gioca da solo: robot calibrati sulle quattro difficoltà"`

### Task 4: Record sul telefono

**Files:**
- Create: `src/solo/record.js`
- Test: `src/solo/record.test.mjs`

**Interfaces:**
- Produces:
  - `RECORD_KEY = 'ncc-solo-record'`
  - `countsForRecord(settings: { cats: Array, }, botCount: number) -> boolean`: `cats.length >= 3 && botCount >= 2`.
  - `pointsPerWord(total: number, catCount: number, rounds: number) -> number`: `Math.round(total / (catCount * rounds) * 10) / 10`.
  - `createRecordStore(storage) -> { get(difficulty) -> { migliore: number | null, giocate: number, vinte: number }, save(difficulty, { ppw: number, won: boolean }) -> { beaten: boolean } }`: lo storage tiene un solo JSON `{ [difficoltà]: { migliore, giocate, vinte } }`; storage assente, che dà errore o JSON rotto: `get` restituisce i valori vuoti e `save` non lancia.
  - Formattazione per l'interfaccia: `formatPpw(n) -> string` con la virgola, es. `13.4 -> "13,4"`.

- [ ] **Step 1: Write the failing tests**: `pointsPerWord(402, 5, 6) === 13.4`; `countsForRecord` vero con 3 categorie e 2 robot, falso con 2 categorie o 1 robot; primo `save` fa `beaten: true`, uno peggiore `false`, `giocate` e `vinte` crescono; un secondo store sullo stesso storage legge gli stessi valori; storage `null` e storage che lancia: nessun errore, `get` vuoto; JSON rotto nello storage: `get` vuoto e il `save` successivo lo sostituisce.
- [ ] **Step 2: Run** `node --test src/solo/record.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/solo/record.js` (stesso stile di `createFounderStore` in `src/club/fondatore.js`).
- [ ] **Step 4: Run** `npm run test:rules`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Gioca da solo: record per difficoltà"`

### Task 5: Motore della partita da soli

**Files:**
- Create: `src/solo/motore.js`
- Test: `src/solo/motore.test.mjs`

**Interfaces:**
- Consumes: `planBot`, `botVote`, `makeBots`, `LEVELS` (Task 3); `Dictionary` (Task 1); `scoreRound`, `pickLetter`, `sanitizeSettings`, `computeAwards`, `ranking` da `rules.js`; `SPIN_MS`, `COUNTDOWN_MS`, `STOP_GRACE_MS` da `room.js`.
- Produces:
  - `SOLO_CODE = 'SOLO'`, `SOLO_KEY = 'ncc-solo-partita'`, `MAX_AGE_MS = 12 * 3600 * 1000`
  - `createSoloEngine({ profile, settings, difficulty, botCount, dict, storage, random = Math.random, clock = Date.now }) -> SoloEngine`
  - `resumeSoloEngine({ dict, storage, random, clock }) -> SoloEngine | null`: rilegge `SOLO_KEY`; `null` se manca, è rotta o ha `savedAt` più vecchio di `MAX_AGE_MS` (e in quel caso la cancella).
  - `SoloEngine` ha gli stessi nomi del motore online usati dall'app, tutti asincroni come là (restituiscono Promise), col parametro `code` accettato e ignorato: `uid` (`'me'`), `now()`, `subscribe(code, onChange) -> off`, `startGame`, `goPlay`, `saveAnswers(code, answers)`, `pressStop(code, answers)`, `timeUp`, `finishStop`, `vote(code, catKey, targetId, against)`, `react` (nessun effetto), `nextCategory`, `nextRound`, `showPodium`, `rematch`, `backToLobby`, `leaveRoom` (cancella `SOLO_KEY`), `forget`, `updateSettings(code, settings)`, `kickPlayer` (nessun effetto). In più: `difficulty`, `botCount`, `tick()` e `result() -> { ppw: number, won: boolean, counts: boolean } | null` (non null solo con `status === 'final'`).
  - Stato emesso a `onChange`, stessa forma di `rooms/CODICE` (vedi commento in testa a `room.js`): `hostId: 'me'`, `status`, `settings`, `players` (`me` + robot, con `score`, `stats`, `joinedAt` crescente: `me` primo), `presence` tutti `true`, `round`, `answers`, `votes`, più `solo: { difficulty, known: { [catKey]: { [playerId]: true } } }` riempito all'inizio della correzione con le parole che il dizionario conosce e che hanno la lettera giusta.
- Comportamento da rispettare:
  - `startGame`: estrae la lettera (`pickLetter` su `round.used`, `settings.hard`), `startsAt = now + SPIN_MS + COUNTDOWN_MS`, `endsAt = settings.timer ? startsAt + timer*1000 : 0`, prepara i piani dei robot con `startMs = startsAt`; status `spin`.
  - `tick()` (chiamata dall'app ogni 200 ms e da ogni metodo): applica le scritture dei robot con `at <= now`, aggiorna "può fermare"; se un robot raggiunge `stopAt` fa lo STOP come `pressStop` (`stoppedBy` = id del robot, `stats.stops + 1`).
  - STOP (di chiunque) o `timeUp`: le scritture dei robot dopo quell'istante non si applicano mai; status `review`, `reviewIdx 0`; i robot votano subito su ogni parola degli altri con `botVote`. I voti contro le parole `known` si scartano sempre, anche quelli del giocatore (così `scoreRound` di `rules.js`, invariato, non le boccia mai).
  - `vote` del giocatore su una parola `known`: ignorato.
  - `nextCategory` sull'ultima: calcola `scoreRound`, somma i punti, status `round`. `nextRound` o `showPodium` come nel motore online (`awards` poi `final`). `rematch`: punteggi azzerati, nuovo `startGame`. `backToLobby`: status `lobby` (l'app mostra le impostazioni da soli).
  - Ogni cambio di stato si salva in `SOLO_KEY` come `{ savedAt, state, plans, difficulty, botCount, profile }`; errori dello storage ignorati.
  - Alla ripresa: se `status === 'play'` e `endsAt` è passato, va in `review` come `timeUp`; se `status === 'spin'` e `startsAt` è passato, va in `play`.
  - `result()`: `ppw = pointsPerWord(score di me, cats.length, rounds)`, `won` = nessun robot con punteggio più alto, `counts = countsForRecord(settings, botCount)`.

- [ ] **Step 1: Write the failing tests** con orologio finto (`let t = 0; clock = () => t`), `random` con seme, dizionario di prova:
  - partita intera `impossibile`, 2 categorie, 1 round: spin → play al passare di `startsAt` con `goPlay`, i robot scrivono man mano con `tick`, un robot fa STOP, review con voti dei robot, round, awards, final; `result().counts` falso con 2 categorie.
  - Review Focus 3: il giocatore fa `pressStop` a `startsAt + 1000`; nessuna risposta dei robot ha parole con `at` successivo.
  - parola del giocatore nel dizionario: dopo i voti dei robot e un `vote(..., 'me'...)` del giocatore su una parola `known` di un robot, `scoreRound` dà a quelle parole stato diverso da `rejected`; `solo.known` le contiene.
  - Review Focus 4: stato salvato a metà `play`, orologio avanti oltre `endsAt`, `resumeSoloEngine` → `status === 'review'`; orologio avanti di 13 ore → `resumeSoloEngine` restituisce `null` e `SOLO_KEY` non c'è più.
  - Review Focus 5: con storage che lancia a ogni chiamata la partita intera arriva a `final` senza errori.
  - `leaveRoom` cancella `SOLO_KEY`.
  - Il modulo non importa niente da `firebase/` direttamente e non chiama `getEngine` (controllo sul sorgente, come in `src/club/fondatore.test.mjs`).
- [ ] **Step 2: Run** `node --test src/solo/motore.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/solo/motore.js`.
- [ ] **Step 4: Run** `npm run test:rules` e `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`. Expected: tutto PASS (room.js invariato).
- [ ] **Step 5: Commit** `git commit -m "Gioca da solo: motore locale con robot, correzione e ripresa"`

### Task 6: La home non aspetta più Firebase

**Files:**
- Modify: `src/App.js` (effetto "Accesso anonimo, poi il percorso iniziale", `needName`/`joinWith`, `onCreate`)
- Modify: `src/screens/Avvisi.js` (`ErrorScreen`, caso `offline`)

**Interfaces:**
- Produces: in `App`, `engine` può restare `null` mentre la home è visibile; costante di testo `NEED_NET = 'Per giocare con gli amici serve internet. Puoi giocare da solo contro i robot.'` usata da toast e da `ErrorScreen`.

Comportamento:
- All'avvio senza `/r/CODICE` nel percorso: `setView('home')` subito; `getEngine()` continua in sottofondo e, se fallisce, riprova quando torna la rete (`window` evento `online`), senza mostrare errori in home.
- "Crea una stanza" o "Entra" con `engine === null`: toast `NEED_NET`, nessuna navigazione.
- Link `/r/CODICE` senza rete: `ErrorScreen` `offline` con il testo `NEED_NET` e due pulsanti: "Gioca da solo" (apre la scelta della difficoltà del Task 7) e "Torna alla home".
- Con rete, tutto come oggi: un link `/r/CODICE` mostra il caricamento finché c'è il motore.

- [ ] **Step 1: Verify current behavior** con l'app in sviluppo (server `app-3100` di `.claude/launch.json` più `sh scripts/emulatore.sh` lanciato da Bash in background) e la rete spenta nel browser del pannello (`javascript_tool`: non disponibile; usare Playwright per Python con `context.set_offline(True)` dopo il primo caricamento): la home oggi resta sul caricamento o va in errore. Annotare cosa succede.
- [ ] **Step 2: Implement** le modifiche sopra.
- [ ] **Step 3: Verify** con lo stesso script: offline la home compare entro 1 secondo, "Crea una stanza" mostra il toast `NEED_NET`, `/r/ABCD` offline mostra l'errore con i due pulsanti; online una stanza si crea e un secondo contesto entra col codice.
- [ ] **Step 4: Run** `npm run test:rules`, `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`, `CI=true npm run build`. Expected: tutto PASS, build senza avvisi.
- [ ] **Step 5: Commit** `git commit -m "La home compare subito anche senza rete; le stanze dicono che serve internet"`

### Task 7: Interfaccia della partita da soli

**Files:**
- Create: `src/screens/Solo.js` (scelta difficoltà e impostazioni)
- Modify: `src/screens/Home.js` (pulsante "Gioca da solo")
- Modify: `src/App.js` (motore attivo, viste, ripresa)
- Modify: `src/screens/Review.js` (parole `known`)
- Modify: `src/screens/Finale.js` (record sul podio, pulsanti in modalità da soli)

**Interfaces:**
- Consumes: `createSoloEngine`, `resumeSoloEngine`, `SOLO_CODE` (Task 5); `createRecordStore`, `formatPpw`, `countsForRecord` (Task 4); `DIFFICULTIES` (Task 3); `LISTE` con `import('./solo/parole')` e `createDictionary` (Task 1, 2).
- Produces:
  - `export default function Solo({ records, initial, onBack, onStart, toast })` in `src/screens/Solo.js`; `onStart({ difficulty, botCount, settings })`.
  - In `App`: stato `solo` (SoloEngine o `null`); `const active = solo || engine`; in modalità da soli `code = SOLO_CODE`, `view = 'room'`, percorso del browser che resta `/`.

Comportamento:
- **Home**: pulsante "Gioca da solo" tra "Crea una stanza" e "Ho un codice", stile del pulsante bianco di "Ho un codice" ma con sfondo lilla `#B79CFF`; "Crea una stanza" resta l'azione principale. Non serve il nome per giocare da soli (se vuoto, il giocatore si chiama "Tu").
- **Solo.js**: titolo "Gioca da solo"; le quattro difficoltà come scelte grandi, ognuna con una frase:
  - Facile: "Robot tranquilli: lasciano caselle vuote e a volte sbagliano."
  - Medio: "Riempiono quasi tutto, ogni tanto si copiano."
  - Difficile: "Veloci, parole meno ovvie, fermano presto."
  - Impossibile: "Tutto pieno in pochi secondi, parole rare."
  - sotto ciascuna, se c'è, il record scritto così: "Record 13,4 punti a parola, 3 vinte su 7".
  - poi: robot da 1 a 5 (predefinito 3), categorie (solo le otto, preset Veloce 3 / Classica 5 / Maratona 8, minimo 2), round, tempo, lettere difficili, riprendendo i controlli e lo stile di `Setup.js` (estrarre in un componente condiviso solo se evita di duplicare più di 30 righe; `Setup` deve restare identico per le stanze online).
  - se `!countsForRecord`, sopra il pulsante: "Con meno di 3 categorie o un solo robot la partita non conta per i record."
  - pulsante principale "Inizia la partita". Al tocco: carica le parole con `import()`, crea il motore, `startGame`.
- **App**: con `solo` attivo usa `active` ovunque oggi c'è `engine` per la stanza (iscrizione, orologio, risposte, passaggi automatici, `g`); niente `IdleNotice`, niente banner di connessione, niente `Lobby` (status `lobby` in modalità da soli mostra `Solo` con le impostazioni correnti). All'avvio, prima della home, `resumeSoloEngine`: se restituisce un motore, si rientra direttamente nella partita. "Torna alla home" e l'uscita confermata chiamano `leaveRoom` e azzerano `solo`. A `final`, una volta sola: se `result().counts`, `createRecordStore(localStorage).save(difficulty, result())`, e il valore `beaten` va a `Finale`.
- **Review**: per una parola in `room.solo.known[cat][id]`, al posto del pulsante "Non vale" una pillola menta `#6EE7A8` con scritto "Nel dizionario"; il testo sui voti che servono non compare in modalità da soli.
- **Finale (podio)**: in modalità da soli, sotto il podio, se il record è battuto "Nuovo record: 13,4 punti a parola" (unica celebrazione, con l'animazione d'entrata già esistente); altrimenti, se conta, "Record 14,1 punti a parola". "Cambia categorie e round" porta a `Solo`.

- [ ] **Step 1: Implement** Home, Solo.js e il collegamento in App fino a una partita che arriva a `spin`.
- [ ] **Step 2: Verify** nel browser (app in sviluppo, 390×844 e 360×780): home con il nuovo pulsante; scelta di Facile, 3 robot, 3 categorie; partenza della lettera.
- [ ] **Step 3: Implement** Review e Finale come sopra, e la ripresa all'avvio.
- [ ] **Step 4: Verify** nel browser una partita intera per ciascuna delle quattro difficoltà (3 categorie, 1 round, timer 60 s): i robot scrivono man mano, a Impossibile fermano in pochi secondi, a Facile non fermano; in correzione le parole del dizionario mostrano "Nel dizionario"; il podio mostra il record. Ricaricare la pagina a metà `play`: si rientra nella partita. Screenshot di home, Solo, partita, correzione, podio.
- [ ] **Step 5: Run** `npm run test:rules`, `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`, `CI=true npm run build`; verificare nell'output di build che le parole siano in un file JS separato da `main`. Expected: tutto PASS.
- [ ] **Step 6: Commit** `git commit -m "Gioca da solo: scelta della difficoltà, partita contro i robot, record sul podio"`

### Task 8: Il gioco resta sul telefono (service worker)

**Files:**
- Modify: `public/sw.js`
- Create: `scripts/prova-offline.py` (prova con Playwright per Python)

**Interfaces:**
- Consumes: `asset-manifest.json` che CRA scrive nella build (`files` e `entrypoints`).

Comportamento:
- `install`: legge `/asset-manifest.json` e mette in una cache `ncc-app-<hash del manifest>` tutti i file elencati in `files` (JS, CSS, font, il file delle parole) più `/`, `/index.html`, `/manifest.webmanifest`, le icone e `/offline.html`. Un file che non si scarica non blocca l'installazione degli altri.
- `activate`: cancella le cache `ncc-app-*` vecchie, `clients.claim()`.
- Apertura delle pagine (`mode === 'navigate'`): prima la rete con `cache: 'no-cache'`, attesa massima 3000 ms; se fallisce o scade, `index.html` dalla cache (per qualsiasi percorso, così anche `/r/CODICE` apre l'app, che poi dice che serve internet); se manca anche quello, `offline.html` (ricostruito come risposta nuova, come oggi).
- File in `/static/`: prima la cache, poi la rete (hanno il nome che cambia a ogni versione).
- Tutto il resto (Firebase, altri domini): non toccato.
- La registrazione in `src/index.js` resta com'è (solo produzione, non con `REACT_APP_EMULATOR=1`).

- [ ] **Step 1: Write the failing check** `scripts/prova-offline.py`: costruisce con le variabili di `.env.development` in `build-prova`, serve con `python3 -m http.server` (non `npx serve`, che ridireziona), registra il service worker a mano come nella prova del 21 ottobre (la build verso l'emulatore non lo registra da sola), ricarica, spegne il server, poi controlla: `/` mostra la home del gioco (non `offline.html`), "Gioca da solo" porta a una partita fino a `spin`, `/r/ABCD` mostra l'errore con `NEED_NET`. Alla fine cancella `build-prova`.
- [ ] **Step 2: Run** `python3 scripts/prova-offline.py`. Expected: FAIL (oggi offline compare solo `offline.html`).
- [ ] **Step 3: Implement** `public/sw.js`.
- [ ] **Step 4: Run** `python3 scripts/prova-offline.py`. Expected: PASS. Poi, con il server acceso: pubblicare una seconda build con un testo diverso nella home e verificare che una sola riapertura con rete mostri già la versione nuova (prima la rete).
- [ ] **Step 5: Commit** `git commit -m "Il gioco resta sul telefono e si apre anche senza rete"`

### Task 9: Verifica finale

**Files:** nessuno nuovo (solo correzioni se qualcosa non passa).

- [ ] **Step 1: Run** `npm run test:rules`, `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:room`, `CI=true npm run build`, `python3 scripts/prova-offline.py`. Expected: tutto PASS; riportare peso di `main` e del file delle parole compressi.
- [ ] **Step 2: Run** su una build servita (variabili di `.env.development`) `python3 ~/.claude/skills/tipografia-web/scripts/controlla-testi.py <url> / --larghezze 360 390 1440` e `python3 ~/.claude/skills/design-web/scripts/audit-design.py <url> / --larghezze 390 1440`. Expected: zero problemi di testo, zero errori di design; riportare gli avvisi.
- [ ] **Step 3: Verify** che una partita online a due telefoni (due contesti, emulatore) funzioni come prima: crea, entra, gioca un round, podio.
- [ ] **Step 4: Report** a Edoardo: cosa è stato fatto, risultati veri dei comandi, screenshot delle schermate nuove, limiti aperti (iPhone: offline davvero solo dall'icona sulla Home; record solo su questo telefono fino al progetto 2). Niente deploy.
