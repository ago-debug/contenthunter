#!/bin/bash
# VPS MIGRATION SCRIPT: TYPESCRIPT -> PYTHON V5

echo "🧹 Pulizia VPS e Migrazione a Python V5..."

# 1. Stop existing Node/TypeScript containers
echo "🛑 Arresto vecchi container Node.js..."
docker stop pdf-catalog-app 2>/dev/null
docker rm pdf-catalog-app 2>/dev/null

# 2. Remove node_modules and TS artifacts on the host (if mapping)
echo "🗑️ Rimozione artefatti TypeScript..."
rm -rf node_modules .next package-lock.json tsconfig.json

# 3. Clean up old Docker images
echo "🧹 Pruning immagini obsolete..."
docker image prune -a -f

# 4. Prepare Python Volumes
echo "📁 Preparazione cartelle storage..."
mkdir -p public/uploads public/static_crops

# 5. Start the New V5 Stack
echo "🏗️ Avvio Stack Python V5 (FastAPI + Reflex)..."
docker-compose up -d --build

echo "✅ Migrazione completata con successo!"
echo "📡 Backend: http://vps-ip:8000"
echo "📡 UI: http://vps-ip:3000"
