#!/bin/bash

# Configuration
APP_NAME="pdf-catalog"
REPO_URL="https://github.com/ago-debug/contenthunter.git"
TARGET_DIR="/var/www/pdf-catalog"

echo "🚀 Avvio Deploy Nativo Node.js (Next.js) per $APP_NAME..."

# 1. Update code
if [ ! -d "$TARGET_DIR" ]; then
    echo "📁 Directory non trovata. Clonazione repository in corso..."
    git clone $REPO_URL $TARGET_DIR
    cd $TARGET_DIR
else
    echo "🔄 Aggiornamento codice da GitHub..."
    cd $TARGET_DIR
    git pull origin main
fi

# 2. Controllo .env
if [ ! -f ".env" ]; then
    echo "❌ ERRORE CRITICO: Il file .env manca in $TARGET_DIR!"
    echo "Prisma e Next.js richiedono il DATABASE_URL. Crealo prima di riavviare il deploy."
    exit 1
fi

# 3. Installazione Dipendenze e Build
echo "🧹 Pulizia cache moduli (Fix per Tailwind Oxide & SWC)..."
rm -rf node_modules package-lock.json

echo "📦 Installazione dipendenze npm pulita..."
npm install

echo "🗄️ Generazione Prisma Client e aggiornamento DB..."
npx prisma generate
npx prisma db push --accept-data-loss

echo "🏗️ Build Next.js in produzione..."
npm run build

# 3. Riavvio App Node.js (Plesk / Passenger)
echo "🔄 Riavvio applicazione tramite Phusion Passenger..."
mkdir -p tmp
touch tmp/restart.txt

echo "✅ Deploy Node.js completato con successo!"
