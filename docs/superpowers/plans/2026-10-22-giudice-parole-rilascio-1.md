# Giudice delle parole, rilascio 1: dizionario che protegge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una parola che il dizionario riconosce (categoria e lettera giuste) non si può togliere votando; le altre si votano come oggi.

**Architecture:** Un modulo puro `src/giudice/protezione.js` (nessun `window`) decide cosa è protetto e toglie i voti contro le risposte protette. Lo usano in modo identico il punteggio (`honestVotes` in `src/engine/room.js`) e la schermata del voto (`src/screens/Review.js`). Il dizionario sta in liste caricate con `import()` all'ingresso nella stanza. Nessun dato nuovo nel database, nessuna regola nuova.

**Tech Stack:** React (CRA), `node --test`, emulatore Firebase.

**Spec:** `docs/superpowers/specs/2026-10-22-giudice-parole-design.md`

## Global Constraints

- `src/engine/rules.js` non si tocca. Il punteggio resta identico.
- Italiano, mai il trattino lungo, a capo per unità di senso. Stile `.claude/design.md`, aree di tocco 44×44, responsive fino a 360px.
- Protezione solo per le 8 categorie del gioco, per chiave: `nomi`, `cose`, `citta`, `animali`, `cibi`, `mestieri`, `film`, `calciatori` (`DEFAULT_CATEGORIES`). Le categorie inventate (chiave `x...`) mai.
- Confronto esatto dopo `normalize` (maiuscole, accenti, spazi). Niente plurali né refusi. La lettera del round deve combaciare (`startsWithLetter`).
- Nel dubbio si vota come oggi: dizionario non caricato, categoria sconosciuta o parola assente → nessuna protezione. Mai una parola bocciata in più di prima.
- Il dizionario non contiene parole sbagliate: meglio piccolo e pulito che grande. Peso massimo 400 KB compressi per tutte le liste (da misurare con la build). Fonti in `docs/dizionario-fonti.md`.
- L'etichetta "nel dizionario" compare solo nelle stanze online. La partita da soli resta com'è (`room.solo.known`).
- Nessuna API a pagamento per costruire il dizionario: si compila qui, con script e revisori nella sessione.

## Review Focus

- Due voti d'accordo in una stanza da tre contro "Aquila" per la A tra gli Animali: la parola resta valida e il punteggio non cambia.
- Schermo e punteggio d'accordo: la riga protetta non mostra "bocciata" quando l'host assegna i punti.
- Dizionario non ancora caricato al momento del voto: si vota come oggi, nessun errore.
- Categoria inventata con chiave che coincide con una del gioco: non deve diventare protetta se non è una delle 8 (chiavi `x...` mai).
- Parola nel dizionario ma in un'altra categoria ("Lampada" tra gli Animali, o "Catania" nei Nomi): non protetta.
- Partita veloce con robot e partita da soli: comportamento invariato.

---

### Task 1: Modulo di protezione (puro)

**Files:**
- Create: `src/giudice/protezione.js`, `src/giudice/protezione.test.mjs`
- Modify: `package.json` (aggiungere `src/giudice/*.test.mjs` a `test:rules`)

**Interfaces:**
- Produces in `protezione.js`:
  - `CATEGORIE_PROTETTE: string[]` (le 8 chiavi).
  - `creaDizionario(liste: Record<string, string[]>): { ha(cat: string, text: string, letter: string): boolean }`: `liste[cat]` è un array di parole; `ha` è vero solo se la categoria è una delle 8, la parola normalizzata è nell'elenco e inizia con `letter`.
  - `impostaDizionario(d | null): void` e `dizionarioPronto(): boolean`: tengono il dizionario caricato per il modulo.
  - `isProtetta(cat, text, letter): boolean`: usa il dizionario impostato; falso se non c'è.
  - `senzaVotiProtetti(votes, answers, letter): votes`: `votes = { [cat]: { [targetId]: { [voterId]: true } } }`, `answers = { [playerId]: { [cat]: text } }`. Ritorna una copia dove i voti contro risposte protette sono tolti; non modifica l'originale.
  - `caricaDizionario(): Promise<boolean>`: `import('./liste/index.js')`, imposta il dizionario, riprova una volta se fallisce; ritorna se è pronto.

