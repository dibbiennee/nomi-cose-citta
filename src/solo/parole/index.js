// Le parole dei robot, una lista per categoria (formato in ../dizionario.js).
// Si carica con import() solo quando si sceglie "Gioca da solo", così non pesa sull'apertura del gioco.
import nomi from './nomi.js';
import cose from './cose.js';
import citta from './citta.js';
import animali from './animali.js';
import cibi from './cibi.js';
import mestieri from './mestieri.js';
import film from './film.js';
import calciatori from './calciatori.js';

export const LISTE = { nomi, cose, citta, animali, cibi, mestieri, film, calciatori };
