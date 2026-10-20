# Gioca da solo: partita contro i robot, anche senza internet

Data: 21 ottobre 2026. Primo di tre progetti in fila: 1) gioca da solo, 2) account e accessori,
3) personaggi del club. Questo documento copre solo il primo.

## Perché

Oggi Nomi Cose Città si gioca solo con altre persone collegate. Chi apre il gioco da solo, o è in metro,
in aereo, senza amici disponibili, non può fare niente. Edoardo vuole che il gioco serva anche in quei
momenti: una partita vera, con avversari credibili, che funzioni pure senza connessione.

È anche la base del progetto 2: record e accessori sbloccabili nascono dalle partite contro i robot.

## Cosa deve fare (deciso con Edoardo)

- Una modalità "Gioca da solo" dalla home, contro **robot** con nomi di persona italiani, faccina e
  colore come un giocatore vero.
- **Quattro difficoltà**: Facile, Medio, Difficile, Impossibile. I robot giocano calibrati sulla difficoltà.
- **Funziona senza internet**, dall'apertura del gioco fino al podio.
- **Categorie disponibili**: Nomi, Cose, Città, Animali, Cibi, Mestieri, Film, Calciatori (le otto di
  `DEFAULT_CATEGORIES` in `src/engine/rules.js`). Niente categorie inventate in questa modalità.
- **Record** per ogni difficoltà, salvati sul telefono.

## Decisioni prese da Claude (Edoardo le ha viste e non le ha contestate)

- **3 robot** di base, scelta da 1 a 5.
- **Impostazioni** come nella stanza normale: categorie (minimo 2, con i preset Veloce 3 / Classica 5 /
  Maratona 8), round, tempo, lettere difficili. Riusare la schermata `Setup` dove possibile.
- **Nomi dei robot**: lista di nomi italiani comuni, maschili e femminili, pescati a caso e diversi a ogni
  partita, mai uguali al nome del giocatore.
- **Calciatori** nel dizionario: famosi di ieri e di oggi, così la lista non invecchia in una stagione.
- **Stessa partita di sempre**: lettera estratta, scrittura, STOP, correzione una categoria alla volta,
  punti (20 / 10 / 5 / 0 come in `scoreCategory`), premi (Fulmine, Originale, Copione), podio, Rivincita.
  Le regole di `src/engine/rules.js` si riusano così come sono e **non si modificano** (vedi `CLAUDE.md`).
