// Contenuti esclusivi del club, per la Modalità Fondatore.
// Le immagini stanno in public/club/ e sono pubbliche come il resto del sito: CANT decide solo chi può
// sceglierle, non chi può vederle. Ci va solo chi ha dato il consenso a una faccia online (Raffaella sì).
// Ogni personaggio ha cinque espressioni, usate nei momenti della partita (vedi ui/Personaggio.js).

export const MOODS = ['normale', 'ride', 'urla', 'trionfo', 'disperato'];

export const CLUB = {
  avatar: [
    { id: 'raffaella', nome: 'Raffaella', espressioni: Object.fromEntries(MOODS.map((m) => [m, `/club/raffaella/${m}.webp`])) },
  ],
  espressioni: [],
  decorazioni: [], // cappelli, occhiali, vestiti: progetto degli account
};

/** Gli id che si possono scrivere nella stanza: lo stesso elenco è in database.rules.json (players/$uid/char). */
export const CHARACTER_IDS = CLUB.avatar.map((a) => a.id);
export const characterOf = (id) => CLUB.avatar.find((a) => a.id === id) || null;
