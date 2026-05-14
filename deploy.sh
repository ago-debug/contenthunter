#!/bin/bash
# Deploy completo su VPS (Plesk / Passenger): codice, dipendenze Linux, Prisma, DB, build Next, restart.
# Esegui dalla macchina con accesso SSH al server, oppure copia lo script sul server e lancialo lì in sudo -u UTENTE_SITO bash deploy.sh
set -euo pipefail

APP_NAME="pdf-catalog"
REPO_URL="https://github.com/ago-debug/contenthunter.git"
TARGET_DIR="/var/www/vhosts/contenthunter.abreve.it/httpdocs"

# Opzionale: utente proprietario file (come in Plesk → dominio). Se vuoto, nessun chown.
# es: export APP_SITE_USER="contenthunter" prima di eseguire lo script come root
: "${APP_SITE_USER:=}"

echo "🚀 Deploy Node.js (Next.js) — $APP_NAME → $TARGET_DIR"

require_node() {
    local v
    v="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" || true
    if [[ -z "${v:-}" ]] || [[ "$v" -lt 18 ]]; then
        echo "❌ Serve Node.js 18+ (consigliato 20.x). Attuale: $(node -v 2>/dev/null || echo assente)"
        exit 1
    fi
    echo "✓ Node $(node -v)"
}

require_env_file() {
    if [[ ! -f "$TARGET_DIR/.env" ]]; then
        echo "❌ Manca $TARGET_DIR/.env (DATABASE_URL, NEXTAUTH_*, ecc.)."
        exit 1
    fi
    # Controlli minimi senza esportare segreti in log
    if ! grep -qE '^[[:space:]]*DATABASE_URL=' "$TARGET_DIR/.env"; then
        echo "❌ In .env manca DATABASE_URL="
        exit 1
    fi
    if ! grep -qE '^[[:space:]]*NEXTAUTH_SECRET=' "$TARGET_DIR/.env"; then
        echo "❌ In .env manca NEXTAUTH_SECRET="
        exit 1
    fi
    if ! grep -qE '^[[:space:]]*NEXTAUTH_URL=' "$TARGET_DIR/.env"; then
        echo "❌ In .env manca NEXTAUTH_URL= (es. https://contenthunter.abreve.it)"
        exit 1
    fi
    echo "✓ .env presente (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL)"
}

# --- 1. Codice (Git) ---
# Su molti VPS la cartella httpdocs esiste già (Plesk) ma non è un clone: manca .git → collegiamo il remote e allineiamo.
export GIT_TERMINAL_PROMPT=0

# Git 2.35+: se esegui come root ma httpdocs è di un altro utente (Plesk), senza questo fallisce con "dubious ownership".
ensure_git_trusts_target_dir() {
    [[ -d "$TARGET_DIR" ]] || return 0
    if [[ "$(id -u)" -ne 0 ]]; then
        return 0
    fi
    if git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$TARGET_DIR"; then
        return 0
    fi
    git config --global --add safe.directory "$TARGET_DIR"
    echo "✓ Git safe.directory registrato per $TARGET_DIR (deploy come root)"
}

ensure_git_trusts_target_dir

if [[ ! -d "$TARGET_DIR" ]]; then
    echo "📁 Clone repository → $TARGET_DIR"
    git clone --branch main --single-branch "$REPO_URL" "$TARGET_DIR"
elif [[ ! -d "$TARGET_DIR/.git" ]]; then
    echo "⚠️  $TARGET_DIR esiste ma non è un repository Git (.git assente)."
    echo "    Collegamento a $REPO_URL e allineamento forzato a main (file tracciati da Git vengono sovrascritti; .env non tracciato resta)."
    cd "$TARGET_DIR"
    git init
    git config init.defaultBranch main
    git remote remove origin 2>/dev/null || true
    git remote add origin "$REPO_URL"
    git fetch origin main
    git checkout -f -B main FETCH_HEAD
else
    cd "$TARGET_DIR"
    # .git presente ma init interrotto / senza remote (es. dopo errore "dubious ownership" prima di remote add)
    if ! git remote get-url origin &>/dev/null; then
        echo "⚠️  Repository senza remote origin: collego $REPO_URL e allineo il working tree a main…"
        git config init.defaultBranch main 2>/dev/null || true
        git remote remove origin 2>/dev/null || true
        git remote add origin "$REPO_URL"
        git fetch origin main
        git checkout -f -B main FETCH_HEAD
    else
        current_url="$(git remote get-url origin 2>/dev/null || true)"
        if [[ -n "$current_url" ]] && [[ "$current_url" != "$REPO_URL" ]]; then
            echo "⚠️  origin punta a un URL diverso: imposto $REPO_URL"
            git remote set-url origin "$REPO_URL"
        fi
        echo "🔄 git pull origin main…"
        git pull origin main
    fi
fi

cd "$TARGET_DIR"

require_node
require_env_file

# Prisma e Next caricano .env dalla root del progetto; evitiamo source .env (valori complessi / set -u).

# --- 2. Dipendenze (sempre su Linux: non copiare node_modules da Mac/Windows) ---
echo "🧹 Rimozione node_modules (binari nativi devono essere ricompilati sul server)…"
rm -rf node_modules

if [[ -f package-lock.json ]]; then
    echo "📦 npm ci (installazione deterministica da package-lock.json)…"
    npm ci
else
    echo "⚠️  package-lock.json assente: uso npm install (meno deterministico)."
    npm install
fi

# --- 3. Prisma: client + schema DB ---
echo "🗄️  npx prisma generate…"
npx prisma generate

echo "🗄️  npx prisma db push (allinea MySQL allo schema; senza --accept-data-loss)…"
npx prisma db push

# --- 4. Metadati release (versione / changelog in data/*.json) ---
if grep -q '"release-meta"' package.json 2>/dev/null; then
    echo "📌 npm run release-meta…"
    npm run release-meta || true
fi

# --- 5. Build produzione ---
export NODE_ENV="${NODE_ENV:-production}"
echo "🏗️  NODE_ENV=$NODE_ENV npm run build…"
npm run build

# --- 6. Permessi (opzionale: solo se esegui come root e imposti APP_SITE_USER, es. utente Plesk del dominio) ---
if [[ -n "$APP_SITE_USER" ]] && id "$APP_SITE_USER" &>/dev/null; then
    echo "👤 chown -R $APP_SITE_USER:$APP_SITE_USER $TARGET_DIR"
    chown -R "$APP_SITE_USER:$APP_SITE_USER" "$TARGET_DIR"
fi

# --- 7. Riavvio Passenger (Node) ---
echo "🔄 tmp/restart.txt → Passenger riavvia l’app…"
mkdir -p tmp
touch tmp/restart.txt

echo "✅ Deploy completato."
echo "   Se l’app non parte: leggi il log Passenger (Error ID) e sul server esegui ./scripts/check-deploy.sh"