- **I robot esistono solo in questa modalità.** Mai in una stanza online, mai spacciati per persone vere
  agli amici. Nella partita da soli il giocatore sa che sono robot (l'ha scelto lui), ma dentro la partita
  si comportano e si presentano come giocatori normali.

### Come giocano i robot, per difficoltà

Valori di partenza, da tarare provando. Ogni robot ha piccole differenze dagli altri (non tutti identici).

| | Facile | Medio | Difficile | Impossibile |
|---|---|---|---|---|
| Caselle riempite | 40–60% | 70–85% | 90–100% | 100% |
| Parole | comuni | comuni e medie | medie e rare | soprattutto rare |
| Errori (lettera sbagliata o parola inventata) | qualcuno | raro | quasi mai | mai |
| Velocità | lenti | normali | veloci | pochi secondi |
| STOP | quasi mai | a volte, tardi | presto | appena possibile |

- Ogni parola del dizionario ha un grado di **rarità** (comune / media / rara): decide quale parola sceglie
  un robot e quindi quanto spesso due robot scrivono la stessa (5 punti) o una parola unica (10–20).
- I robot **scrivono nel tempo**: le loro caselle si riempiono man mano, si vede "può fermare" come per gli
  altri giocatori, e STOP lo premono davvero, chiudendo il round anche per il giocatore.
- Se il giocatore preme STOP prima, i robot consegnano quello che hanno scritto fino a quel momento.

### Correzione

- Ogni parola si controlla contro il dizionario.
- **Parole dei robot**: quelle sbagliate apposta (Facile, Medio) il giocatore le può bocciare con
  "Non vale" come al solito; anche gli altri robot le bocciano.
- **Parole del giocatore**: se è nel dizionario passa (e non si può bocciare, vedi sotto); se non c'è (il dizionario non sarà mai completo),
  i robot votano secondo difficoltà: a Facile si fidano quasi sempre, a Impossibile la contestano più
  spesso, ma mai su tutto. La parola si boccia con la regola di sempre (`isRejected`: più di metà degli altri).
- I robot non votano mai parole con la lettera sbagliata come valide: quelle prendono 0 comunque.

- **Decisione di Claude, dopo la revisione:** una parola presente nel dizionario, con la lettera giusta,
  **non si può bocciare**, né dal giocatore né dai robot. Il "Non vale" del giocatore conta solo sulle
  parole che il dizionario non conosce o che hanno la lettera sbagliata. Senza questa regola, con un solo
  robot basterebbe il voto del giocatore per azzerargli tutto e vincere sempre, anche a Impossibile, e i
  record non varrebbero niente. La schermata di correzione lo deve far capire (per esempio la parola dei
  robot che il dizionario conosce mostra che è valida), invece del testo di oggi sui voti che servono.

### Grafia di Film e Calciatori

Valgono le regole di sempre (`startsWithLetter` in `rules.js`, che non si tocca): conta la prima lettera di
ciò che si scrive. "Totti" vale per la T, "Francesco Totti" per la F; "Il Padrino" vale per la I.
- Il dizionario dei **calciatori** tiene più forme per giocatore: cognome, e nome più cognome quando è la
  forma con cui è conosciuto (ognuna vale per la sua iniziale). I robot scrivono di solito il cognome.
- I **film** si tengono col titolo italiano con cui sono usciti in Italia, più il titolo originale quando è
  quello conosciuto (per esempio "Titanic", "Inception"). Articoli compresi come si scrivono.
- Il confronto con il dizionario usa `normalize` (accenti, maiuscole e spazi non contano).

### Partita interrotta

- **Decisione di Claude, dopo la revisione:** se il telefono chiude l'app (capita spesso su iPhone in
  secondo piano), la partita **riprende** alla riapertura: lo stato si salva sul telefono a ogni passo.
  Il tempo del round continua a scorrere sull'orologio vero: se è scaduto mentre l'app era chiusa, il round
  si chiude come "tempo scaduto" e si va alla correzione.
- Una partita lasciata a metà da più di 12 ore si scarta e non conta per i record.

### Record (sul telefono)

- Per ogni difficoltà: miglior punteggio, partite giocate, partite vinte.
- **Decisione di Claude, dopo la revisione:** il punteggio dipende troppo dalle impostazioni (8 categorie
  per 5 round contro 2 per 1). Il record quindi è la **media di punti a parola**: punti del giocatore diviso
  (categorie × round), con un decimale, per esempio "13,4 punti a parola". Una partita conta per i record
  solo con almeno 3 categorie e almeno 2 robot, così una partita lampo contro un solo robot non vale quanto
  una vera. Le altre si giocano lo stesso, solo non toccano i record (va detto prima di iniziare).
- Struttura salvata, una voce per difficoltà: `{ migliore, giocate, vinte }`. È quella che il progetto 2
  manderà online.
- A fine partita, se il record è battuto, si vede sul podio. È l'unico festeggiamento automatico.
- Nessun account, nessun dato online in questo progetto. Account e salvataggio online sono il progetto 2:
  la struttura dei record deve essere semplice da mandare online dopo (un oggetto per difficoltà).

## Senza internet: cosa cambia

- **Il gioco va tenuto sul telefono.** Oggi `public/sw.js` non mette in memoria il gioco di proposito, per
  servire sempre l'ultima versione. Per l'offline deve tenere in memoria il gioco intero (HTML, JS, CSS,
  font, icone, dizionario). Mai una pagina bianca: un file mancante non deve rompere l'avvio.
- **Aggiornamenti, decisione di Claude dopo la revisione:** l'apertura della pagina chiede prima alla rete,
  con un tempo massimo di circa 3 secondi; solo se la rete non risponde in tempo si usa la copia sul
  telefono. I file di codice di CRA hanno il nome che cambia a ogni versione, quindi si possono servire
  dalla memoria senza rischio. Così chi ha rete apre sempre la versione appena pubblicata e nelle stanze
  online non si incontrano telefoni con versioni diverse del motore; con rete scarsa l'avvio rallenta al
  massimo di quei 3 secondi.
