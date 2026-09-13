#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "🎵 Starting CyberDance 3D Audio & Dance Engine..."
echo "======================================================="

# Check if node modules exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
fi

# Build frontend if dist doesn't exist
if [ ! -d "dist" ]; then
    echo "⚡ Building frontend with Vite..."
    npm run build
fi

echo "🚀 Starting server on http://localhost:3001..."
exec node server.js
