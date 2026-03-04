#!/bin/bash

# Configuration
APP_NAME="pdf-catalog"
REPO_URL="https://github.com/ago-debug/contenthunter.git"
TARGET_DIR="/var/www/pdf-catalog"

echo "🐳 Starting Dockerized Deployment for $APP_NAME..."

# 1. Update code
if [ ! -d "$TARGET_DIR" ]; then
    echo "📁 Directory not found. Cloning repository..."
    git clone $REPO_URL $TARGET_DIR
    cd $TARGET_DIR
else
    echo "🔄 Pulling latest changes..."
    cd $TARGET_DIR
    git pull origin main
fi

# 2. Migration and Build
echo "🏗️ Migrating from TypeScript and Building Python V5 Containers..."
chmod +x ./vps_migration.sh
./vps_migration.sh

# 3. Cleanup unused images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ V5 Python deployment completed successfully!"
