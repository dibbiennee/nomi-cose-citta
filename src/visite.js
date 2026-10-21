// Chi arriva e chi torna, senza account: il telefono ricorda nel suo storage il giorno della prima e dell'ultima
// visita (ncc-visita) e da lì si ricavano i contatori. Niente parte dal telefono se non i conteggi del giorno.
export const VISIT_KEY = 'ncc-visita';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Giorni di calendario tra due date AAAA-MM-GG (l'ora legale non sposta il conto). */
export function daysBetween(a, b) {
  const t = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

/** Fascia oraria in Italia, per sapere a che ora si gioca: ora_00 ... ora_23. */
export const hourKey = (ms) => `ora_${new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' }).padStart(2, '0')}`;

/** Contatori di un'apertura del gioco e la nuova memoria da salvare. */
export function visitEvents(stored, today) {
  const ok = stored && typeof stored === 'object' && DAY.test(stored.first) && DAY.test(stored.last);
  if (!ok) return { events: ['aperture', 'telefoni_nuovi'], next: { first: today, last: today } };
  if (stored.last === today) return { events: ['aperture'], next: stored };
  const events = ['aperture', 'telefoni_tornati'];
  const since = daysBetween(stored.first, today);
  if (since === 1) events.push('tornati_d1');
  if (since === 7) events.push('tornati_d7');
  return { events, next: { first: stored.first, last: today } };
}