- [ ] **Step 1: Write the failing test** `src/giudice/protezione.test.mjs`: `creaDizionario({animali:['Aquila','Cane'], citta:['Catania']})`:
  - `ha('animali','aquila','A') === true` (maiuscole), `ha('animali','Àquila','A')` vero (accenti), `ha('animali','Aquila','B')` falso (lettera), `ha('citta','Aquila','A')` falso (altra categoria), `ha('animali','Aquilone','A')` falso, `ha('xabc','Aquila','A')` falso (categoria inventata), `ha('citta','Catania','C')` vero.
  - Senza `impostaDizionario`, `isProtetta('animali','Aquila','A') === false`, `dizionarioPronto() === false`.
  - `senzaVotiProtetti` con 3 giocatori: `votes.animali.p1 = {p2:true,p3:true}` contro "Aquila" protetta: nella copia `votes.animali.p1` non ha voti; un voto contro una risposta non protetta resta; l'originale non cambia.
  - Una categoria assente in `answers` o `votes` non dà errore.
- [ ] **Step 2: Run** `node --test src/giudice/protezione.test.mjs` → FAIL (modulo mancante).
- [ ] **Step 3: Implement** il modulo con `normalize` e `startsWithLetter` di `../engine/rules.js` (insiemi per categoria, copia dei voti con `JSON.parse(JSON.stringify(...))`). Creare anche `src/giudice/liste/index.js` che esporta `LISTE = { nomi:[...], ... }` con, per ora, le parole delle liste dei robot (`src/solo/parole/*.js`, solo il testo di ogni voce, tutte le lettere).
- [ ] **Step 4: Run** il test → PASS; `npm run test:rules` → verde.
- [ ] **Step 5: Commit** `Giudice: modulo di protezione delle parole`.

---

### Task 2: Integrazione in punteggio e schermata del voto

