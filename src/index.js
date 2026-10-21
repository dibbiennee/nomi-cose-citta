import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Font serviti dal sito stesso (non da Google Fonts): nessuna richiesta a server esterni per i caratteri.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/figtree/latin-800.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker (public/sw.js): rende il gioco installabile e lo tiene sul telefono, così si apre anche senza rete.
// Non in sviluppo né nelle build verso l'emulatore, dove darebbe solo fastidio con versioni vecchie.
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && process.env.REACT_APP_EMULATOR !== '1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Vercel Web Analytics: visite, pagine, paesi e dispositivi, senza cookie. Solo sul sito pubblicato (lo script
// esiste solo su Vercel), dopo aver attivato Analytics nel progetto.
if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_EMULATOR !== '1') {
  const va = document.createElement('script');
  va.defer = true;
  va.src = '/_vercel/insights/script.js';
  document.head.appendChild(va);
}
