#!/bin/bash
# Auto-update script for NanoClaw instances
# Pulls latest code, rebuilds container, and restarts the service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔄 NanoClaw Auto-Update Starting..."
echo "Repository: $REPO_DIR"

# Check if running inside container
if [ -f /.dockerenv ]; then
    echo "⚠️  This script should be run on the host, not inside the container"
    exit 1
fi

# Navigate to repo directory
cd "$REPO_DIR"

# Stash any local changes
if ! git diff-index --quiet HEAD --; then
    echo "📦 Stashing local changes..."
    git stash push -m "Auto-update stash $(date +%Y%m%d-%H%M%S)"
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📍 Current branch: $CURRENT_BRANCH"

# Fetch latest changes
echo "⬇️  Fetching latest changes..."
git fetch origin

# Get current and remote commit hashes
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$CURRENT_BRANCH)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✅ Already up to date (commit: ${LOCAL_COMMIT:0:8})"
    exit 0
fi

echo "🆕 Updates available:"
echo "   Local:  ${LOCAL_COMMIT:0:8}"
echo "   Remote: ${REMOTE_COMMIT:0:8}"

# Pull latest changes
echo "⬇️  Pulling latest code..."
git pull origin $CURRENT_BRANCH

# Find the container image name
CONTAINER_IMAGE=$(grep -E "^FROM " container/Dockerfile | head -1 | awk '{print $2}' || echo "nanoclaw")
echo "🐳 Container base: $CONTAINER_IMAGE"

# Rebuild container
echo "🔨 Rebuilding container..."
if [ -f "docker-compose.yml" ]; then
    echo "   Using docker-compose..."
    docker-compose build
elif [ -f "container/build.sh" ]; then
    echo "   Using build script..."
    bash container/build.sh
else
    echo "   Using docker build..."
    docker build -t nanoclaw:latest -f container/Dockerfile .
fi

# Restart service
echo "♻️  Restarting service..."
if [ -f "docker-compose.yml" ]; then
    docker-compose down
    docker-compose up -d
elif command -v systemctl &> /dev/null; then
    # Try systemd service restart
    SERVICE_NAME="${NANOCLAW_SERVICE:-nanoclaw}"
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo "   Restarting systemd service: $SERVICE_NAME"
        sudo systemctl restart "$SERVICE_NAME"
    else
        echo "   Service $SERVICE_NAME not found, manual restart required"
    fi
else
    echo "   Manual restart required - no docker-compose or systemd found"
fi

echo "✅ Update complete!"
echo "   New commit: ${REMOTE_COMMIT:0:8}"
