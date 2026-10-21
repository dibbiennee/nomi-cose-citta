# Account, monete e negozio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account Google/email, monete guadagnate giocando, negozio di accessori visibili in partita, prodotti a soldi veri in vetrina con lista d'attesa, privacy e condizioni d'acquisto.

**Architecture:** L'identità anonima di oggi si collega a Google o a un'email (Firebase Auth `linkWithPopup` / link email). Il profilo sta in `users/{uid}` su Firebase, scritto dal telefono e vincolato dalle regole (aumenti limitati, spese al prezzo di catalogo); il catalogo vive in un file JS da cui uno script genera la parte di regole sui prezzi. Gli accessori sono SVG sovrapposti alla faccina e viaggiano nella stanza come campo `acc` del giocatore.

**Tech Stack:** React 18 (CRA), Firebase Auth + RTDB SDK 10, emulatore Auth/RTDB, `node --test`, Playwright per Python.

**Spec:** `docs/superpowers/specs/2026-10-21-account-monete-negozio-design.md`

## Global Constraints

- Monete: partita 5 base, +5 se vinci, +1 per parola unica fino a +10 (massimo 20); giornaliero 20 +10 per giorno consecutivo fino a 70; invito 200 + 200, massimo 20 inviti premiati; benvenuto 1000 ai primi 100 (con i 3 accessori esclusivi), 300 agli altri.
- Vetrina (non acquistabile): 500 monete 0,99 €, 1200 monete 1,99 €, 3500 monete 4,99 €, username di 3-4 caratteri 2,99 €.
- Username: unico, 5-14 caratteri `[a-z0-9_]` (confronto in minuscolo), scelto solo con l'account; chi ha l'account gioca con il proprio username.
- 12 accessori, prezzi 150-1500, un accessorio per tipo: `cappello`, `occhiali`, `vestito`, `cornice`.
- Senza account si gioca come oggi; monete solo con l'account.
- Regole con test sull'emulatore per ogni permesso nuovo; `test:room` con `--test-concurrency=1`.
- Testi in italiano, senza trattino lungo, a capo per unità di senso; stile `.claude/design.md`; la home deve continuare a entrare nella prima schermata a 390×700.
- Contenuto delle pagine legali nel sorgente (HTML statico in `public/`), non disegnato via JS.
- Push e deploy li lancia Claude a fine lavoro: prima `firebase deploy --only database`, poi `vercel deploy --prod`. L'attivazione dei provider di accesso nella console Firebase la fa Edoardo.

## Review Focus

1. **Accesso Google con un account Google già collegato a un altro uid** (`auth/credential-already-in-use`): si entra in quell'account (le monete stanno lì), senza errori e senza perdere la partita in corso. Test in Task 2.
2. **Username già preso** (anche con maiuscole diverse): rifiutato con un messaggio chiaro, nessuna doppia proprietà. Test in Task 3.
3. **Doppio tocco su "Compra" con monete appena sufficienti**: una sola spesa, nessun saldo negativo. Test in Task 3.
4. **Bonus giornaliero rivendicato due volte nello stesso giorno o da due telefoni**: uno solo. Test in Task 3.
5. **Account cancellato**: profilo, username e lista d'attesa spariscono; il gioco continua da anonimo. Test in Task 3.

---

### Task 1: Catalogo e regole generate

**Files:** Create `src/shop/catalogo.js`, `scripts/regole-catalogo.mjs`; Test `src/shop/catalogo.test.mjs` (in `test:rules`).

**Interfaces — Produces:**
- `ITEMS: Array<{ id, nome, tipo: 'cappello'|'occhiali'|'vestito'|'cornice', prezzo: number, esclusivo?: true }>` (12 voci, 3 `esclusivo`).
- `PAID: Array<{ id, nome, prezzo: string, monete?: number, username?: true }>` (i 4 prodotti in vetrina).
- `EARN = { base: 5, vittoria: 5, perUnica: 1, maxUniche: 10, giornaliero: 20, serie: 10, giornalieroMax: 70, invito: 200, maxInviti: 20, benvenutoPrimi: 1000, benvenuto: 300, primi: 100 }`.
- `node scripts/regole-catalogo.mjs` riscrive in `database.rules.json` la regola dei prezzi (`users/$uid/owned/$item` valida solo se il saldo scende esattamente di `prezzo`, o se l'item è `esclusivo` e l'utente ha `primi100`).

- [ ] Test: 12 item con id unici, tipi validi, prezzi tra 150 e 1500, esattamente 3 esclusivi; `PAID` con i 4 prezzi della spec; lo script è idempotente (eseguito due volte produce lo stesso file) e la regola contiene ogni id.
- [ ] Run `node --test src/shop/catalogo.test.mjs` → FAIL; implement; → PASS. Commit `Negozio: catalogo e regole dei prezzi`.

