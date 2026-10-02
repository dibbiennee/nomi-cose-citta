# Design

Vale per qualunque lavoro su interfaccia: pagine nuove, componenti, restyling.

## Prima di scrivere codice

Per ogni schermata o componente nuovo, scrivi un piano di cinque righe e mostramelo:

1. Soggetto e pubblico reale (non "utenti", chi esattamente)
2. Palette: 4–6 valori hex con un nome ciascuno
3. Tipografia: una o due famiglie, con il ruolo di ognuna
4. Concetto di layout, in una frase
5. L'elemento su cui si spende l'audacia — uno solo

Poi rileggi il piano e chiediti: verrebbe fuori uguale per qualsiasi altro
progetto dello stesso genere? Se sì, riscrivi la parte generica e dimmi cosa hai
cambiato. Solo dopo il codice.

Se il brief non contiene un riferimento visivo concreto, chiedimelo prima di
partire. Un riferimento vale più di dieci aggettivi.

## Token del progetto

Fonte di verità: `nomi-cose-citta-design/prototypes/Main.dc.html`. I valori qui sotto
sono letti da lì; se divergono, vince il prototipo.

- Palette:
  - Inchiostro `#17122B`: testo, bordi, ombre nette. Non esiste nero puro nel progetto.
  - Giallo `#FFD23F`: home, podio, azione principale.
  - Corallo `#FF8A65`: Nomi, estrazione della lettera.
  - Cielo `#5CD0FF`: Cose, premi.
  - Lilla `#B79CFF`: Città, lobby, invito.
  - Menta `#6EE7A8`: risposta giusta, punti guadagnati.
  - Rosa `#FF7EB6`: Mestieri, Copione.
  - Rosso STOP `#FF5E3A` (testo d'errore `#C4300F`).
  - Fondo pagina `#F6F3FF`, divisori `#E6E0F7`, testo secondario `#5E5880`,
    spento `#EDE8FB` / bordo `#CFC8EA` / testo `#6F698F`, placeholder `#A39DC4`.
  - Categorie extra: Cibi `#FFB547`, Film `#9AA8FF`, Calciatori `#E8E46A`;
    inventate a rotazione `#7FE3D0`, `#FFA6C9`, `#C7F06B`, `#FFC78A`.
- Tipografia:
  - Bricolage Grotesque 800: titoli, lettera estratta, numeri grandi, STOP.
  - Figtree 400–800: tutto il resto, pulsanti in 800.
  - JetBrains Mono 500–700: codice stanza, timer, punteggi in tabella.
  - Scala: 11, 12, 13, 14, 15, 16, 17, 19, 22, 26, 28, 30, 34, 36, 40, 44, 124 (STOP), 136 (lettera).
- Scala spaziature: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30. Margine laterale 20px
  (24 in home e invito), barra inferiore `14px 20px 26px`.
- Border radius: 8 etichette, 12–14 pulsanti piccoli, 16–20 campi e pulsanti, 22–24 card,
  28–34 pannelli e testate, 40 tessera della lettera, 999 pillole.
- Bordo e ombra: bordo `2.5px` inchiostro, ombra netta `0 4–5px 0` inchiostro (mai sfumata).
  Pulsante premuto: scende di 4px e l'ombra va a 1px.
- Aree di tocco: minimo 44×44.

Scelte del prototipo che questo file altrimenti sconsiglia, tenute perché il brief vince:
etichette maiuscole spaziate ("CODICE STANZA", "ROUND 1 DI 3"), il punto centrale in
"LETTERA M · ROUND 1 DI 3", il monospace per timer e punteggi, l'entrata animata di ogni
schermata.

## Da evitare — sono i segnali riconoscibili di UI generata

- Fondo crema (#F4F1EA) + serif ad alto contrasto + accento terracotta (#D97757)
- Nero finto tinteggiato (#0B0B0B, #111) al posto del nero o di un colore vero
- Etichetta in maiuscoletto spaziato sopra ogni titolo
- Stringhe di metadati unite da punti centrali: "A · B · C"
- Etichette costruite come "PAROLA — frammento" con em dash spaziato
- Accentare una parola sola del titolo in corsivo, grassetto o colore
- Contenuto tagliato in card identiche: stesso border-radius su tutto a
  prescindere dalla gerarchia, stessa ombra grigia rgba(0,0,0,.1) sotto ognuna
- Marcatori numerati 01 / 02 / 03 quando il contenuto non è davvero una sequenza
- Monospace per le etichette dei dati piccoli
- Freccia "→" appiccicata al testo di link e bottoni
- Gradient wash usato come decorazione
- Fade-and-slide-up su ogni sezione, transizione hover su ogni card

Se il brief chiede esplicitamente uno di questi look, il brief vince. Sono
default, non divieti: il problema è usarli senza averli scelti.

## Movimento

Un solo momento orchestrato per pagina — un caricamento o una rivelazione. Il
movimento che risponde a un'azione della persona (apre, espande, conferma) è
sempre benvenuto perché mostra cosa è cambiato. Quello che parte da solo va
giustificato. `prefers-reduced-motion` rispettato ovunque.

## Tipografia

Una o due famiglie, e se due devono essere nettamente distinte. Scala
tipografica dichiarata, con pesi e spaziature scelti. Riga di testo sotto gli 80
caratteri; le grazie possono andare un po' più lunghe e vogliono più interlinea
del sans. Quando il testo è titolo, il trattamento tipografico è parte attiva del
design, non un contenitore neutro.

## Struttura

Bordi, numeri, divisori, etichette ed eyebrow codificano informazione, non
decorano. Prima di aggiungerne uno, dì a voce quale informazione porta. Se non
c'è risposta, non va messo.

## Copy

La copy è contenuto di design. Voce attiva. Il bottone dice cosa succede
("Salva le modifiche", non "Invia"), e l'azione mantiene lo stesso nome per
tutto il flusso. Errori e stati vuoti spiegano cosa fare, senza scusarsi e senza
essere vaghi. Niente testo di riempimento con tono da brochure.

## Pavimento di qualità

Responsive fino a 360px, focus da tastiera visibile, contrasto AA, reduced
motion, palette armonica. Va costruito, non annunciato nella risposta.

## Il pezzo forte

Quando la richiesta è "fai qualcosa che colpisca", non riusare i componenti
esistenti: costruisci in isolamento in `/sandbox` o in un file standalone, fallo
funzionare, e solo dopo lo integriamo. Conformarsi al codebase è giusto per il
lavoro ordinario ed è esattamente ciò che appiattisce il lavoro di design.
