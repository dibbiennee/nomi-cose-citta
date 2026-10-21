# Account, monete e negozio (con gli acquisti a soldi veri "in arrivo")

Data: 21 ottobre 2026.

## Perché

Il gioco è online su nomicosecitta.pro con partite tra amici, partita veloce e partita da soli. Edoardo vuole far
tornare la gente e capire se qualcuno pagherebbe: monete, accessori per la faccina, username esclusivi. La vendita
con soldi veri non parte ancora: i prodotti si mostrano con il prezzo, ma toccando "Compra" si entra in lista
d'attesa. Così si misura la richiesta prima di affrontare Stripe, IVA e commercialista.

## Cosa deve fare (deciso con Edoardo)

- **Account** con Google ed email (link senza password). L'identità anonima di oggi diventa l'account, senza perdere
  niente. Chi non si registra continua a giocare come oggi.
- **Monete** guadagnate giocando, spendibili in **accessori** per la faccina, visibili anche agli altri nelle stanze
  online.
- **Popup "primi 100"**: "Complimenti, sei tra i primi 100 utenti: registrati gratuitamente e ricevi 1000 monete.
  Salva i tuoi progressi e ricevi gli accessori esclusivi." Vero solo finché gli iscritti reali sono meno di 100
  (contatore vero); dopo, il popup cambia e non parla più dei primi 100.
- **Acquisti con soldi veri mostrati ma non attivi**: pacchetti di monete e username esclusivi con il prezzo; toccando
  "Compra" compare "In arrivo" e la possibilità di mettersi in **lista d'attesa con l'email**, con casella di consenso.
- **Statistiche della richiesta** in `/statistiche`: clic su ogni prodotto a pagamento e iscrizioni alla lista.
- **Condizioni di acquisto**: pagina con il testo fornito da Edoardo, salvato in `docs/legale/condizioni-acquisto.md`,
  già pronta per quando la vendita partirà.

## Decisioni prese da Claude (proposte, Edoardo le ha viste nel messaggio e non le ha contestate)

- **Guadagno**: da 5 a 20 monete a partita finita (5 base, +5 se vinci, +1 per parola unica fino a +10); bonus
  giornaliero 20 monete, +10 per ogni giorno consecutivo fino a 70; invito: 200 monete a chi invita e 200 a chi
  arriva col suo link e crea l'account.
- **Monete solo con l'account.** Senza account la partita si gioca ma le monete non si accumulano; a fine partita
  si vede "Avresti guadagnato N monete: crea l'account per tenerle".
- **Benvenuto**: 1000 monete ai primi 100 iscritti, 300 a tutti gli altri.
- **Accessori al lancio**: 12, disegnati in SVG nello stile delle faccine (contorno inchiostro, colori del gioco):
  quattro cappelli, tre occhiali, tre "vestiti" (colletti/sciarpe sotto il viso), due cornici; prezzi da 150 a 1500.
  Tre di questi "esclusivi dei primi iscritti", ottenibili solo col bonus dei primi 100.
  Si indossa al massimo un accessorio per tipo (cappello, occhiali, vestito, cornice).
- **Prodotti a pagamento mostrati** (prezzi IVA inclusa, solo vetrina): 500 monete 0,99 €, 1200 monete 1,99 €,
  3500 monete 4,99 €; username esclusivo di 3 o 4 lettere 2,99 €.
- **Username**: chi ha l'account sceglie un username **unico**, gratis da 5 a 14 caratteri (lettere, numeri,
  trattino basso). Quelli di 3 o 4 caratteri sono gli esclusivi "in arrivo". Chi gioca senza account tiene il nome
  libero di oggi (non unico).
- **Popup dei primi 100**: dopo la prima partita finita (online o da soli), una volta sola per telefono; si riapre
  dal pulsante "Account" in home.
- **Lista d'attesa**: email (quella dell'account se c'è, altrimenti da scrivere), consenso esplicito a ricevere
  un'unica comunicazione quando le vendite aprono, prodotto toccato, data. Si può uscire dalla lista.
- **Partita da soli offline**: le monete guadagnate senza rete si accreditano alla prossima apertura con rete.

## Decisioni di Claude dopo la revisione

- **Privacy**: oggi è un paragrafo dentro `public/index.html` (testo statico) e nel pannello "Come si gioca"
  (`RulesSheet` in `src/screens/Avvisi.js`). Con account ed email diventa una pagina `/privacy` completa (titolare,
  dati raccolti, basi giuridiche, fornitori Google Firebase e Vercel, conservazione, diritti, come cancellare), e il
  paragrafo breve rimanda lì. I dati del titolare li fornisce Edoardo; fino ad allora un segnaposto evidente.
- **Email dall'app installata su iPhone**: il link dell'email si apre in Safari, che ha uno spazio dati diverso
  dall'app. Dall'app installata si propone Google; l'accesso con email resta disponibile con la nota "si apre in
  Safari: poi riapri il gioco dall'icona e accedi di nuovo con la stessa email". Le monete stanno nell'account, quindi
  non si perdono: si perde solo il collegamento automatico con l'identità anonima di quell'app.
