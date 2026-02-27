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

# 2. Build and restart containers
echo "🏗️ Building and restarting Docker containers..."
docker-compose up -d --build

# 3. Cleanup unused images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Docker deployment completed successfully!"
