// Salvataggio delle risposte mentre si scrive: si aspetta una pausa nella digitazione (per non scrivere
// nel database a ogni tasto), ma se il telefono passa a un'altra app, si blocca o chiude la pagina
// si salva subito quello che c'è, senza aspettare. Altrimenti l'ultima parola resterebbe in sospeso
// e, se intanto qualcuno preme STOP, andrebbe persa.

export function createAnswerSaver(save, delay = 300) {
  let timer = null;
  let pending = null;
  const flush = () => {
    if (pending === null) return false;
    clearTimeout(timer);
    timer = null;
    const value = pending;
    pending = null;
    Promise.resolve(save(value)).catch(() => {});
    return true;
  };
  return {
    /** Nuove risposte: le salva dopo `delay` ms dall'ultimo cambiamento. */
    set(value) {
      pending = value;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    /** Salva subito ciò che è in attesa. Restituisce true se c'era qualcosa da salvare. */
    flush,
    /** Lascia perdere ciò che è in attesa (nuovo round). */
    cancel() { clearTimeout(timer); timer = null; pending = null; },
    get pending() { return pending !== null; },
  };
}
