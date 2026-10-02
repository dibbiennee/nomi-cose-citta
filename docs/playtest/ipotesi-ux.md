# Ipotesi UX da verificare nel playtest

Queste sono **ipotesi**, non problemi. Vengono dalla lettura del gioco e dalle prove fatte da me con i
giocatori automatici, che non si comportano come persone. Nessuna va corretta prima del test con
4 persone reali: il test serve a confermarle o smentirle, e a trovare quelle che qui mancano.

Per ognuna: cosa potrebbe succedere, perché lo sospetto, cosa guardare, e cosa la conferma o la smentisce.
Il codice (H1, H2…) serve a collegare le osservazioni del kit a queste ipotesi.

Forza dell'ipotesi:
- **forte**: c'è un motivo tecnico preciso per cui potrebbe succedere;
- **media**: dipende da come le persone leggono la schermata;
- **debole**: probabilmente va bene, ma vale la pena guardare.

---

## Ingresso e lobby

**H1 · Rientrare dopo aver chiuso la pagina (forte).**
Chi chiude la scheda per sbaglio potrebbe non sapere come tornare.
- *Perché:* la home non ha un "rientra nell'ultima stanza". Bisogna riaprire il link di WhatsApp o
  scrivere il codice, che si vede solo in lobby.
- *Guardare:* qualcuno chiede "come rientro?" o chiede di nuovo il link.
- *Conferma:* almeno una persona non riesce a rientrare da sola entro 30 secondi.
- *Smentita:* tutti rientrano dal link senza aiuto.

**H2 · Link aperto dentro WhatsApp e poi nel browser (forte).**
Chi apre il link nel browser interno di WhatsApp e poi passa a Safari o Chrome potrebbe comparire come
un giocatore nuovo, doppio.
- *Perché:* l'identità anonima è salvata nel browser, e il browser interno di WhatsApp ha una memoria
  separata da Safari e Chrome.
- *Guardare:* la stessa persona compare due volte in lobby, oppure una delle due copie resta "offline".
- *Conferma:* succede anche una volta sola.
- *Smentita:* nessun doppione con almeno 2 telefoni che aprono dal link di WhatsApp.

**H3 · Cambiare faccina dall'invito (media).**
Chi entra dal link potrebbe non scoprire che la faccina si cambia toccandola.
- *Perché:* in home c'è l'icona con le frecce sulla faccina, nella schermata di invito no.
- *Guardare:* chi entra dal link tiene la faccina di partenza; qualcuno chiede "come cambio faccia?".
- *Conferma:* nessuno di quelli entrati dal link cambia faccina, oppure qualcuno lo chiede.

**H4 · "Manca qualcuno?" (media).**
I posti "libero" in lobby (fino a 8) potrebbero far pensare che manchino molte persone, o che si debba
aspettare di riempirli.
- *Guardare:* esitazione prima di premere "Inizia partita" con 4 giocatori; domande tipo "aspettiamo gli altri?".

**H5 · Chi può far partire la partita (debole).**
Gli invitati vedono "Va avanti Anna…" e il badge HOST: dovrebbe bastare.
- *Guardare:* qualcuno che non è host cerca di avviare, o chiede chi deve premere.

---

## Estrazione della lettera

**H6 · Durata dell'estrazione nei round successivi (media).**
L'estrazione con conto alla rovescia dura circa 5 secondi: al primo round crea attesa, dal terzo
potrebbe sembrare lenta.
- *Guardare:* sbuffi o "dai dai" durante l'estrazione dal secondo round in poi.

**H7 · Quando la lettera è definitiva (debole).**
La lettera che trema poi si ferma con gli anelli e "Tutto con la M!": dovrebbe essere chiaro.
- *Guardare:* qualcuno inizia a pensare a parole con la lettera sbagliata vista durante il tremolio.

---

## Partita

**H8 · Tastiera del telefono sopra i campi o sopra STOP (forte).**
Con la tastiera aperta, il pulsante STOP e gli ultimi campi potrebbero finire nascosti, soprattutto con
5 o più categorie.
- *Perché:* l'ho provato solo in un browser senza tastiera virtuale. Su iPhone la tastiera ridimensiona
  la pagina in modo diverso da Android.
- *Guardare:* qualcuno deve chiudere la tastiera per premere STOP, o non trova un campo.
- *Conferma:* succede su almeno un modello di telefono.

**H9 · STOP prima di aver riempito tutto (media).**
Qualcuno potrebbe premere STOP presto e non capire perché non funziona.
- *Perché:* il pulsante dice "Ancora 2 per lo STOP" e al tocco compare un avviso, ma non è un pulsante spento.
- *Guardare:* tocchi ripetuti su STOP; la domanda "perché non si ferma?".

**H10 · Cosa vuol dire "può fermare" (media).**
L'etichetta accanto a chi ha riempito tutto potrebbe non essere capita, o non essere notata.
- *Guardare:* qualcuno commenta "Bea ha finito!" (capito) oppure chiede cosa significa.

