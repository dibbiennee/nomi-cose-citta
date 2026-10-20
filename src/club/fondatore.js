// Modalità Fondatore: lo sblocco del club di amici, con il codice CANT da "Ho un codice".
// Funzioni pure, senza window né document: girano nel browser e nei test su Node.
//
// ATTENZIONE: CANT è un codice corto e indovinabile, scritto nel codice del sito che chiunque può leggere.
// Lo sblocco vale solo sul telefono e decide solo cosa mostra l'interfaccia (cose cosmetiche).
// NON è un'autorizzazione: non va mai mandato a Firebase e non deve proteggere dati privati
// (facce degli amici, contenuti riservati). Per quelli serve una verifica sul server, che oggi non esiste.

export const FOUNDER_CODE = 'CANT';
/** Codici che il motore non assegna mai a una stanza, così "Ho un codice" non è mai ambiguo. */
export const RESERVED_CODES = [FOUNDER_CODE];
export const FOUNDER_KEY = 'ncc-fondatore';

/** Toglie spazi e simboli e porta in maiuscolo, come il campo di "Ho un codice". */
export const cleanCode = (input) => String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isFounderCode = (input) => cleanCode(input) === FOUNDER_CODE;
export const isReservedCode = (code) => RESERVED_CODES.includes(cleanCode(code));

/**
 * Stato dello sblocco salvato nello storage passato (localStorage nel browser, uno finto nei test).
 * Se lo storage manca o dà errore (navigazione privata, spazio pieno) lo sblocco vale finché la pagina è aperta.
 * Nello storage finisce solo "1": mai il codice.
 */
export function createFounderStore(storage) {
  let memory = false;
  const read = () => { try { return storage?.getItem(FOUNDER_KEY) === '1'; } catch (e) { return memory; } };
  return {
    isActive: () => memory || read(),
    activate() { memory = true; try { storage?.setItem(FOUNDER_KEY, '1'); } catch (e) { /* resta in memoria */ } },
    revoke() { memory = false; try { storage?.removeItem(FOUNDER_KEY); } catch (e) { /* niente da togliere */ } },
  };
}
