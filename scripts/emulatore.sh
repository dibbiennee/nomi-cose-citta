#!/bin/sh
# Emulatore Firebase per lo sviluppo (serve Java: brew install openjdk).
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
exec firebase emulators:start --project demo-ncc --only auth,database
