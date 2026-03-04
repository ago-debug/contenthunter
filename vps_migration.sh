#!/bin/bash
# SYSTEM DOCTOR & MIGRATION SCRIPT (VPS EXPERT EDITION)
# Target: Python V5 on shared Plesk VPS

echo "🩺 Avvio check del sistema..."

# 1. Pulizia Forzata
echo "🧹 Rimozione container orfani o bloccati..."
docker stop dismantler-v5-ui dismantler-v5-backend 2>/dev/null
docker rm -f dismantler-v5-ui dismantler-v5-backend 2>/dev/null

# 2. Controllo Porte (Gamma 55000)
# Verifica se qualcuno occupa le nostre porte prima di partire
for port in 55010 55011 55012; do
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  ATTENZIONE: La porta $port è già occupata!"
    lsof -i :$port
    exit 1
  fi
done

# 3. Check File .env
if [ ! -f .env ]; then
    echo "❌ ERRORE: Il file .env manca nella root del progetto!"
    echo "Crea un file .env con DATABASE_URL e GEMINI_API_KEY."
    exit 1
fi
chmod 600 .env

# 4. Storage & Permessi
echo "📁 Configurazione Storage..."
mkdir -p public/uploads public/static_crops
# Assicurati che Docker possa scrivere (utente root nel container, ma mappato)
# chmod -R 777 public/uploads # Soluzione drastica per test, poi restringeremo

# 5. Build & Launch in isolamento
echo "🚀 Avvio Stack contenthunter-v5..."
docker compose -p contenthunter-v5 up -d --build

echo "----------------------------------------------------"
echo "✅ SISTEMA CONFIGURATO CON SUCCESSO"
echo "🌐 FRONTEND: Porta 55010"
echo "🔌 BACKEND (Reflex): Porta 55011"
echo "🔌 API (FastAPI): Porta 55012"
echo "----------------------------------------------------"
echo "⚠️  AZIONE FINALE IN PLESK:"
echo "1. Imposta Docker Proxy Rule -> Container Port 3000 (Mappata su 55010)"
echo "2. Aggiungi in Direttive Nginx:"
echo "   location /_reflex/ { "
echo "     proxy_pass http://localhost:55011; "
echo "     proxy_http_version 1.1; "
echo "     proxy_set_header Upgrade \$http_upgrade; "
echo "     proxy_set_header Connection \"upgrade\"; "
echo "   }"
echo "----------------------------------------------------"
