# Ritorno giornaliero: serie di giorni, sfide e scrigno

Data: 21 ottobre 2026.

## Perché

Nomi Cose Città è un gioco da compagnia, vecchissimo, che Edoardo vuole riproporre in modo nuovo. Il gioco in sé
non basta a far tornare la gente da sola: serve una ragione per aprirlo ogni giorno. Il riferimento è Monopoly Go:
un gioco semplice che ha preso tutti perché ogni gesto dà qualcosa, ci sono raccolte con scadenza e c'è la
componente sociale. Qui il momento che ripaga è già nel gioco: la **parola unica**, quando scrivi qualcosa che
nessun altro ha pensato.

Edoardo ha chiesto "dopamina" e meccanismi che facciano tornare: premi per i giorni di fila (3, 7, 30, 100 e oltre),
sfide giornaliere ("arriva nei primi 3", "scrivi 3 parole uniche"), premi sempre più interessanti. Questo documento
è il **primo giro**: scala dei giorni, tre sfide al giorno, scrigno a fine partita. Raccolte con scadenza, classifica
tra amici e titoli accanto al nome vengono dopo, e solo se le statistiche mostrano che il primo giro fa tornare
la gente.

## Cosa deve fare (deciso con Edoardo)

- **Scala dei giorni di fila**: ogni giorno che entri nel gioco con l'account ricevi monete, e ai giorni 3, 7, 14, 30,
  50 e 100 scatta un premio in più, sempre più bello. Dopo il 100, un premio speciale ogni 100 giorni.
- **Tre sfide al giorno**, uguali per tutti e diverse ogni giorno. Esempi voluti da lui: "arriva nei primi 3 in una
  partita", "scrivi 3 parole uniche, cioè che ti distinguono dagli altri".
- **Scrigno a fine partita**: un premio a sorpresa dopo ogni partita finita.
- Tutto serve a far tornare le persone e a divertirle. Il premio è sempre estetico o monete da gioco, mai un
  vantaggio nella partita.

## Decisioni prese da Claude (proposte, Edoardo le ha viste e ha detto "va bene")

- **Solo con l'account.** Come per le monete: chi non è registrato vede la scheda "Oggi" in forma di anteprima
  ("con l'account ricevi questi premi") e non accumula. È anche un motivo in più per registrarsi.
- **Giorni di fila**: il giorno conta se la persona apre il gioco (giorno di Roma, come `dayKey`). Il bonus del giorno
  oggi vale 20 monete, +10 per ogni giorno di fila, fino a 70. Si tiene.
- **Premi dei traguardi** (una volta sola per ogni serie, non si riscuotono due volte lo stesso numero nella stessa
  serie):
  - giorno 3: +50 monete;
  - giorno 7: +150 monete e un accessorio nuovo che esiste solo così;
  - giorno 14: +300 monete;
  - giorno 30: +800 monete e un secondo accessorio nuovo;
  - giorno 50: +1200 monete;
  - giorno 100: +3000 monete e un terzo accessorio nuovo, il più bello;
  - dopo il 100: +3000 monete a ogni multiplo di 100.
- **Scudo della serie**: una volta al mese di calendario, se si salta **un solo giorno**, lo scudo copre il buco e la
  serie continua. Si usa da solo e la scheda lo dice ("scudo usato"). Salti di due giorni o più: la serie riparte da 1.
  Nessun testo che fa sentire in colpa.
- **Sfide**: tre al giorno, scelte dalla data (la stessa data dà le stesse tre a tutti), una facile, una media, una
  difficile. Premi: facile 15 monete, media 30, difficile 60. Fatte tutte e tre: **+50 monete** e uno scrigno in più.
  Pool iniziale, il costruttore può aggiungerne:
  - facili: "Gioca una partita", "Gioca una partita con un amico" (online con almeno 2 persone vere);
  - medie: "Scrivi 3 parole uniche in una partita", "Vinci una partita";
  - difficili: "Arriva nei primi 3 in una partita online con almeno 3 giocatori", "Scrivi 6 parole uniche in una
    partita".
  Una sfida si completa durante la partita giusta o a fine partita; il premio si riscuote dalla scheda "Oggi".
