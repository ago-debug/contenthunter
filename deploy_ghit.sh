#!/usr/bin/env bash

###############################################################################
# deploy_ghit.sh
#
# Script di deploy per `contenthunter.abreve.it` da eseguire sul server
# DOPO aver aggiornato i file dall'origine (GitHub / Plesk Git / rsync).
#
# Cosa fa:
# 1. (Opzionale) esegue `git pull` se nella cartella c'è un repo Git.
# 2. Sistema i permessi in modo che l'utente del dominio possa lavorare.
# 3. Installa/aggiorna le dipendenze npm come utente del dominio.
# 4. Rigenera la build di produzione Next.js (.next).
# 5. Sistema i permessi su `.next` per evitare errori EACCES.
#
# NOTE:
# - Va lanciato come root (es. `sudo bash deploy_ghit.sh`).
# - Il riavvio dell'app va poi fatto dal pannello Plesk (Node.js → Riavvia app),
#   oppure aggiungendo un comando di restart Plesk alla fine se desiderato.
###############################################################################

set -euo pipefail

WEBROOT="/var/www/vhosts/contenthunter.abreve.it/httpdocs"
APP_USER="contenthunter.abreve_oe5iqgukzor"
APP_GROUP="psacln"

echo "== Deploy su ${WEBROOT} =="

if [[ ! -d "${WEBROOT}" ]]; then
  echo "ERRORE: cartella ${WEBROOT} inesistente."
  exit 1
fi

cd "${WEBROOT}"

echo
echo "== (Opzionale) git pull =="
if [[ -d ".git" ]]; then
  sudo -u "${APP_USER}" -H git pull --ff-only || {
    echo "ATTENZIONE: git pull fallito, controlla i conflitti."
    exit 1
  }
else
  echo "Nessuna directory .git in ${WEBROOT}, salto git pull."
fi

echo
echo "== Sistema permessi base su httpdocs =="
chown -R "${APP_USER}:${APP_GROUP}" "${WEBROOT}"

echo
echo "== Installazione/aggiornamento dipendenze npm =="
sudo -u "${APP_USER}" -H bash -lc "
  set -e
  cd '${WEBROOT}'
  npm install
"

echo
echo "== Pulizia e nuova build Next.js =="
sudo -u "${APP_USER}" -H bash -lc "
  set -e
  cd '${WEBROOT}'
  # Rimuove eventuale build precedente (creata magari da root)
  rm -rf .next
  npm run build
"

echo
echo "== Sistema permessi su .next =="
if [[ -d ".next" ]]; then
  chown -R "${APP_USER}:${APP_GROUP}" ".next"
  if [[ -f ".next/BUILD_ID" ]]; then
    echo "BUILD_OK: trovato .next/BUILD_ID"
  else
    echo "ATTENZIONE: .next/BUILD_ID mancante, controlla l'output di npm run build."
  fi
else
  echo "ERRORE: directory .next non trovata dopo il build."
  exit 1
fi

echo
echo "== FINE deploy_ghit.sh =="
echo "Ora riavvia l'app da Plesk: Node.js → Riavvia app."