- **La home non deve aspettare Firebase.** Oggi `App.js` mostra il caricamento finché non riesce l'accesso
  anonimo, e senza rete finisce in `ErrorScreen('offline')`. Va cambiato: la home compare subito; l'accesso
  anonimo continua in sottofondo. "Crea una stanza" e "Ho un codice" senza rete danno un messaggio chiaro
  ("Per giocare con gli amici serve internet. Puoi giocare da solo contro i robot.") invece di bloccarsi.
- I link `/r/CODICE` senza rete: messaggio chiaro, con la proposta di giocare da solo.
- "Gioca da solo" **non usa Firebase** in nessun punto: stato della partita in memoria sul telefono.
- Su iPhone l'offline vale davvero dall'icona sulla Home: la guida "Usalo come un'app" già c'è.
- `public/offline.html` resta come ultima rete di sicurezza.

## Interfaccia

- Stile esistente (`.claude/design.md`, prototipo `Main.dc.html`): inchiostro, giallo, contorni 2.5px,
  ombre nette. Nessun nuovo stile.
- **Home**: un pulsante in più, "Gioca da solo", sotto o accanto a "Ho un codice", senza appesantire.
  La home ha già "Crea una stanza", "Ho un codice", il link "Usalo come un'app" e, per i Fondatori, la
  pillola: la gerarchia resta "Crea una stanza" come azione principale.
- **Scelta della difficoltà**: una schermata o un pannello con le quattro difficoltà, una frase per
  ciascuna che dica cosa aspettarsi, e il record di quella difficoltà se esiste. Poi le impostazioni.
- Partita, correzione, fine round, premi e podio: le stesse schermate di oggi, con i robot al posto degli
  amici. Niente lobby, niente codice, niente link WhatsApp.
- Uscire a metà partita: la stessa conferma di oggi; la partita non conta per i record.
- Testi in italiano, senza trattino lungo, a capo per unità di senso (vedi `CLAUDE.md` globale).

## Non obiettivi

- Account, accessori, sblocchi: progetto 2.
- Personaggi del club: progetto 3.
- Robot nelle stanze online, o partite miste persone + robot.
- Categorie inventate contro i robot.
- Classifiche globali o confronto con altri giocatori.
- Mandare a Firebase qualcosa delle partite da soli.

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- I robot che sembrano macchine: tutti uguali, tutti istantanei, tutti con le stesse parole.
- Impossibile battibile facilmente, o Facile frustrante.
- Il gioco che dopo un aggiornamento resta su una versione vecchia per giorni, o mostra una pagina bianca.
- La modalità online che peggiora: avvio più lento, regressioni nelle stanze.
- Un dizionario pieno di parole sbagliate o volgari che i robot scrivono.

## Vincoli

- React (create-react-app) senza nuove librerie pesanti; il peso del dizionario va misurato e tenuto
  ragionevole (stima: qualche centinaio di KB non compressi per 8 categorie). Caricarlo solo quando si
  sceglie "Gioca da solo", non nell'avvio della home.
- `src/engine/rules.js` non si modifica. Il motore online `src/engine/room.js` non deve cambiare
  comportamento; i 13 test sull'emulatore e i test di `npm run test:rules` devono continuare a passare.
- Logica dei robot e del dizionario in funzioni pure, provate con `node --test` (casualità iniettabile,
  come `makeCode(random)`).
- Niente deploy senza richiesta esplicita di Edoardo.

## Lasciato a chi costruisce

- Come strutturare il motore locale. Suggerimento: un oggetto con la stessa forma di `createEngine` e lo
  stesso stato `room` (status, round, players, answers, votes), così `Spin`, `Play`, `Review`, `Round`,
  `Finale` si riusano senza riscriverle; ma se riusarle costa più che adattarle, si decide in piano.
- Formato e contenuto del dizionario, e come generarlo e controllarlo. Il dizionario va fatto vedere a
  Edoardo a campione prima di considerarlo finito.
- Come mettere in memoria il gioco nel service worker (a mano o con lo strumento di CRA), purché valgano
  le regole sugli aggiornamenti scritte sopra.
- I numeri esatti della tabella delle difficoltà, da tarare giocando.
- Lista dei nomi dei robot.
