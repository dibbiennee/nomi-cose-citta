# Giudice delle parole, rilascio 2: Haiku, Sonnet e archivio condiviso

Data: 22 ottobre 2026. Seguito di `2026-10-22-giudice-parole-design.md` (il rilascio 1, con il dizionario che protegge, è
già online).

## Perché

Il dizionario del rilascio 1 protegge le parole che conosce, ma una parola vera e rara che non c'è nel dizionario si può
ancora togliere votando. Edoardo vuole chiudere il difetto: un motore che giudica le parole sconosciute **lì per lì** e
ricorda i verdetti, così in una partita con gli amici nessuno può far perdere un altro per dispetto.

La prova di `scripts/prova-giudice.mjs` (22 ottobre 2026, 272 parole vere e 120 false) dice che Haiku 5.5 non ha
respinto nessuna parola vera (0 su 272, 3 "incerta"), ha respinto 116 false su 120 e ha accettato 4 parole di categoria
sbagliata, tutte presenti nel dizionario sotto un'altra categoria. Sonnet 5.5 costa circa 9 volte più di Haiku ed è più
deciso sulle parole inventate.

## Cosa deve fare (deciso con Edoardo)

- **Il credito API serve solo a questo** (vedi memoria `api-solo-giudice-parole`): 100 USD promozionali, scadenza 22
  novembre 2026, ricarica automatica spenta.
- Per le parole che il dizionario non conosce giudica un'IA: **Haiku 5.5 per tutte, Sonnet 5.5 solo se Haiku risponde
  "incerta"**.
- **Una parola è respinta in automatico solo se i due modelli dicono entrambi "non valida"**; in ogni altro caso decide
  il voto, come oggi.
- I verdetti si salvano in un **archivio condiviso** (`giudizi/{categoria}/{parola}`): la seconda volta la stessa parola
  non costa niente.
- **Tetto di spesa giornaliero** di circa 1 dollaro nel caso peggiore (2.000 parole giudicate al giorno), e la regola sul
  bordo di 60 richieste al minuto per IP.
- Non bisogna mai bloccare il gioco: qualsiasi errore, ritardo o tetto raggiunto significa "si vota come oggi".

## Decisioni prese da Claude (proposte, Edoardo le ha viste e ha detto "va bene")

- **Un solo telefono chiama l'IA: l'host**, quando comincia la correzione. Gli altri non chiamano niente. Il server
  controlla che chi chiama sia davvero l'host di quella stanza in correzione, e giudica solo le parole che sono
  davvero nelle risposte di quel round: l'endpoint non può diventare un classificatore gratuito per altri usi.
- **I verdetti li scrive solo il server** (con la chiave di servizio di Firebase) in `giudizi/{categoria}/{chiave}`;
  tutti i telefoni li leggono. Il database non accetta scritture dai giocatori su `giudizi`: nessuno può inserire
  verdetti falsi. Le regole sono `".read": "auth != null"` e `".write": false` (il server bypassa le regole).
- **Perché i verdetti stanno nel database e non in un messaggio:** così tutti i telefoni vedono lo stesso verdetto e
  sparisce la finestra in cui schermo e punteggio non si trovano d'accordo (nel rilascio 1 era un limite noto).
- **Chiave dell'archivio:** categoria e parola normalizzata (minuscolo, senza accenti, spazi come trattino basso, senza
  i caratteri che il database non ammette `. $ # [ ] /`). Valore: `{ v: 'valida' | 'non_valida' | 'incerta', m: modello,
  at: marca di tempo }`. Non si salva chi ha scritto la parola.
- **Ordine di decisione per una risposta** (pura funzione, la stessa per punteggio e schermo):
  1. dizionario (rilascio 1): protetta;
  2. archivio `valida` **e** parola non presente nel dizionario di un'altra categoria (la guardia che ha preso tutti e
     quattro gli errori della prova): protetta;
  3. archivio `non_valida` (due modelli d'accordo): bocciata dal giudice;
  4. altrimenti: si vota come oggi.
- **Bocciata dal giudice** vuol dire che il punteggio la tratta come se la stanza l'avesse bocciata (nel punteggio, come
  voti contro di tutti gli altri giocatori), e nella schermata compare "Non esiste" con il tasto "Non vale" spento.
  Resta una via d'uscita se il giudice sbaglia: lo strumento `scripts/giudizio.mjs set <categoria> <parola> valida`
  corregge il verdetto dall'archivio (usa la chiave di servizio, solo da terminale di Edoardo).
- **Il tasto "Prossima categoria" dell'host aspetta i verdetti** della categoria corrente per al massimo 6 secondi,
  poi prosegue in ogni caso.
