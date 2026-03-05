#!/bin/bash
# STOP SERVICES SCRIPT (CLEANUP VERSION)

echo "🛑 Arresto processi PM2 (Backend e UI Python)..."
pm2 stop pim-ui pim-backend 2>/dev/null
pm2 delete pim-ui pim-backend 2>/dev/null
pm2 save

echo "🛑 Arresto Docker Compose (se attivo)..."
docker compose down 2>/dev/null

echo "🛑 Pulizia processi orfani sulla porta 55010, 55011, 55012..."
for port in 55010 55011 55012; do
  pid=$(lsof -t -i:$port)
  if [ ! -z "$pid" ]; then
    echo "Uccisione processo sulla porta $port (PID: $pid)..."
    kill -9 $pid
  fi
done

echo "✅ Tutti i servizi relativi a PIM V5 sono stati fermati."
