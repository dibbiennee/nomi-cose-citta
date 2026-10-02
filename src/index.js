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