- **Scrigno**: a ogni partita finita (online, veloce, da soli). Distribuzione indicativa: 70% poche monete
  (da 5 a 15), 25% di più (da 20 a 40), 5% un accessorio raro che non si compra. Se la persona li ha già tutti, al
  posto dell'accessorio 50 monete. Aperto con una piccola animazione sul podio: è il **solo momento animato
  orchestrato** della schermata. Non si compra mai con soldi veri e non si può saltare per pagare.
- **Accessori nuovi**: 3 per i traguardi (giorni 7, 30, 100) e 3 rari dello scrigno, quindi 6 in tutto, nello stile
  delle faccine (contorno inchiostro, colori del gioco), di tipi diversi tra i quattro esistenti (cappello,
  occhiali, vestito, cornice). Nomi a scelta di chi costruisce. Se il lavoro è troppo, si taglia ai 3 dei
  traguardi e si rimanda gli altri.
- **Premi in monete dopo il 100 e prezzi**: i prezzi del negozio restano (da 150 a 1500). Ai ritmi sopra, un
  giocatore fedele guadagna più di prima ma non rompe il negozio: chi costruisce controlla che i numeri non
  svuotino il senso di comprare.
- **Dove si vede**: in home una scheda **Oggi** con la serie (giorno N, prossimo traguardo), le tre sfide con lo
  stato e il tasto per riscuotere. Un foglio di festa quando si raggiunge un traguardo. Sul podio, lo scrigno e le
  sfide fatte. Senza appesantire la home: oggi entra tutta nella prima schermata.
- **Statistiche** in `/statistiche`: persone che hanno raggiunto ogni traguardo, serie perse, scudi usati, sfide
  completate (per tipo), scrigni aperti, e quante persone tornano il giorno dopo. Servono a capire se funziona.

## Decisioni di Claude dopo il controllo del costruttore

