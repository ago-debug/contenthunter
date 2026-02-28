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

# 2. Sync Database and Build
echo "🏗️ Syncing Database and Building Docker containers..."
# Ensure Prisma client is generated inside the build context if needed, 
# although Dockerfile handles it, running it here can help with external scripts.
npx prisma generate
npx prisma db push --accept-data-loss

docker-compose up -d --build

# 3. Cleanup unused images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Docker deployment completed successfully!"
