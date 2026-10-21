# Partita veloce: matchmaking online, con i robot che completano i posti

Data: 21 ottobre 2026.

## Perché

Il gioco è online su nomicosecitta.pro e Edoardo vuole farlo provare a gente che non ha un gruppo di amici
pronto. Oggi online si gioca solo creando una stanza e mandando il link. Serve un modo per giocare subito con
sconosciuti: tocchi un pulsante, il gioco cerca altre persone che stanno cercando, forma una partita e la avvia.

## Cosa deve fare (deciso con Edoardo)

- Nel pannello "Gioca online" (oggi: Crea una stanza, Ho un codice) c'è una terza scelta: **Partita veloce**.
- Toccandola il telefono entra in una coda. Appena ci sono **4 persone** in coda, vengono messe insieme in una
  stanza e la partita **parte da sola**.
- Se dopo un'attesa non si arriva a 4, i posti vuoti si riempiono con **robot**.
- I robot hanno un'etichetta **"robot"** accanto al nome, ovunque compaiono (lobby, partita, correzione,
  punteggi, podio). Per il resto giocano come nella partita da soli. Motivo: in una partita con sconosciuti
  non si fanno passare macchine per persone.

## Decisioni prese da Claude (Edoardo le ha viste e non le ha contestate)

- **Attesa** prima dei robot: circa 20 secondi dall'ingresso in coda del primo della futura partita. Se in coda
  c'è una sola persona, gioca con 3 robot.
- **Robot a difficoltà Medio**, nomi dalla lista dei robot della partita da soli (`BOT_NAMES`), mai uguali ai
  nomi dei giocatori presenti.
- **Impostazioni standard**: Nomi, Cose, Città; 3 round; 90 secondi; niente lettere difficili; massimo 4 giocatori.
- **I robot li fa giocare il telefono dell'host**: scrive nella stanza le loro risposte man mano, il loro STOP,
  i loro voti. Se l'host cambia (esce, si disconnette, resta fermo), i robot li prende il nuovo host senza
  interruzioni. Per questo il piano di ogni robot in un round deve venire uguale su qualunque telefono:
  casualità ricavata da codice stanza, numero del round e id del robot, non da `Math.random`.
- **Solo nelle partite veloci.** Nelle stanze create da un giocatore per gli amici i robot non ci sono.
- La partita veloce resta una stanza normale: dopo il podio si può fare la Rivincita (i robot restano) o tornare
  alla home. Chi esce non viene rimpiazzato.
- **Decisione di Claude dopo la revisione, dopo il podio:** vale tutto come in una stanza normale. L'host avvia
  la Rivincita a mano, può cambiare le impostazioni e togliere giocatori; si può entrare col codice finché c'è
  posto (massimo 4, robot compresi). Se l'host resta fermo sul podio gli altri possono uscire e cercare un'altra
  partita veloce: nessun passaggio di host nuovo in `final` e `lobby`.
- Nuovo contatore nelle statistiche: `partite_veloci` (partite formate dalla coda), e il posto "in coda" nella
  presenza dal vivo (`where: 'coda'`), mostrato in `/statistiche`.
- **Decisione di Claude dopo la revisione, statistiche:** una partita veloce conta anche in `partite_online`
  (e in `partite_online_finite` se arriva al podio); in `giocatori_online` contano solo gli umani; non conta in
  `stanze_create`, che resta per le stanze create a mano.

## Come funziona la coda (proposta di Claude, il costruttore può migliorarla)

- `queue/{uid}`: `{ name, color, face, char?, at }` scritto dal telefono stesso, tolto in automatico se si
  disconnette (`onDisconnect`) e quando si annulla o si entra nella stanza.
- **Chi organizza**: il telefono con la voce più vecchia in coda (a parità, uid minore). Tutti leggono la coda,
  quindi tutti sanno chi è l'organizzatore; se se ne va, il ruolo passa al successivo.
- L'organizzatore, quando in coda ci sono almeno 4 persone o la più vecchia aspetta da 20 secondi, prende le
  prime fino a 4, crea la stanza (ne diventa host) e assegna ognuna alla stanza scrivendo `queue/{uid}/room`.
  L'assegnazione è una transazione che riesce solo se `room` è ancora vuoto: nessuno finisce in due stanze.
- Ogni telefono assegnato vede il proprio `room`, entra nella stanza come oggi (`joinRoom`) e toglie la propria
  voce dalla coda.
