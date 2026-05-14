#!/bin/bash
# Esegui come ROOT dopo npm run build.
# Imposta APP_USER e APP_DIR sotto, poi: chmod +x scripts/fix-permissions.sh && sudo ./scripts/fix-permissions.sh

# Utente con cui Passenger avvia l'app (es. da Plesk: utente del dominio)
APP_USER="${APP_USER:-contenthunter}"

# Path assoluto della root del progetto
APP_DIR="${APP_DIR:-/var/www/vhosts/contenthunter.abreve.it/httpdocs}"

if [ ! -d "$APP_DIR" ]; then
  echo "ERRORE: Cartella non trovata: $APP_DIR"
  echo "Imposta APP_DIR: export APP_DIR=/path/to/app"
  exit 1
fi

echo "Impostazione proprietario $APP_USER su $APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "Impostazione permessi directory (755) e file (644)..."
find "$APP_DIR" -type d -exec chmod 755 {} \;
find "$APP_DIR" -type f -exec chmod 644 {} \;

if [ -d "$APP_DIR/.next" ]; then
  echo "Permessi scrittura .next (Next.js cache)..."
  chmod -R 775 "$APP_DIR/.next"
fi

if [ -d "$APP_DIR/public/uploads" ]; then
  echo "Permessi scrittura public/uploads..."
  chmod -R 775 "$APP_DIR/public/uploads"
fi

echo "Fine. Riavvia l'app da Plesk/Passenger se necessario."