**H11 · Maiuscole, accenti, lettera sbagliata (debole).**
Il campo diventa colorato quando la parola inizia con la lettera giusta e mostra "Inizia con M" quando è
sbagliata. Le persone potrebbero chiedersi se "milano" minuscolo vale.
- *Guardare:* domande su maiuscole o accenti.

---

## STOP

**H12 · Il momento STOP funziona come momento di gioco (media).**
La scritta STOP a tutto schermo su ogni telefono dovrebbe far reagire le persone ("Aspetta, non avevo finito!").
- *Perché lo dubito:* chi stava scrivendo vede i campi bloccarsi subito, senza preavviso.
- *Guardare:* reazioni vocali al momento dello STOP. Silenzio o "è finito?" vanno annotati.

**H13 · Le parole scritte negli ultimi istanti (media).**
Chi scrive nell'ultimo secondo potrebbe pensare di aver perso la parola.
- *Perché:* le parole si salvano fino a 3 secondi dopo lo STOP, ma questo non si vede.
- *Guardare:* in correzione qualcuno dice "avevo scritto una cosa diversa".

---

## Correzione

**H14 · L'host va avanti prima che tutti abbiano votato (forte).**
Gli altri potrebbero lamentarsi "aspetta, stavo votando".
- *Perché:* l'host non vede chi ha già votato e chi no; il pulsante "Prossima categoria" è sempre attivo.
- *Guardare:* proteste mentre l'host passa alla categoria successiva.
- *Conferma:* succede almeno una volta per partita.

**H15 · Durata della correzione (media).**
Con 5 categorie e 4 giocatori la correzione potrebbe sembrare lunga, soprattutto per chi non è host e
può solo aspettare il suo turno.
- *Guardare:* telefoni posati, conversazioni d'altro, durata della correzione rispetto al round.

**H16 · La soglia del voto (media).**
"Servono 2 «non vale» per bocciare una parola" e "1 su 2 per bocciarla" dovrebbero rendere la regola chiara.
- *Guardare:* discussioni su "perché è ancora valida se l'ho bocciata?".

**H17 · Il significato di 20, 10 e 5 (media).**
"Unico a rispondere" (20) e "unica" (10) si somigliano e potrebbero confondere.
- *Guardare:* domande sui punti; qualcuno che non capisce perché ha preso 10 e non 20.

**H18 · Le reazioni (media).**
Le reazioni rapide potrebbero non essere notate: stanno in una riga scorrevole in basso e l'ultima
("Non esiste") è tagliata dal bordo dello schermo.
- *Guardare:* quante reazioni vengono mandate in una partita; se qualcuno scorre la riga.

---

## Punti, premi, podio, rivincita

**H19 · La rivincita la decide solo l'host (media).**
Gli invitati vedono "Rivincita: decide Anna" spento: potrebbe frenare chi vuole subito un'altra partita.
- *Guardare:* chi propone la rivincita, e quanto tempo passa tra podio e nuova partita.

**H20 · "Torna alla home" dal podio (media).**
Chi preme "Torna alla home" esce dalla stanza e non è più nella rivincita.
- *Guardare:* qualcuno esce per sbaglio e poi chiede come rientrare (si collega a H1).

**H21 · Il premio "Copione" (debole).**
Potrebbe essere letto come una presa in giro sgradita o, al contrario, essere il momento più divertente.
- *Guardare:* reazioni quando compare.

---

## Comportamento reale del telefono

**H22 · Telefono bloccato in correzione = 0 punti (forte).**
Chi blocca lo schermo o cambia app mentre l'host calcola i punti potrebbe prendere 0 nel round anche se
aveva risposto.
- *Perché:* le risposte di chi è offline al momento del calcolo contano come vuote, come chiede la
  regola del gioco. Su iPhone una pagina in secondo piano perde la connessione dopo poco.
- *Guardare:* qualcuno con risposte valide che prende 0 e non capisce perché; faccina spenta (offline) in correzione.
- *Conferma:* succede anche una volta.

**H23 · L'host che cambia app perde il posto (media).**
Se l'host resta fuori dal gioco più di qualche secondo, il posto passa a un altro. Al ritorno vede
"Va avanti Bea…" e potrebbe non capire perché.
- *Guardare:* "perché non posso più andare avanti?" detto dall'host di prima.

**H24 · L'attesa di chi entra tardi (media).**
Chi entra a partita iniziata vede "Aspetto il prossimo round" senza sapere quanto manca né cosa sta succedendo.
- *Guardare:* quanto aspetta; se chiede "quando tocca a me?".

**H25 · Connessione mobile lenta (media).**
Su rete mobile, timer e STOP potrebbero arrivare con un ritardo percepibile rispetto agli altri.
- *Guardare:* "a me è ancora aperto!" dopo uno STOP; differenze del timer tra telefoni accostati.

---

## Come usarle

Durante il test non vanno lette ai giocatori. L'osservatore annota quello che succede nel kit, e quando
un evento riguarda un'ipotesi ne scrive il codice. Dopo il test le ipotesi diventano:
**confermate** (osservate, con la frequenza), **smentite** (le condizioni si sono verificate e il problema
non c'è stato), oppure **non verificate** (le condizioni non si sono presentate).
