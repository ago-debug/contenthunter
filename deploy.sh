#!/bin/bash

# Configuration
APP_NAME="pdf-catalog"
REPO_URL="https://github.com/ago-debug/contenthunter.git"
TARGET_DIR="/var/www/pdf-catalog"

echo "🚀 Starting Deployment Process for $APP_NAME..."

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

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Prisma setup (if using database)
if [ -d "prisma" ]; then
    echo "💎 Running Prisma migrations..."
    npx prisma generate
    # npx prisma migrate deploy # Uncomment if you want to run migrations automatically
fi

# 4. Build application
echo "🏗️ Building Next.js application..."
npm run build

# 5. Restart process with PM2
if command -v pm2 &> /dev/null; then
    echo "♻️ Restarting with PM2..."
    pm2 restart $APP_NAME || pm2 start npm --name "$APP_NAME" -- start
    pm2 save
else
    echo "⚠️ PM2 not found. You should install it: npm install -g pm2"
    echo "Starting with npm instead..."
    npm start &
fi

echo "✅ Deployment completed successfully!"
