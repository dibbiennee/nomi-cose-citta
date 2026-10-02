Devo trasformare questo progetto nel gioco completo "Nomi Cose Città" per telefono, da giocare online con gli amici, e pubblicarlo. Nella cartella `nomi-cose-citta-design/` c'è tutto quello che serve.

## Cosa c'è nella cartella

- `prototypes/Main.dc.html`: il design completo e funzionante (markup con stili inline, animazioni nel `<style>` in alto, logica in `class Component` in fondo). È la fonte di verità per layout, colori, font, testi e animazioni. Gli altri file in `prototypes/` aprono Main su una schermata precisa.
- `engine/rules.js`: le regole del gioco come funzioni pure (punteggi, bocciatura a maggioranza, lettera, premi, nuovo host). Sono provate: `node --test nomi-cose-citta-design/engine/rules.test.mjs` passa 9 test su 9. Usale così come sono.
- `engine/room.js`: bozza del motore multiplayer su Firebase Realtime Database (stanze, ingresso, impostazioni, lettera, timer condiviso, STOP, voti, reazioni, avanzamento, presenza). NON è mai stata eseguita: rileggila, correggila e provala.
- `engine/database.rules.json`: bozza delle regole di sicurezza del database.

## Com'è il progetto adesso

React (create-react-app) + Firebase, con le chiavi già in `.env.production` e accesso anonimo: questo va tenuto. Il resto è uno scheletro: le fasi e il timer sono locali a ogni telefono, non c'è la lettera, non c'è lo STOP, la correzione è un segnaposto ("Voting logic coming next..."), non ci sono punteggi né host. Va sostituito, non adattato.

## Cosa fare, in ordine

1. Leggi `prototypes/Main.dc.html` e i file in `engine/`, poi dimmi in breve il piano. Fai una copia dei file attuali in `_vecchio/` prima di toccarli.
2. **Motore**: porta `engine/` in `src/engine/`, collega `room.js` al `db` e all'`auth` di `src/firebase.js`, e sistemalo finché funziona. Lo stato della stanza sta tutto nel database (`rooms/CODICE`) e ogni telefono mostra la schermata in base a `status`: lobby, spin, play, review, round, awards, final.
3. **Schermate**: riscrivi l'interfaccia in React seguendo il prototipo, una schermata per stato, più l'arrivo dal link `/r/CODICE`, gli avvisi e i pannelli dal basso. Non copiare il runtime del prototipo e non tenere i giocatori finti (Marco, Giulia, Sara) né il loro dizionario: servono solo a simulare.
4. **Regole del database**: pubblica `database.rules.json` dopo averle controllate.
5. **Prova**: `npm run build` senza errori, poi apri 3 finestre nella stessa stanza e gioca una partita intera (crea, entra dal link, cambia impostazioni, lettera, STOP, tempo scaduto, voti, punteggi, premi, podio, rivincita). Prova anche: chiudere la finestra dell'host a metà partita, entrare a partita iniziata, stanza piena, codice sbagliato.
6. Mostrami gli screenshot a 390px delle schermate principali e pubblica su Vercel solo dopo il mio ok.

## Regole del gioco

- Stanza con codice di 4 caratteri e link `/r/CODICE`. Chi apre il link sceglie faccina, colore e nome ed entra.
- Solo l'host cambia le impostazioni (categorie anche inventate, numero di round, giocatori massimi, tempo 60s / 90s / 2 min / libero, esclusione lettere difficili), rimuove giocatori, avvia e fa avanzare la partita. Se l'host esce, diventa host il giocatore entrato per primo tra quelli online.
- La lettera la estrae l'host e viene salvata nella stanza: tutti vedono la stessa animazione, la stessa lettera e lo stesso conto alla rovescia 3, 2, 1, Via.
- Il tempo si calcola dall'orario di fine salvato nel database e dall'ora del server, così è uguale su tutti i telefoni.
- Le risposte si salvano mentre si scrive. STOP si può premere solo con tutte le categorie compilate; vince il primo che lo preme e il round si chiude per tutti. Se scade il tempo si chiude da solo.
- Correzione: una categoria alla volta, tutti vedono le risposte di tutti e possono votare "non vale" sulle parole degli altri. Una parola è bocciata se vota contro più di metà degli altri giocatori.
- Punti: 20 se sei l'unico ad aver dato una risposta valida, 10 parola unica, 5 parola uguale a un altro (senza contare maiuscole e accenti), 0 se vuota, con la lettera sbagliata o bocciata.
- Dopo l'ultimo round: premi (Fulmine, Originale, Copione), poi il podio. "Rivincita" azzera i punteggi nella stessa stanza.
- Chi entra a partita iniziata aspetta e gioca dal round successivo. Chi si disconnette resta in stanza come offline e le sue risposte contano come vuote.

