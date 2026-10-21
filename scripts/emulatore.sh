#!/bin/sh
# Emulatore Firebase per lo sviluppo (serve Java: brew install openjdk). Porte proprie (9100 database, 9199 accesso,
# 4410 hub): le predefinite sono usate da altri progetti sullo stesso Mac.
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
exec firebase emulators:start --project demo-ncc --only auth,database
