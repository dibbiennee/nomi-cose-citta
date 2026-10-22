# Fonti e controlli del dizionario

Il dizionario (`src/giudice/liste/*.js`) serve a una cosa sola: **proteggere** le parole che riconosce, così due
giocatori non possono bocciarle votando. Una parola finta protetta farebbe più danno di una vera non protetta, quindi
la regola di tutto il lavoro è: **meglio piccolo e pulito che grande e sbagliato**.

I file in `src/giudice/liste/` sono **generati**: non si modificano a mano. Si rigenerano con

```bash
node scripts/compila-dizionario.mjs
```

partendo dai file in `scripts/dizionario-fonti/`.

## Da dove vengono le parole

| Categoria | Fonti |
|---|---|
| **Città** | Elenco dei comuni italiani dell'ISTAT (`Elenco-comuni-italiani.csv`, colonna "Denominazione in italiano", scaricato il 22 ottobre 2026 da istat.it, 7.891 nomi distinti), le liste dei robot e le città estere compilate come sotto. Fonte dei comuni: ISTAT, riutilizzabile con citazione della fonte. |
| **Nomi, Animali, Cibi, Mestieri, Città estere** | Liste scritte per questo progetto da revisori (modelli Claude lanciati nella sessione di lavoro, senza API a pagamento), dalla loro conoscenza e senza copiare liste da internet. |
| **Cose, Film, Calciatori** | Solo le liste dei robot (`src/solo/parole/`): sono categorie aperte, il dizionario ne copre una parte e il resto si vota. |

## Come sono state controllate

1. **Prima stesura** della lista per categoria, con l'istruzione di non mettere nessuna voce dubbia.
2. **Controllo indipendente:** un secondo revisore, che non aveva scritto la lista, l'ha letta per intero e ha
   indicato le voci da **togliere** (non vere, diminutivi o soprannomi, scritte male, troppo rare perché un giocatore
   italiano le riconosca, ruoli o etichette generiche). Nel dubbio le ha tolte. Le voci tolte stanno in
   `scripts/dizionario-fonti/<categoria>.togli.json` e il compilatore le esclude anche se compaiono nelle liste dei
   robot.
3. **Test automatici** (`src/giudice/liste.test.mjs`): niente doppioni, niente voci vuote o con caratteri strani,
   dimensioni minime, un campione di parole vere che devono essere protette e un campione di parole finte che non lo
   devono essere, e le liste dei robot che devono restare dentro tranne le voci tolte di proposito.
4. **Controllo a campione finale** da parte di un revisore indipendente (22 ottobre 2026): 520 parole estratte a caso
   (60 per ogni categoria, 40 comuni italiani). Risultato: **0 sbagliate**, 21 dubbie (4%) che esistono davvero ma sono
   rare o di categoria discutibile (per esempio Pica, Idromele, Akita, Zoografo). La soglia era 1% di sbagliate.

Il controllo toglie anche parole vere (per esempio "Carpa" tra gli animali, "Fragole" tra i cibi): è voluto. Una parola
vera tolta resta votabile come oggi; una parola finta protetta no.

## Dimensioni (22 ottobre 2026)

12.331 voci in tutto: Città 8.426 (7.891 comuni ISTAT più 535 città estere), Nomi 664, Animali 660, Cibi 809,
Mestieri 527, Cose 355, Film 441, Calciatori 449. Le liste pesano circa 77 KB compressi (limite 400 KB) e si
scaricano solo entrando in una stanza online.

## Cosa NON fa

- Non riconosce plurali, sinonimi o errori di battitura: quelle parole si votano come sempre.
- Non copre le parole rare o nuove: il rilascio 2 (verdetto dell'IA con archivio condiviso) è pensato per quelle.
- Non protegge le categorie inventate dall'host.

## Come aggiungere o togliere una parola

- **Aggiungere:** metterla nel file della categoria in `scripts/dizionario-fonti/`, rigenerare, lanciare i test.
- **Togliere:** metterla in `<categoria>.togli.json`, rigenerare, lanciare i test.
