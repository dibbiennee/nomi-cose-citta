# Giudice delle parole: dizionario che protegge, poi IA

Data: 22 ottobre 2026.

## Perché

Nel gioco online una risposta viene bocciata se vota contro più di metà degli altri giocatori
(`isRejected` in `src/engine/rules.js`). In una stanza di tre, due persone che si mettono d'accordo tolgono
qualsiasi parola, anche "Aquila" per la A, e chi l'ha scritta non può farci niente. Edoardo l'ha segnalato come
difetto serio: si può far perdere qualcuno per dispetto. Chiede un motore che "analizzi lì per lì o sappia tutte
le parole", e ha deciso: **prima il dizionario, poi l'IA** (Haiku 5.5, se la prova lo conferma).

Oggi esiste solo un dizionario piccolo (circa 58 KB, `src/solo/parole/`, formato in `src/solo/dizionario.js`)
scritto per far giocare i robot: non conosce tutte le parole vere, quindi non può bocciare, ma può **proteggere**
quelle che conosce.

## Cosa deve fare (deciso con Edoardo)

- **Rilascio 1, senza costi e senza IA:** una parola che il dizionario riconosce per quella categoria e quella
  lettera **non si può togliere votando**. Per le parole che il dizionario non conosce si vota come oggi.
- **Dizionario molto più grande** delle liste dei robot, soprattutto per Città, Nomi e Animali, e ragionevole per
  Mestieri e Cibi. Cose, Film e Calciatori sono categorie aperte: il dizionario ne copre una parte, il resto si vota.
- **Rilascio 2 (solo dopo la prova di Haiku 5.5 contro Sonnet 5.5 con `scripts/prova-giudice.mjs`):** per le parole
  che il dizionario non conosce giudica un'IA (valida / non valida / incerta), e il verdetto va in un archivio
  condiviso: la seconda volta la stessa parola non costa niente. L'IA decide; il voto resta solo per "incerta".
- Il motore **non deve far perdere più persone di prima**: nel dubbio una parola resta votabile, mai bocciata a
  priori.

## Decisioni prese da Claude (proposte, Edoardo le ha viste e ha detto "si può provare")

- **Dove si interviene:** non in `src/engine/rules.js`, che non si tocca. Il punto è dove `src/engine/room.js`
  prepara i voti prima del punteggio (`honestVotes`): lì i voti contro una risposta protetta si scartano, prima di
  chiamare `scoreRound`. Così le regole del punteggio restano identiche.
- **Protezione per categoria e lettera:** una parola è protetta solo se è nel dizionario **della categoria in cui è
  stata scritta** e comincia con la lettera del round. "Lampada" tra gli animali non è protetta.
- **Confronto tollerante, non indovino:** maiuscole, accenti, apostrofi e spazi in più non contano
  (`normalize` esiste già). Plurali e errori di battitura non entrano nel rilascio 1: la parola resta votabile come
  oggi.
- **La schermata del voto lo dice:** le risposte protette portano un segno chiaro ("nel dizionario") e non hanno il
  tasto per votare contro, così nessuno spreca un voto e nessuno si sente ingannato.
- **Il dizionario si carica solo quando serve** (entrando in una stanza online o nella partita veloce), non
  all'apertura del gioco, e sta tra i file in `/static/` che il service worker già tiene in copia. Peso massimo
  indicato: 400 KB compressi per tutte le liste insieme, da verificare con la build.
- **Il dizionario non deve contenere parole sbagliate** (una parola finta protetta è peggio di una vera non
  protetta): meglio un dizionario più piccolo e pulito. Le liste si compilano da fonti con licenza compatibile
  (per esempio l'elenco dei comuni italiani dell'ISTAT) e dalle liste esistenti dei robot; i nomi delle fonti si
  scrivono in un file `docs/dizionario-fonti.md`.
- **Chi gioca da solo contro i robot non cambia:** lì i robot votano già onestamente col dizionario piccolo.
- **Costi del rilascio 2** (da `scripts/prova-giudice.mjs`, stime da misurare): con Haiku 5.5 circa 6 centesimi di
  dollaro ogni 100 partite, con Sonnet 5.5 circa 20 volte tanto; un servizio sul server con le due protezioni
  (regola sul bordo di 60 richieste al minuto per IP, blocco dei tentativi) e la chiave API solo lato server.
  Il rilascio 2 ha un progetto suo, scritto dopo i risultati della prova.