### Task 2: Accesso con Google ed email

**Files:** Modify `src/firebase.js`; Create `src/account/accesso.js`; Modify `vercel.json` (rewrite `/__/auth/:path*` → `https://nomi-cose-citta-416e9.firebaseapp.com/__/auth/:path*`); Test `src/account/accesso.test.mjs` (emulatore).

**Interfaces — Produces:** `linkGoogle(auth) -> Promise<{ uid, merged: boolean }>`; `sendEmailLink(auth, email) -> Promise<void>` (salva l'email in `localStorage['ncc-email-accesso']`); `completeEmailLink(auth, url) -> Promise<{ uid, merged } | null>`; `signOutToAnonymous(auth) -> Promise<void>`; `deleteAccount(auth, db) -> Promise<void>`; `isRegistered(user) -> boolean` (ha un provider diverso da anonimo).

- [ ] Test (emulatore Auth, con `GoogleAuthProvider.credential` di prova e `EmailAuthProvider.credentialWithLink` tramite le API dell'emulatore): collegare un anonimo a Google mantiene lo stesso uid; Review Focus 1: Google già usato da un altro uid → `merged: true`, `auth.currentUser.uid` diventa quello esistente; link email collega l'anonimo; `signOutToAnonymous` lascia un nuovo utente anonimo.
- [ ] Implement con `linkWithCredential` e, su `auth/credential-already-in-use`, `signInWithCredential`. Nel browser `linkWithPopup`; nell'app installata su iPhone (`isStandalone()`) `linkWithRedirect`.
- [ ] Run test → PASS. Commit `Account: accesso con Google ed email, collegando l'identità anonima`.

### Task 3: Profilo, monete, username, inviti, lista d'attesa (dati e regole)

**Files:** Create `src/account/profilo.js`; Modify `database.rules.json` (`users`, `usernames`, `meta/iscritti`, `invites`, `waitlist`, campo `acc` dei giocatori); Test `src/account/profilo.test.mjs` (emulatore, in `test:room`).

**Interfaces — Consumes:** `ITEMS`, `EARN` (Task 1). **Produces:**
- `createProfile(db, uid, { pendingCoins, invitedBy }) -> { primi100: boolean, coins }`: transazione su `meta/iscritti`, poi `users/{uid}` con `coins = benvenuto + pendingCoins (≤20)`, `owned` con gli esclusivi se `primi100`.
- `earnGame(db, uid, { won, unique }) -> coins`; `claimDaily(db, uid, today) -> { amount } | null`; `buyItem(db, uid, itemId) -> 'ok'|'poveri'|'già'`; `equip(db, uid, tipo, itemId|null)`; `setUsername(db, uid, name) -> 'ok'|'preso'|'non valido'`; `claimInvites(db, uid) -> number` (monete accreditate); `joinWaitlist(db, uid, { email, product, consent: true })`; `leaveWaitlist(db, uid)`; `deleteProfile(db, uid)`.
- Regole: `users/$uid` scrive solo il proprietario; `coins` aumenta solo con un motivo valido scritto nella stessa operazione (`lastEarn` con intervallo ≥ 60 s e aumento ≤ 20; `lastDaily` = oggi e aumento ≤ 70; invito riscattato; creazione); diminuisce solo comprando un item al prezzo (regola generata dal Task 1); `usernames/$name` scritto una sola volta, uguale all'uid del proprietario, nome valido; `waitlist/$uid` solo il proprietario, con `consent === true`, `email` valida, nessuna lettura pubblica; `players/$uid/acc` con soli id di `ITEMS`.

- [ ] Test, uno per riga: creazione con benvenuto 1000 per i primi 100 e 300 dopo (contatore pre-impostato a 99 e 100); `earnGame` +20 al massimo e respinto se ripetuto entro 60 s; Review Focus 4: `claimDaily` due volte nello stesso giorno → la seconda null, anche da un secondo client; Review Focus 3: due `buyItem` insieme con monete per uno solo → uno `ok`, uno `poveri`, saldo mai negativo; comprare un esclusivo senza `primi100` → respinto; Review Focus 2: `setUsername('Marco_1')` poi un altro uid `setUsername('marco_1')` → `preso`; nome di 3-4 caratteri → `non valido`; invito: B crea il profilo con `invitedBy: A`, A esegue `claimInvites` → +200 una volta sola; `joinWaitlist` senza consenso → respinto; un altro uid non legge la lista; Review Focus 5: `deleteProfile` toglie `users`, `usernames` e `waitlist`.
- [ ] Run → FAIL; implement `profilo.js` e regole; → PASS (compresi i test esistenti). Commit `Account: profilo, monete, username, inviti e lista d'attesa con le loro regole`.

### Task 4: Accessori sulla faccina

**Files:** Create `src/shop/accessori.js` (SVG per id); Modify `src/ui/kit.js` (`Face` disegna `p.acc`), `src/engine/room.js` (`newPlayer` copia `profile.acc` se valido), `src/solo/motore.js` (stesso per il giocatore); Test in `src/shop/catalogo.test.mjs` e `src/engine/veloce.test.mjs`.

**Interfaces — Produces:** `ACCESSORI: { [id]: (size) => ReactElement }`; `Face` accetta `p.acc = { cappello?, occhiali?, vestito?, cornice? }`.

- [ ] Test: ogni id di `ITEMS` ha un disegno; un giocatore con `acc` valido entra in stanza e gli altri lo leggono; `acc` con id inventato → respinto dalle regole.
- [ ] Implement; verifica visiva nel browser di tutti i 12 a 44 px e 108 px. Commit `Negozio: 12 accessori sulla faccina, visibili nelle stanze`.

### Task 5: Interfaccia

**Files:** Create `src/screens/Account.js`, `src/screens/Negozio.js`; Modify `src/App.js`, `src/screens/Home.js`, `src/screens/Finale.js`, `src/screens/Avvisi.js` (popup primi 100, pannello lista d'attesa), `src/stats.js` + regola stats (`account_creati`, `richiesta_<id>`, `lista_attesa`), `src/screens/Statistiche.js` (sezione Richiesta).

Comportamento:
- Home: pillola "Account" in alto a sinistra (o username + monete), che apre Account; la home entra ancora in 390×700 (misura come il 21 ottobre).
- Account: Google, email (con la nota per l'app installata), username, monete, invita (link `/?invito=CODICE` con Condividi), Negozio, esci, cancella l'account (con conferma).
- Negozio: accessori con anteprima sulla propria faccina, Compra / Indossa / Togli; sezione "Monete e username" con i 4 prodotti: "Compra" → pannello "In arrivo" con email (precompilata se c'è), casella di consenso non preselezionata con il testo "Voglio ricevere un'email quando apriranno gli acquisti. Niente altro.", link a privacy; ogni tocco conta `richiesta_<id>`.
- Fine partita (online e da soli): "+N monete" se registrato, altrimenti "Avresti guadagnato N monete: crea l'account per tenerle" (N salvato in `localStorage['ncc-monete-in-sospeso']`).
- Popup primi 100: dopo la prima partita finita, una volta per telefono (`localStorage['ncc-popup-primi']`), solo se `meta/iscritti < 100`; altrimenti versione senza "primi 100" con 300 monete.
- Con l'account, il nome in partita è l'username (non modificabile nel campo nome).

- [ ] Implement, poi verifica con Playwright sull'emulatore (iPhone 14 su WebKit e Pixel 7): registrazione Google (popup dell'emulatore), popup, guadagno a fine partita da soli, acquisto e uso di un accessorio visibile all'altro telefono in una stanza, username, invito tra due contesti, lista d'attesa con e senza consenso, cancellazione account. Screenshot di ogni schermata nuova; `controlla-testi.py` e `audit-design.py` a zero errori.
- [ ] Commit `Account e negozio: schermate, popup dei primi 100, monete a fine partita, vetrina e lista d'attesa`.

### Task 6: Pagine legali

**Files:** Create `public/privacy.html`, `public/condizioni-acquisto.html` (HTML statico nello stile di `public/offline.html`, contenuto dal testo di `docs/legale/condizioni-acquisto.md` più le aggiunte della spec); Modify `vercel.json` (`/privacy`, `/condizioni-acquisto`), `public/index.html` e `RulesSheet` (paragrafo breve che rimanda a `/privacy`), `public/robots.txt` (`/condizioni-acquisto` non indicizzata finché la vendita non parte).

- [ ] I dati del titolare/venditore sono un segnaposto evidente `[DA COMPLETARE: ragione sociale, indirizzo, partita IVA]` finché Edoardo non li fornisce.
- [ ] Verifica: entrambe le pagine leggibili senza JavaScript, `controlla-testi.py` senza problemi. Commit `Privacy completa e condizioni di acquisto`.

### Task 7: Verifica finale e pubblicazione

- [ ] Tutte le suite, build, prova offline, prova partita veloce, partita tra amici.
- [ ] Revisione indipendente del ramo (modello più capace), correzioni Important con test.
- [ ] Guida a Edoardo per attivare nella console Firebase: Google, Email (link), dominio `nomicosecitta.pro` autorizzato; poi `firebase deploy --only database`, merge, push, `vercel deploy --prod` lanciati da Claude.