## Dettagli del design da rispettare

Aggiunte prese dal confronto con StopotS (tutte già nel design):
- **Categorie inventate**: nella Nuova stanza l'host può scrivere una categoria sua e aggiungerla.
- **Rimuovi giocatore**: in lobby l'host ha una X accanto a ogni giocatore.
- **Correzione fatta da tutti**: ogni giocatore vota dal proprio telefono; mostra il risultato in diretta ("Bocciata dalla stanza" quando più di metà stanza vota contro).
- **Reazioni veloci** durante la correzione ("Ahah", "Geniale", "Ma dai!", "Rubata", "Non esiste"): chi le tocca le fa comparire a tutti come bolla che sale, con il suo avatar.

Dettagli del design da rispettare:
- **Stile**: sfondi a tinta piena (giallo in home e finale, lilla in lobby, corallo all'estrazione, colore della categoria in correzione), elementi bianchi con bordo scuro spesso e ombra netta sotto, pulsanti che "si schiacciano" al tocco.
- **Avatar**: faccina (6 espressioni, si cambia toccandola) + colore (6). Vanno salvati nel profilo del giocatore e mostrati ovunque.
- **Conto alla rovescia**: dopo la lettera compare 3, 2, 1, "Via!" uguale per tutti, poi parte il tempo.
- **Partita**: barra del tempo in alto (diventa rossa negli ultimi 10 secondi), sotto le faccine degli altri con quante categorie hanno riempito. Campi su una colonna fino a 4 categorie, su due colonne da 5 in su. Il pulsante STOP si riempie di colore man mano che compili e si attiva quando è pieno.
- **Classifica in partita**: il pulsante con la coppa apre un pannello con i punteggi attuali.
- **Impostazioni dalla lobby**: l'host può riaprirle con "Impostazioni" e le modifiche valgono per tutti.

Schermate e stati in più (tutti nel prototipo: per vederli cambia la prop `start` di Main, valori: home, invite, setup, lobby, lobbyGuest, spin, play, stop, offline, review, reviewGuest, round, awards, final, error; per gli avvisi la prop `kind`: notfound, full, started, kicked):
- **Arrivo dal link** (`invite`): chi apre `/r/CODICE` vede chi lo aspetta, sceglie faccina, colore e nome ed entra.
- **Vista dell'invitato**: in lobby, correzione, fine round e premi chi non è host vede il pulsante spento con "Va avanti <host>…" e segue l'host in automatico.
- **Premi** (`awards`), tra l'ultimo round e il podio: Fulmine (più STOP premuti), Originale (più parole uniche), Copione (più parole doppie). Tieni questi tre contatori per giocatore durante la partita.
- **Avvisi** (`error`): stanza non trovata, stanza piena, partita già iniziata (chi arriva tardi aspetta ed entra al round successivo), rimosso dall'host.
- **Connessione persa**: avviso in alto mentre riprova a collegarsi; le parole già scritte restano.
- **Uscita**: dalla classifica in partita "Esci dalla partita" apre una conferma.

Animazioni (classi `.n-*` e `@keyframes` nel `<style>` del prototipo, da riportare uguali): entrata di ogni schermata, tessere del titolo che fluttuano, faccine che sbattono gli occhi e dondolano, lettera che trema e poi esplode con gli anelli, numeri del conto alla rovescia, lettera che ruota all'inizio della partita, pulsante STOP che si riempie e poi oscilla, scritta STOP a tutto schermo, righe della correzione a cascata e scossa quando una parola viene bocciata, bolle delle reazioni, faccine che corrono sulla barra a fine round, carte dei premi una dopo l'altra, podio che sale con la corona che cade e i coriandoli. Con `prefers-reduced-motion` vanno spente.