## Decisioni di Claude dopo il controllo del costruttore

- **Una sola funzione per tutti.** "Protetta" lo decide una funzione pura, la stessa in tre punti: la preparazione
  dei voti per il punteggio (`honestVotes` in `src/engine/room.js`), la schermata del voto e quella dei risultati
  (`src/screens/Review.js`, che oggi calcola da sé le bocciature). Se ne usassero due diverse, lo schermo direbbe
  "bocciata" mentre l'host assegna i punti.
- **Il dizionario si carica all'ingresso nella stanza**, ben prima del voto, con un secondo tentativo se fallisce. Se
  a un telefono non è ancora arrivato quando serve, quel telefono vota come oggi (nessuna protezione), mai il
  contrario. Resta una finestra rarissima in cui host e altri telefoni non si trovano d'accordo sul segno; si accetta
  nel rilascio 1 e si elimina nel rilascio 2, quando il verdetto sta nell'archivio condiviso.
- **Solo le categorie del gioco hanno protezione:** Nomi, Cose, Città, Animali, Cibi, Mestieri, Film, Calciatori, per
  la loro chiave. Le categorie inventate dall'host non sono mai protette, nemmeno se la chiave coincidesse.
- **Quanto grande, e chi controlla.** Si spedisce quello che si può compilare pulito, categoria per categoria, senza
  aspettare le altre. Obiettivi indicativi: Città almeno 7.000 voci (comuni ISTAT più le città del mondo più note),
  Nomi almeno 600, Animali almeno 500, Cibi almeno 400, Mestieri almeno 300; Cose, Film e Calciatori restano con le
  liste dei robot. Un controllo con script (formato, duplicati, lettere) più una verifica indipendente a campione
  da parte di un secondo revisore: se una lista non regge la verifica, esce più piccola o non esce.
- **Parole composte e nomi propri: confronto esatto** dopo la normalizzazione. "Reggio Emilia" è protetta, "Reggio"
  da sola resta votabile; "Andrea" per i Nomi vale per intero, senza forme o generi diversi.
- **Partita veloce e robot:** i voti dei robot si calcolano come oggi; la protezione si applica dopo e non cambia il
  risultato, perché il dizionario dei robot non boccia parole che conosce. La partita da soli resta com'è: la
  schermata solo usa già `room.solo.known`; l'etichetta "nel dizionario" compare solo nelle stanze online.

## Sicurezza e correttezza

- Il verdetto "protetta" lo calcola ogni telefono dallo stesso dizionario e dalla stessa parola: nessun dato nuovo
  nel database nel rilascio 1, quindi nessuna regola nuova.
- Nessun telefono può proteggere una parola che il dizionario non conosce: il dizionario è codice, non dati scritti
  dai giocatori.
- Il punteggio lo calcola chi lo calcolava già (host): se il dizionario non si è caricato in tempo, si vota come
  oggi, mai si boccia una parola per questo.

## Interfaccia

- Stile del gioco (`.claude/design.md`), testi in italiano senza trattino lungo, aree di tocco 44×44, responsive
  fino a 360px.
- Sulla riga della risposta protetta: etichetta "nel dizionario" al posto del conteggio dei voti, senza tasto per
  bocciare. Le altre righe restano come oggi.

## Non obiettivi

- IA, archivio condiviso e servizio sul server (rilascio 2, progetto a parte).
- Plurali, sinonimi, correzione dei refusi.
- Cambiare il punteggio o le regole di gioco.

## Anti-obiettivi

- Bocciare per errore una parola vera.
- Un dizionario pieno di parole inventate o di errori.
- Rallentare l'apertura del gioco o la partita.
- Far sentire "giudicato da una macchina" chi gioca con gli amici: il segno deve spiegare, non punire.

## Vincoli

- `src/engine/rules.js` non si tocca; le regole del database non cambiano nel rilascio 1.
- Il dizionario gira nel browser e su Node (funzioni pure, nessun `window`), come `src/solo/dizionario.js`.
- Provato con test su Node e con una prova nel browser a due telefoni.

## Lasciato a chi costruisce

- Fonti e compilazione del dizionario, entro il limite di peso e la regola "meglio pulito che grande".
- Dove si carica il dizionario nelle stanze online e nella partita veloce.
- Come si scrive e si mostra l'etichetta "nel dizionario".
- Come si prova che i voti contro una parola protetta non contano, anche in stanze da tre con due voti d'accordo.