- **Modelli:** `claude-haiku-5-5` con `output_config: { effort: 'low' }` e `claude-sonnet-5-5` con effort basso, risposta
  JSON `[{"id":0,"verdetto":"valida"|"non_valida"|"incerta"}]`, lo stesso prompt della prova (`SISTEMA` in
  `scripts/prova-giudice.mjs`) da portare nel server come unica copia. Fino a 24 parole per chiamata.
- **Statistiche e costi:** il server scrive in `giudizi_meta/giorni/{AAAA-MM-GG}` i contatori del giorno (richieste,
  parole giudicate, già in archivio, valide, non valide, incerte, token entrati e usciti, costo stimato in centesimi di
  dollaro) e `/statistiche` li mostra. Il tetto giornaliero si legge da lì.
- **Interruttore:** variabile d'ambiente `GIUDICE_ATTIVO` (su Vercel) e flag `giudizi_meta/attivo` nel database: se
  spenti, il servizio risponde "spento" e il gioco vota come oggi.
- **Privacy:** le parole (senza nome né identificativo di chi le ha scritte) possono essere inviate ad Anthropic per
  verificare che esistano; l'informativa `public/privacy.html` e il riquadro "Come si gioca" lo dicono.

## Decisioni di Claude dopo il controllo del costruttore

- **Statistiche e costi in `/statistiche`:** i contatori del giorno (`giudizi_meta/giorni/{giorno}`: richieste, parole
  giudicate, già in archivio, valide, non valide, incerte, token e costo stimato) sono numeri aggregati senza dati
  personali, come `stats`: `.read: true`, `.write: false` (li scrive solo il server). L'interruttore
  `giudizi_meta/attivo` e i contatori dei limiti per stanza (`giudizi_meta/limiti`) non sono leggibili dai client.
  La pagina `/statistiche` è già non indicizzata ed è dichiarata `Disallow` in `robots.txt`.
- **Una richiesta per round, a inizio correzione:** l'host manda in una sola richiesta tutte le parole sconosciute di
  tutte le categorie (al massimo 40; se sono di più, le restanti restano al voto). Il server le divide in gruppi di
  al massimo 24 per categoria e le giudica in parallelo, scrivendo ogni verdetto nell'archivio appena arriva: le
  prime categorie sono pronte per prime. Il tasto "Prossima categoria" aspetta i verdetti della categoria corrente per
  al massimo 6 secondi.
- **Se l'host cambia durante la correzione** (dopo 60 secondi di inattività) il nuovo host può richiamare
  l'endpoint: il server salta le parole già in archivio, quindi costa quasi nulla. Il limite è di 3 richieste per stanza
  e per round, contate dal server in `giudizi_meta/limiti/{codice}/{round}`.
- **Durata:** `vercel.json` imposta `maxDuration` a 30 secondi per `api/giudica` (da verificare sui limiti del piano
  Hobby con la documentazione corrente: se non è ammesso si scende al massimo ammesso, e il server risponde entro
  quel tempo con quello che ha). Una richiesta che sfora il tempo vale "si vota come oggi".
- **Una sola copia per normalizzazione, prompt e dizionario** condivisa tra telefono, server e script di prova: la
  chiave dell'archivio si calcola con la stessa funzione `normalize` di `rules.js` più la sostituzione degli
  apostrofi tipografici e dei caratteri non ammessi nel database, messa in un file puro (per esempio
  `src/giudice/chiave.mjs`); il prompt e l'interpretazione della risposta stanno in un altro (per esempio
  `src/giudice/prompt.mjs`) che usa anche `scripts/prova-giudice.mjs`. Se un file `.js` ESM non si può importare
  dalla funzione (il pacchetto non dichiara `"type": "module"`), il compilatore del dizionario scrive anche una copia
  `.json` letta dal server, generata dalle stesse fonti.
- **Segreti e consegna:** la funzione si prova con un cliente Anthropic finto e con l'emulatore Firebase; si pubblica
  **spenta** (`GIUDICE_ATTIVO` assente). Quando Edoardo ha inserito le due chiavi, Claude accende l'interruttore e fa
  la prova con le chiavi vere. Il database è lo stesso progetto del client (`nomi-cose-citta-416e9`); l'URL si legge
  dalla variabile `REACT_APP_FIREBASE_DATABASE_URL`, già su Vercel. `firebase-admin` è una nuova dipendenza usata solo
  dalla funzione.
- **Chiamata del telefono:** `POST /api/giudica` con `{ codice, round, parole: [{ cat, testo }] }` e l'intestazione
  `Authorization: Bearer <token di accesso Firebase>`. Qualsiasi errore, tempo scaduto, "spento" o "limite" è
  silenzioso: nessuna scritta, si vota come oggi.
- **Tetto giornaliero:** vale il primo dei due limiti raggiunti, **2.000 parole giudicate** o **100 centesimi di dollaro**
  (costo stimato, con Sonnet incluso). Il server riserva le parole **prima** di chiamare il modello, con una
  transazione sul contatore del giorno; chiamata e tetto possono sforare al massimo di un gruppo da 24. Se il tetto è
  raggiunto, le parole che restano non hanno verdetto (si vota). Prima di mandare un gruppo a Sonnet si riserva anche
  il costo massimo stimato.