- **Username e nome in partita**: chi ha l'account gioca con il proprio username (nella stanza e in coda), non più col
  nome libero. Chi gioca senza account tiene il nome libero di oggi, senza controlli contro gli username altrui: le
  regole di stanze e coda non cambiano. Costo accettato: un anonimo può scrivere lo stesso nome di un iscritto.
- **I 3 accessori esclusivi** arrivano gratis insieme alle 1000 monete a chi entra tra i primi 100; non si comprano.
  Le regole permettono di possederli solo se l'account ha il segno "primi 100".
- **Invito**: vale solo il link dedicato della schermata Account (`/?invito=CODICE`), non i link delle stanze. Conta
  un account nuovo creato da quel link; l'accredito a chi invita avviene alla sua prossima apertura del gioco. Massimo
  20 inviti premiati per account.
- **"Avresti guadagnato N monete"**: se l'account si crea subito dopo, le monete dell'ultima partita (al massimo 20)
  si accreditano insieme al benvenuto. Si conserva solo l'ultima partita.
- **Chi conta tra i primi 100**: ogni account creato (collegato a Google o email). Il contatore si aggiorna con una
  transazione; gli account cancellati non liberano il posto. Se due iscrizioni arrivano nello stesso istante il
  centesimo può diventare il centunesimo: nessuno riceve il messaggio "primi 100" se non è davvero tra i primi.

## Sicurezza (finché non girano soldi veri)

- Monete, accessori e username stanno su Firebase (`users/{uid}`), scritti dal telefono e controllati dalle regole:
  aumenti di monete solo entro limiti (per partita, giornaliero, invito, benvenuto) e non più spesso di un minimo
  intervallo; spese solo al prezzo di catalogo; accessorio posseduto solo se pagato; username unico con una voce
  `usernames/{nome}` scritta una sola volta.
- **Costo accettato**: chi smanetta con il codice potrebbe ottenere qualche moneta o accessorio in più. È estetica,
  non soldi. Quando la vendita vera partirà, monete e acquisti passeranno a funzioni server con Stripe (con le due
  protezioni di sempre: regola sul bordo e blocco dei tentativi); non fa parte di questo progetto.
- La lista d'attesa contiene email: leggibile solo da Edoardo (console Firebase), scrivibile solo dal proprietario.

## Condizioni di acquisto e privacy

- Pagina `/condizioni-acquisto` con il testo di Edoardo; l'indirizzo d'assistenza è info@satoshiweb.it. Si aggiungono:
  chi vende (dati che Edoardo fornirà: fino ad allora un segnaposto evidente), prezzi IVA inclusa, pagamento con carta
  tramite Stripe, legge applicabile e foro del consumatore. Pagina non indicizzata finché la vendita non parte.
- Privacy aggiornata: account (email o account Google), username, monete e accessori, lista d'attesa con email e
  consenso, come cancellare l'account e i dati.

## Interfaccia

- Home: un pulsante "Account" (o il proprio username e le monete se si è dentro), senza appesantire la home che
  oggi entra tutta nella prima schermata su iPhone.
- Schermata Account: accedi con Google, accedi con email, username, monete, invita un amico (link da condividere),
  esci, cancella l'account.
- Negozio: accessori (con anteprima sulla propria faccina), pacchetti di monete e username esclusivi con "In arrivo".
- Gli accessori si vedono sulla faccina ovunque compare (home, lobby, partita, correzione, podio), anche agli altri.
- Stile del gioco (`.claude/design.md`), testi in italiano senza trattino lungo.

## Non obiettivi

- Pagamenti veri, Stripe, fatture, IVA: dopo.
- Classifiche globali, amici, chat.
- Accessori animati complessi o personaggi del club per tutti.

## Anti-obiettivi

- Scarsità finta ("primi 100" quando non è vero).
- Chi non vuole l'account che non riesce più a giocare.
- Le partite online che peggiorano o rallentano.
- Email raccolte senza consenso chiaro o usate per altro.

## Vincoli

- Firebase Auth deve avere attivi Google ed email (lo attiva Edoardo nella console, con la guida di Claude) e il
  dominio nomicosecitta.pro tra quelli autorizzati.
- Sull'iPhone con l'app installata sulla Home l'accesso Google passa dal dominio del sito (regola su Vercel verso
  `/__/auth`), altrimenti Safari lo blocca. Nei browser interni (WhatsApp, Instagram) Google non funziona: si propone
  l'email.
- Regole del database con test sull'emulatore per ogni permesso nuovo. Le regole vanno pubblicate prima del sito.
- `src/engine/rules.js` non si tocca; le partite non cambiano comportamento.

## Lasciato a chi costruisce

- Struttura esatta dei dati e delle regole entro i limiti scritti sopra.
- Disegno dei 12 accessori e loro nomi.
- Come mostrare l'anteprima nel negozio.
- Come provare l'accesso Google sull'emulatore (l'emulatore di Auth lo simula).
