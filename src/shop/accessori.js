// Disegni degli accessori, nelle stesse coordinate della faccina (viewBox 48×48, centro 24,24, raggio 22,5):
// [tag, attributi] di forme SVG semplici. Cappelli e cornici escono un po' dal cerchio (l'SVG ha overflow visibile).
// Contorno inchiostro come le faccine, colori della palette del gioco.
import { ITEMS, TIPI } from './catalogo.js';

const INK = '#17122B';
const s = (extra = {}) => ({ stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round', strokeLinecap: 'round', ...extra });

export const ACCESSORI = {
  cappellino: [
    ['path', s({ d: 'M9 13q15-14 30 0z', fill: '#FF7EB6' })],
    ['path', s({ d: 'M30 12q8 0 13 3', fill: 'none' })],
  ],
  berretto: [
    ['path', s({ d: 'M8 15q16-17 32 0v3H8z', fill: '#5CD0FF' })],
    ['circle', s({ cx: 24, cy: 1, r: 3.5, fill: '#FFFFFF' })],
  ],
  cilindro: [
    ['rect', s({ x: 14, y: -10, width: 20, height: 20, rx: 2, fill: INK })],
    ['rect', { x: 14, y: 4, width: 20, height: 3.5, fill: '#FF5E3A' }],
    ['path', s({ d: 'M7 11h34', fill: 'none' })],
  ],
  corona_oro: [
    ['path', s({ d: 'M10 11 8-4l7 6 9-12 9 12 7-6-2 15H10z', fill: '#FFD23F' })],
    ['circle', { cx: 24, cy: 4, r: 1.8, fill: '#FF5E3A' }],
  ],
  occhiali_tondi: [
    ['circle', s({ cx: 16.5, cy: 21, r: 5.5, fill: 'rgba(255,255,255,.35)' })],
    ['circle', s({ cx: 31.5, cy: 21, r: 5.5, fill: 'rgba(255,255,255,.35)' })],
    ['path', s({ d: 'M22 21h4', fill: 'none' })],
  ],
  occhiali_sole: [
    ['rect', s({ x: 9.5, y: 16.5, width: 12, height: 8, rx: 3, fill: INK })],
    ['rect', s({ x: 26.5, y: 16.5, width: 12, height: 8, rx: 3, fill: INK })],
    ['path', s({ d: 'M21.5 19h5', fill: 'none' })],
  ],
  occhiali_stella: [
    ['polygon', s({ points: '16.5,13 18.6,18.4 24,18.6 19.8,22 21.3,27.5 16.5,24.4 11.7,27.5 13.2,22 9,18.6 14.4,18.4', fill: '#FFD23F' })],
    ['polygon', s({ points: '31.5,13 33.6,18.4 39,18.6 34.8,22 36.3,27.5 31.5,24.4 26.7,27.5 28.2,22 24,18.6 29.4,18.4', fill: '#FFD23F' })],
  ],
  farfallino: [
    ['path', s({ d: 'M24 45l-8-5v10zM24 45l8-5v10z', fill: '#FF5E3A' })],
    ['circle', s({ cx: 24, cy: 45, r: 2.2, fill: '#FF5E3A' })],
  ],
  sciarpa: [
    ['path', s({ d: 'M7 38q17 10 34 0l2 5q-19 11-38 0z', fill: '#6EE7A8' })],
    ['path', s({ d: 'M33 43l3 10h5l-2-11', fill: '#6EE7A8' })],
  ],
  mantello_oro: [
    ['path', s({ d: 'M6 40q18 12 36 0l4 9q-22 8-44 0z', fill: '#FFD23F' })],
    ['circle', s({ cx: 24, cy: 47, r: 2.4, fill: '#FF5E3A' })],
  ],
  cornice_stelle: [
    ['polygon', s({ points: '24,-3 25.6,0.5 29.4,0.6 26.4,3 27.4,6.6 24,4.6 20.6,6.6 21.6,3 18.6,0.6 22.4,0.5', fill: '#FFD23F', strokeWidth: 1.8 })],
    ['polygon', s({ points: '47,20 48.6,23.5 52.4,23.6 49.4,26 50.4,29.6 47,27.6 43.6,29.6 44.6,26 41.6,23.6 45.4,23.5', fill: '#FFD23F', strokeWidth: 1.8 })],
    ['polygon', s({ points: '1,20 2.6,23.5 6.4,23.6 3.4,26 4.4,29.6 1,27.6 -2.4,29.6 -1.4,26 -4.4,23.6 -0.6,23.5', fill: '#FFD23F', strokeWidth: 1.8 })],
  ],
  cornice_fiamme: [
    ['path', s({ d: 'M3 36q-6-10 2-17-1 6 3 8q-2-9 6-14-1 7 3 9', fill: '#FF8A65', strokeWidth: 1.8 })],
    ['path', s({ d: 'M45 36q6-10-2-17 1 6-3 8q2-9-6-14 1 7-3 9', fill: '#FF8A65', strokeWidth: 1.8 })],
  ],
};

/** Accessori indossati, ripuliti: solo id del catalogo, al tipo giusto. È quello che va nella stanza. */
export function cleanAcc(acc) {
  const out = {};
  for (const tipo of TIPI) {
    const id = acc?.[tipo];
    const item = ITEMS.find((i) => i.id === id);
    if (item && item.tipo === tipo) out[tipo] = id;
  }
  return out;
}