- **Le risposte dei robot non si giudicano** (nelle stanze con robot le loro parole vengono dal dizionario e sono già
  protette); il server salta i giocatori con il segno `bot`.
- **"Incerta" si salva** (così si vede quanto accade) ma vale "nessun verdetto" per il gioco e viene rigiudicata alla
  richiesta successiva se ha più di 24 ore. Ogni voce ha un numero di versione del prompt (`p`): le voci di una versione
  più vecchia si rigiudicano. Le voci `valida` e `non_valida` non scadono: si correggono a mano con
  `scripts/giudizio.mjs`.

## Cosa serve a Edoardo (non lo posso fare io, i segreti non devono passare da me)

1. **Chiave API Anthropic sul server di Vercel**, dal suo terminale, senza mostrarla a nessuno:
   `printf %s "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY production`.
2. **Chiave di servizio di Firebase:** console Firebase, Impostazioni progetto, Account di servizio, "Genera nuova chiave
   privata", poi `vercel env add FIREBASE_SERVICE_ACCOUNT production < ~/Downloads/<file>.json` e cancellare il file.
3. Tutto il resto (funzione, regole, test, pubblicazione) lo fa Claude.

## Sicurezza

- Le due protezioni di sempre: la regola sul bordo (`python3 ~/.claude/strumenti/proteggi-api.py`, 60 richieste al minuto
  per IP, copre tutto `/api/`) e i limiti dentro la funzione. Provate, non solo installate.
- Dentro la funzione: token di accesso Firebase verificato (`verifyIdToken`), chiamante = host della stanza in
  correzione, parole solo quelle delle risposte della stanza, lunghezza massima 40 caratteri, massimo 40 parole per
  richiesta, al massimo 3 richieste per round e per stanza, tetto giornaliero globale, risposta rifiutata se il corpo
  non è quello atteso.
- Nessun segreto nel repository né nel codice del telefono: le due chiavi stanno solo nelle variabili d'ambiente di
  Vercel. La funzione non scrive mai le chiavi nei log.
- I testi che arrivano dai giocatori sono dati, mai istruzioni: nel prompt vanno racchiusi come elenco numerato e il
  verdetto si accetta solo se è uno dei tre valori ammessi.

## Interfaccia

- Stile del gioco (`.claude/design.md`), testi in italiano senza trattino lungo, aree di tocco 44×44, responsive fino a
  360px.
- Etichette nella riga della risposta: "Nel dizionario" (già c'è), "Verificata" (verde, verdetto `valida`), "Non esiste"
  (rosso chiaro, verdetto `non_valida`); le righe senza verdetto restano com'oggi con il voto.
- L'avviso privato di chi boccia più parole che esistono (rilascio 1) vale anche per le parole "Verificate".

## Non obiettivi

- Verifiche di plurali, sinonimi, errori di battitura (si tratta come parola sconosciuta; l'IA può dire "valida" per un
  plurale ovvio, ma non lo si garantisce).
- Giudicare la partita da soli contro i robot (non c'è il problema).
- Usare l'IA per altro che non sia il giudice (agente notturno, post, email: fuori da questo progetto).

## Anti-obiettivi

- Bocciare per errore una parola vera: il rifiuto automatico richiede l'accordo dei due modelli.
- Spendere oltre il tetto o dipendere dal servizio: ogni guasto vale "si vota come oggi".
- Rallentare la partita: i verdetti partono all'inizio della correzione e di solito sono pronti prima della fine dei voti.
- Dati personali verso un fornitore esterno: solo parola e categoria, mai nome o identificativo.

## Vincoli

- `src/engine/rules.js` non si tocca. Le regole del database cambiano **solo** con il ramo `giudizi` (sola lettura) e
  vanno pubblicate **prima** del sito, con un test sull'emulatore.
- Il codice che decide (`protezione.js`) resta puro e gira nel browser e su Node.
- Funzione serverless Vercel: la durata massima va impostata in `vercel.json` a un valore che il piano permette.
- Test con un cliente Anthropic finto (nessuna chiamata vera nei test automatici) e una prova finale con le chiavi vere
  fatta da Edoardo con un comando.

## Lasciato a chi costruisce

- Struttura dei file della funzione e come si importa il prompt condiviso.
- Come si verifica il token e il ruolo di host (Admin SDK) e come si tiene il contatore giornaliero in modo atomico.
- Forma esatta dell'etichetta "Verificata" e "Non esiste" e della funzione che combina dizionario, archivio e guardia.
- Se il tasto "Prossima categoria" mostra un piccolo stato di attesa (al massimo 6 secondi).
