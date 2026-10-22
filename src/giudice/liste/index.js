// Le parole che il dizionario riconosce, per categoria. Per ora quelle delle liste dei robot; le liste complete le
// compila scripts/compila-dizionario.mjs (vedi docs/dizionario-fonti.md).
import { LISTE as ROBOT } from '../../solo/parole/index.js';

const parole = (lista) => Object.values(lista).flat().map(([parola]) => parola);
export const LISTE = Object.fromEntries(Object.entries(ROBOT).map(([cat, lista]) => [cat, parole(lista)]));
