// Catalogo del negozio: accessori comprabili con le monete, prodotti a soldi veri in vetrina (non ancora in
// vendita) e quante monete si guadagnano. La regola dei prezzi in database.rules.json si genera da qui:
// dopo ogni modifica lanciare `node scripts/regole-catalogo.mjs`.

export const TIPI = ['cappello', 'occhiali', 'vestito', 'cornice']; // se ne indossa uno per tipo

export const ITEMS = [
  { id: 'cappellino', nome: 'Cappellino', tipo: 'cappello', prezzo: 150 },
  { id: 'berretto', nome: 'Berretto di lana', tipo: 'cappello', prezzo: 300 },
  { id: 'cilindro', nome: 'Cilindro', tipo: 'cappello', prezzo: 800 },
  { id: 'corona_oro', nome: 'Corona d\'oro', tipo: 'cappello', prezzo: 1500, esclusivo: true },
  { id: 'occhiali_tondi', nome: 'Occhiali tondi', tipo: 'occhiali', prezzo: 200 },
  { id: 'occhiali_sole', nome: 'Occhiali da sole', tipo: 'occhiali', prezzo: 400 },
  { id: 'occhiali_stella', nome: 'Occhiali a stella', tipo: 'occhiali', prezzo: 1500, esclusivo: true },
  { id: 'farfallino', nome: 'Farfallino', tipo: 'vestito', prezzo: 250 },
  { id: 'sciarpa', nome: 'Sciarpa', tipo: 'vestito', prezzo: 500 },
  { id: 'mantello_oro', nome: 'Mantello d\'oro', tipo: 'vestito', prezzo: 1500, esclusivo: true },
  { id: 'cornice_stelle', nome: 'Cornice di stelle', tipo: 'cornice', prezzo: 700 },
  { id: 'cornice_fiamme', nome: 'Cornice di fiamme', tipo: 'cornice', prezzo: 1200 },
  // Premi dei giorni di fila: non si comprano, si ottengono arrivando a quel giorno (src/ritorno/serie.js)
  { id: 'cornice_scintille', nome: 'Cornice di scintille', tipo: 'cornice', serie: 7 },
  { id: 'mantello_notte', nome: 'Mantello della notte', tipo: 'vestito', serie: 30 },
  { id: 'corona_fiamme', nome: 'Corona di fiamme', tipo: 'cappello', serie: 100 },
  // Rari: escono a sorpresa dallo scrigno di fine partita (src/ritorno/scrigno.js)
  { id: 'cappello_mago', nome: 'Cappello da mago', tipo: 'cappello', raro: true },
  { id: 'occhiali_arcobaleno', nome: 'Occhiali arcobaleno', tipo: 'occhiali', raro: true },
  { id: 'collare_gemme', nome: 'Collare di gemme', tipo: 'vestito', raro: true },
];
/** Si compra con le monete solo se ha un prezzo e non è esclusivo dei primi 100, né premio di serie, né raro. */
export const isBuyable = (i) => !!i && !i.esclusivo && !i.serie && !i.raro;
export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

/** Prodotti a soldi veri: per ora solo vetrina, "Compra" porta alla lista d'attesa. */
export const PAID = [
  { id: 'monete_500', nome: '500 monete', prezzo: '0,99 €', monete: 500 },
  { id: 'monete_1200', nome: '1200 monete', prezzo: '1,99 €', monete: 1200 },
  { id: 'monete_3500', nome: '3500 monete', prezzo: '4,99 €', monete: 3500 },
  { id: 'username_corto', nome: 'Username esclusivo di 3 o 4 lettere', prezzo: '2,99 €', username: true },
];

export const EARN = {
  base: 5, vittoria: 5, perUnica: 1, maxUniche: 10, // a partita finita: al massimo 20
  giornaliero: 20, serie: 10, giornalieroMax: 70, // bonus del giorno, che cresce coi giorni consecutivi
  invito: 200, maxInviti: 20,
  benvenutoPrimi: 1000, benvenuto: 300, primi: 100,
  scrigniGiorno: 10, // scrigni a fine partita al giorno
};
