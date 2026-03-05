#!/bin/bash
# NATIVE MIGRATION SCRIPT (PM2 EDITION)
# Da lanciare nella root del progetto sulla VPS

echo "🩺 Inizio setup nativo PIM V5..."

# 1. Pulizia Docker (Solo se necessario)
if [ -f "docker-compose.yml" ]; then
    echo "🧹 Pulizia Docker..."
    docker compose down 2>/dev/null
fi

# 2. Installazione requisiti di sistema
echo "📦 Installazione dipendenze Ubuntu..."
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip python3-dev libmariadb-dev gcc nodejs npm

# 3. Creazione Ambiente Virtuale
echo "🛠️ Creazione Ambiente Virtuale (VENV)..."
rm -rf venv
python3 -m venv venv
source venv/bin/activate

# 4. Installazione librerie Python
echo "🐍 Installazione Librerie Python (Backend + UI)..."
pip install --upgrade pip
pip install -r backend/requirements.txt
pip install -r ui_v5/requirements.txt

# 5. Configurazione PM2
echo "🟢 Configurazione Process Manager (PM2)..."
sudo npm install -g pm2

# 6. Avvio Processi
echo "🚀 Lancio Applicazione..."
pm2 delete all 2>/dev/null
pm2 start ecosystem.config.js
pm2 save

echo "------------------------------------------------"
echo "✅ SISTEMA NATIVO ATTIVATO"
echo "------------------------------------------------"
echo "📊 MONITORAGGIO:"
echo "pm2 list           -> Stato dei processi"
echo "pm2 logs           -> Log in tempo reale"
echo "pm2 restart all    -> Riavvia l'applicazione"
echo "------------------------------------------------"
echo "⚠️  IMPORTANTE:"
echo "Assicurati che il file .env nella root contenga:"
echo "DATABASE_URL, GEMINI_API_KEY, OPENAI_API_KEY"
echo "------------------------------------------------"