- L'host aspetta gli assegnati al massimo 10 secondi, poi aggiunge i robot fino a 4 e avvia la partita.
- Le regole del database: in coda ognuno scrive solo la propria voce; `room` lo può scrivere un altro solo se è
  vuoto e il codice è di una stanza di cui chi scrive è host.

## Robot nelle stanze online

- Giocatori con `bot: true` e id riconoscibili (es. `bot1`..`bot3`), scritti dall'host.
- Le regole oggi permettono di scrivere risposte, voti e STOP solo a nome proprio: vanno estese perché l'host
  possa farlo a nome dei giocatori `bot: true` della sua stanza, e nessun altro. Un giocatore umano non deve poter
  diventare robot né scrivere a nome di un robot.
- La presenza dei robot è sempre "online"; contano nella correzione come gli altri giocatori, con la soglia di
  bocciatura di sempre (`isRejected`, che non si tocca).
- **Decisione di Claude dopo la revisione, voti:** i robot non votano mai contro una parola che il dizionario
  conosce, votano sempre contro i propri errori voluti, e sulle parole degli umani che il dizionario non conosce
  dubitano poco (probabilità circa 0,1, più bassa del Medio da soli), perché in una partita tra sconosciuti
  una parola giusta bocciata dalle macchine irrita più di una parola dubbia che passa.
- **Decisione di Claude dopo la revisione, chi muove i robot:** ogni telefono della stanza calcola gli stessi
  piani dei robot (casualità ripetibile). Scrive l'host; se l'host non risulta attivo (presenza false, oppure
  nessuna scrittura dei robot da qualche secondo quando dovrebbe essercene una), scrive il primo giocatore umano
  online. Le regole quindi permettono a **qualunque giocatore umano della stanza** di scrivere risposte, STOP e
  voti a nome dei robot di quella stanza, e a nessun altro. Le scritture sono le stesse da qualunque telefono,
  quindi scriverle due volte non cambia niente. Costo accettato: in una partita veloce un umano malizioso
  potrebbe alterare le risposte dei robot; la posta è bassa e le stanze tra amici non hanno robot.
- **Partita veloce riconoscibile:** la stanza ha un segno `quick: true`, scritto alla creazione e mai più
  cambiato. I giocatori `bot: true` sono ammessi solo nelle stanze con quel segno.
- Il dizionario dei robot si carica solo se la stanza ha robot.

## Interfaccia

- Pannello "Gioca online": terza scelta "Partita veloce", con una riga che dice cosa succede ("Ti mettiamo con
  altri giocatori. Se mancano, completano i robot.").
- Schermata di ricerca: "Cerco giocatori…", quante persone sono state trovate, pulsante "Annulla". Dopo 20
  secondi senza 4 persone: "Completo con i robot".
- Etichetta "robot": pillola piccola accanto al nome, stile delle etichette esistenti.
- Serve il nome prima di cercare (come per creare una stanza); senza rete, il messaggio di sempre.

## Non obiettivi

- Classifiche, livelli dei giocatori, matchmaking per bravura.
- Chat o messaggi tra sconosciuti (le reazioni rapide restano).
- Robot nelle stanze tra amici.
- Scegliere categorie o round nella partita veloce.

## Anti-obiettivi

- Robot spacciati per persone.
- Due stanze per le stesse persone, o una persona in due stanze.
- Qualcuno bloccato per sempre su "Cerco giocatori…".
- Le stanze tra amici che peggiorano (sono quelle che oggi funzionano).
- Regole del database allentate: chiunque deve poter fare solo quello che fa oggi, più il minimo per coda e robot.

## Vincoli

- `src/engine/rules.js` non si modifica. Le stanze normali non cambiano comportamento: i 17 test sull'emulatore
  restano verdi.
- Nuove regole del database con i loro test sull'emulatore; vanno pubblicate da Edoardo prima del sito.
- Riuso del codice dei robot della partita da soli (`src/solo/robot.js`, dizionario).
- Niente deploy senza richiesta di Edoardo.

## Lasciato a chi costruisce

- Dove mettere la logica della coda e dei robot online (nuovi moduli accanto a `room.js` o dentro).
- Come ricavare la casualità ripetibile dei piani dei robot.
- I tempi esatti (attesa, controlli), entro quelli scritti sopra.
- Come provare la coda con più telefoni sull'emulatore.
