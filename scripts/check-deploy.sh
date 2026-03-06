#!/bin/bash
# Esegui nella root del progetto sul server per verificare prerequisiti deploy.
set -e
echo "=== Node ==="
node -v
echo ""
echo "=== Prisma client presente? ==="
ls -la node_modules/.prisma/client 2>/dev/null || { echo "MANCA: esegui 'npx prisma generate'"; exit 1; }
echo "OK"
echo ""
echo "=== Build Next (.next) presente? ==="
ls -la .next/BUILD_ID 2>/dev/null || { echo "MANCA: esegui 'npm run build'"; exit 1; }
echo "OK"
echo ""
echo "=== Env (solo nomi) ==="
[ -n "$DATABASE_URL" ] && echo "DATABASE_URL: set" || echo "DATABASE_URL: NON IMPOSTATA"
[ -n "$NEXTAUTH_SECRET" ] && echo "NEXTAUTH_SECRET: set" || echo "NEXTAUTH_SECRET: NON IMPOSTATA"
[ -n "$NEXTAUTH_URL" ] && echo "NEXTAUTH_URL: set" || echo "NEXTAUTH_URL: NON IMPOSTATA"
echo ""
echo "=== Fine check ==="
