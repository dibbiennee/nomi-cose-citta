# Nomi Cose Città

Il gioco di Nomi Cose Città da fare online con gli amici, ognuno dal suo telefono.

Online: https://nomicosecitta.pro

## Com'è fatto

- React (create-react-app) per le schermate, in `src/screens/`.
- Firebase Realtime Database per le stanze, con accesso anonimo.
- Le regole del gioco stanno in `src/engine/rules.js`, il motore multiplayer in `src/engine/room.js`.
- Le regole di sicurezza del database stanno in `database.rules.json`.
- Il design di riferimento è `nomi-cose-citta-design/prototypes/Main.dc.html`.

## Provarlo in locale

In sviluppo l'app usa l'emulatore Firebase, non il database vero. Serve Java (`brew install openjdk`).

```bash
sh scripts/emulatore.sh   # emulatore Firebase
npm start                 # app su http://localhost:3000
```

Ogni scheda del browser è un giocatore diverso.
`node scripts/bot-prova.mjs CODICE` aggiunge due giocatori automatici alla stanza.

## Test

```bash
npm run test:rules   # regole del gioco
npm run test:room    # motore e regole del database, sull'emulatore
```

## Pubblicare

```bash
firebase deploy --only database --project nomi-cose-citta-416e9   # regole del database
vercel deploy --prod                                              # sito
```