- **Serie e bonus in monete sono due cose separate.** La serie conta i **giorni** (giorno di Roma): nuovo campo
  `lastDay`, un **numero** (giorni dall'epoca) che le regole confrontano con l'ora del server, così un telefono non
  può dichiarare un giorno che non è oggi (accettate l'ora solare e legale di Roma). `streak`, `migliorSerie` e
  `serieId` cambiano solo nella stessa scrittura che porta un giorno nuovo, di +1 alla volta, e `streak` non supera i
  giorni di vita dell'account più 2. Nessun blocco di ore tra un giorno e l'altro: chi apre alle 23:50 e alle 00:10
  allunga la serie alle 00:10. Il **bonus in monete** resta con il suo intervallo di 20 ore e arriva alla prima
  apertura utile.
- **Scudo**: campo `scudo` col mese in cui è stato usato (`AAAA-MM`). Copre **un solo giorno saltato** per mese di
  calendario. Un giorno aperto senza rete conta se la rete torna lo stesso giorno (la scrittura si riprova al
  ritorno in primo piano e alla riconnessione); un giorno passato non si può scrivere dopo. Se nelle statistiche le serie perse sono troppe, si rende lo scudo più
  generoso: è una cifra, non una struttura.
- **Scrigni**: un solo salvataggio a fine partita con monete della partita (fino a 20), scrigno (fino a 40) e
  progresso delle sfide, sotto lo stesso intervallo di 60 secondi di oggi (`lastEarn`). Al massimo **10 scrigni al
  giorno** (campo `scrigniOggi` con giorno e conteggio, non cancellabile). Con i trucchi i premi
  del ritorno restano limitati dal giorno vero (sfide: le tre di oggi; scrigni: dieci al giorno), ma le monete di
  partita già esistenti (+20 ogni 60 secondi) restano il tetto più largo, com'era prima.
- **Premi separati, ognuno col suo ramo di regole e il suo campo non cancellabile**: partita più scrigno,
  bonus del giorno, traguardi, sfide. Ogni tipo ha il suo tetto e il suo intervallo.
- **Traguardi**: campo `migliorSerie` che non scende mai. Il premio in monete di ogni traguardo si riscuote una volta
  **per serie** (chiave `serieId_N`, dove `serieId` è il giorno in cui la serie è partita); l'accessorio si possiede
  una volta sola e resta anche se la serie si interrompe. Il premio si accredita **in automatico all'apertura**, con
  il foglio di festa. Le sfide si riscuotono a mano dalla scheda "Oggi".
- **Dati già esistenti**: `streak`, `lastDaily` e `lastDailyAt` restano. Alla prima apertura dopo l'aggiornamento
  si crea `lastDay` uguale a `lastDaily` (una volta sola), così chi ha già una serie non la perde.
- **Sfide, chi conta**: "con un amico" vale online con almeno 2 persone vere (account anonimi sì, robot no).
  "Primi 3" vale in una partita online con almeno 3 giocatori, di cui almeno 2 persone vere. La partita da soli conta
  per "Gioca una partita" e per le parole uniche, non per "Vinci" né per "Primi 3". Il pool può crescere.

## Sicurezza (finché non girano soldi veri)

- Come per le monete di oggi: tutto sta su Firebase in `users/{uid}`, scritto dal telefono e controllato dalle regole
  del database. I premi hanno tetti: ogni tipo di premio ha il suo massimo e il suo intervallo minimo, e **i campi
  che li controllano non si possono cancellare** una volta scritti (difetto già trovato e corretto sulle monete).
- Gli accessori da traguardo si possiedono solo se la serie ha raggiunto quel numero; quelli rari dello scrigno
  sono accettati senza prova (la casualità sta nel telefono).
- **Costo accettato**: chi smanetta col codice può darsi qualche moneta o accessorio. È estetica, non soldi. Quando
  la vendita vera partirà, monete e premi passeranno a funzioni server, insieme a Stripe e alle due protezioni di
  sempre (regola sul bordo e blocco dei tentativi): non fa parte di questo progetto.
- Gli accessori in stanza restano validi solo se posseduti.

## Interfaccia

- Stile del gioco (`.claude/design.md`), bordo 2.5px inchiostro, ombra netta, aree di tocco 44×44, responsive
  fino a 360px, `prefers-reduced-motion` rispettato.
- Testi in italiano, senza trattino lungo. Il bottone dice cosa succede ("Prendi le 60 monete"). Stati vuoti e
  errori spiegano cosa fare.

## Non obiettivi

- Raccolte con scadenza, classifica tra amici, titoli accanto al nome, notifiche push.
- Qualsiasi premio che si compra con soldi veri o che dà vantaggio in partita.
- Scadenze o messaggi che fanno sentire in colpa chi salta un giorno.

## Anti-obiettivi

- Premi che perdono valore perché troppo facili da ottenere, o monete che gonfiano senza controllo.
- Una serie che punisce: perdere la serie per un giorno di rete assente o di fuso orario.
- Rallentare le partite o riempire la home.
- Chi non vuole l'account che non riesce più a giocare.

## Vincoli

- Le regole del database si pubblicano **prima** del sito, con un test sull'emulatore per ogni permesso nuovo.
- `src/engine/rules.js` non si tocca; le partite non cambiano comportamento.
- Il bonus del giorno resta a regole di intervallo di 20 ore; il giorno si conta a Roma.
- Funziona anche per le partite da soli offline: il premio si riscuote alla prossima apertura con rete (come già
  le monete in coda).

## Lasciato a chi costruisce

- Struttura esatta dei dati e delle regole entro i limiti scritti sopra.
- Disegno e nomi dei 6 accessori nuovi.
- Pool completo delle sfide, fino a quante servono per non ripetersi.
- Cifre fini dello scrigno, purché la media resti sotto il prezzo del primo accessorio ogni pochi giorni di gioco.
- Come mostrare scheda "Oggi", animazione dello scrigno e festa dei traguardi.
