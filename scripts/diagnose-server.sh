#!/usr/bin/env bash
# Esegui come root o come utente del sito, dalla root del progetto sul VPS:
#   cd /var/www/vhosts/contenthunter.abreve.it/httpdocs && bash scripts/diagnose-server.sh
set -euo pipefail

echo "========== Content Hunter — diagnostica server =========="
echo "PWD: $(pwd)"
echo ""

echo "=== Node ==="
command -v node >/dev/null && node -v || { echo "ERRORE: node non in PATH"; exit 1; }
echo ""

echo "=== File .env (solo presenza) ==="
if [ -f .env ]; then echo "OK: .env presente"; else echo "ATTENZIONE: .env assente (Plesk può usare solo variabili pannello)"; fi
echo ""

echo "=== Build Next ==="
if [ -f .next/BUILD_ID ]; then
  echo "OK: .next/BUILD_ID:"
  cat .next/BUILD_ID
else
  echo "MANCA .next/BUILD_ID → esegui: npm ci && npx prisma generate && npm run build"
fi
echo ""

echo "=== Prisma client ==="
if [ -d node_modules/.prisma/client ]; then echo "OK: client Prisma generato"; else echo "MANCA → esegui: npx prisma generate"; fi
echo ""

echo "=== Permessi .next (primi file) ==="
if [ -d .next ]; then ls -la .next | head -5; else echo "(cartella .next assente)"; fi
echo ""

echo "=== Test caricamento modulo 'next' (senza avviare il server) ==="
node -e "require('next'); console.log('OK: modulo next caricato');" || {
  echo "FALLITO: node_modules corrotto o Node incompatibile → prova: rm -rf node_modules && npm ci"
  exit 1
}
echo ""

echo "=== Prova app.prepare() (mostra errore reale se build mancante) ==="
node - <<'NODE'
process.env.NODE_ENV = 'production';
const next = require('next');
const app = next({ dev: false, dir: process.cwd() });
app.prepare()
  .then(() => { console.log('OK: next.prepare() completato'); process.exit(0); })
  .catch((err) => { console.error('ERRORE prepare():', err.message); console.error(err.stack); process.exit(1); });
NODE

echo ""
echo "=== Fine diagnostica ==="
echo "Se prepare() è OK ma Passenger no: verifica in Plesk Application root, Node 18+, e permessi chown sull'utente del dominio."
echo "Avvio manuale test: PORT=3000 npm start   oppure   PORT=3000 node app.js"