**Files:**
- Modify: `src/engine/room.js` (`honestVotes`), `src/screens/Review.js`, `src/App.js` (carica il dizionario all'ingresso nella stanza)
- Test: `src/engine/room.test.mjs` o un nuovo `src/engine/giudice.test.mjs` (emulatore), da aggiungere a `test:room`; `scripts/prova-giudice-voto.py` (Playwright a due telefoni)

**Interfaces:**
- Consumes: `senzaVotiProtetti`, `isProtetta`, `caricaDizionario`, `dizionarioPronto` dal Task 1.
- Produces: in `room.js`, `honestVotes(room, code)` ritorna i voti già senza quelli contro risposte protette (solo stanze non da soli); in `Review.js` la riga protetta ha `known = true` (stessa etichetta della partita da soli, con testo "nel dizionario" per le stanze online) e niente tasto "Non vale", e il conteggio "N su M per bocciarla" non compare.

- [ ] **Step 1: Write the failing tests**: (a) `src/engine/giudice.test.mjs` sull'emulatore: stanza di 3 telefoni, round in `review`, dizionario impostato con `impostaDizionario(creaDizionario({animali:['Aquila']}))`, due telefoni votano contro la risposta "Aquila" del terzo (lettera A): dopo `nextCategory` fino al fine round, i punti dell'autore sono quelli di una parola valida (10 o 20, non 0) e `status` non è `rejected`; la stessa prova con la parola "Aquilx" (assente) → bocciata come prima; con il dizionario non impostato la parola "Aquila" è bocciata come prima. (b) test della preparazione dei voti in `Review` non serve a parte; lo coprirà la prova nel browser.
- [ ] **Step 2: Run** `firebase emulators:exec --project demo-ncc --only auth,database "node --test --test-force-exit src/engine/giudice.test.mjs"` → FAIL (la parola protetta viene ancora bocciata).
- [ ] **Step 3: Implement**: `honestVotes` applica `senzaVotiProtetti(votes, room.answers, room.round.letter)` quando non è partita da soli e il dizionario è pronto; `Review.js` calcola le bocciature su `senzaVotiProtetti` e mostra l'etichetta; `App.js` chiama `caricaDizionario()` all'ingresso in una stanza online (lobby o partita veloce), non per la partita da soli.
- [ ] **Step 4: Run** il test del Task 2 → PASS; `npm run test:rules`, `npm run test:room`, `CI=true npm run build` → verdi.
- [ ] **Step 5: Prova nel browser** `scripts/prova-giudice-voto.py` (emulatore e dev server): due telefoni votano contro una parola vera in una stanza da tre; la riga mostra "nel dizionario" senza tasto; le parole assenti si possono ancora votare; nessun errore JS; nessun overflow a 360px.
- [ ] **Step 6: Commit** `Giudice: le parole del dizionario non si bocciano votando`.

---

### Task 3: Il dizionario vero

**Files:**
- Create: `scripts/compila-dizionario.mjs`, `docs/dizionario-fonti.md`, `src/giudice/liste/*.js` (una per categoria), `src/giudice/liste.test.mjs`
- Modify: `src/giudice/liste/index.js`

**Interfaces:**
- Consumes: la forma `LISTE` del Task 1.
- Produces: liste per categoria (array di stringhe ordinate, senza doppioni), con questi obiettivi indicativi: `citta` ≥ 7.000, `nomi` ≥ 600, `animali` ≥ 500, `cibi` ≥ 400, `mestieri` ≥ 300; `cose`, `film`, `calciatori` restano con le liste dei robot.

- [ ] **Step 1: Write the failing test** `src/giudice/liste.test.mjs`: per ogni categoria, nessun doppione dopo `normalize`, nessuna stringa vuota o con soli spazi, nessuna voce con caratteri di controllo, e per ogni voce `startsWithLetter(voce, voce[0])` vero (formato valido); le soglie minime indicative per `citta`, `nomi`, `animali`, `cibi`, `mestieri`; ogni voce delle liste dei robot compare ancora nel dizionario; un campione fisso di parole vere note (per esempio Catania, Reggio Emilia, Andrea, Quokka, Falegname, Tiramisù) è protetto, e uno di parole finte note (Blorfo, Zzzzzz, Pizzigolo) no.
- [ ] **Step 2: Run** il test → FAIL sulle soglie.
- [ ] **Step 3: Implement**: `scripts/compila-dizionario.mjs` unisce e pulisce le fonti. Le città: elenco dei comuni italiani dell'ISTAT scaricato dal sito (se non raggiungibile, si dice e si usa una lista compilata e controllata) più città del mondo note. Nomi, animali, cibi e mestieri: liste compilate qui da subagenti in parallelo (un subagente per categoria e per gruppo di lettere), ognuna **verificata da un secondo subagente indipendente** che toglie le voci dubbie. Voci dubbie o non verificate non entrano. `docs/dizionario-fonti.md` elenca fonti e come sono state controllate.
- [ ] **Step 4: Run** il test → PASS; `CI=true npm run build` e misura del peso compresso delle liste (≤ 400 KB totali): riportare il numero.
- [ ] **Step 5: Controllo a campione indipendente**: un revisore legge 60 voci a caso per categoria e segnala quelle sbagliate; se più dell'1% è sbagliato, la lista non entra finché non si pulisce.
- [ ] **Step 6: Commit** `Giudice: dizionario completo di categorie`.

---

### Task 4: Verifica finale

- [ ] **Step 1:** `npm run test:rules`, `npm run test:room`, `CI=true npm run build`, `scripts/prova-giudice-voto.py`, `scripts/prova-account.py`, `scripts/prova-offline.py`, `scripts/prova-ritorno.py`: tutto verde, numeri riportati.
- [ ] **Step 2:** Revisione indipendente dell'intero ramo con un subagent su modello più capace, con le righe di Review Focus; Critical e Important sistemati con prova che fallisce prima, minori nel registro.
- [ ] **Step 3:** Pubblicare: merge in `main`, push, `vercel deploy --prod` (nessuna regola del database cambia); controllo sul sito vero che il gioco si apra e il dizionario si carichi.
