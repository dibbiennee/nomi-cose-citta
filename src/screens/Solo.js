import React from 'react';
import Setup from './Setup';

/** Partita da soli: difficoltà, robot e impostazioni. È la schermata delle impostazioni in modalità robot. */
export default function Solo({ records, initial, onBack, onStart, toast }) {
  return <Setup solo={{ records, difficulty: initial?.difficulty, botCount: initial?.botCount }} initial={initial?.settings} onBack={onBack} onSave={onStart} toast={toast} />;
}
