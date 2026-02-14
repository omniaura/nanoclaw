#!/bin/bash
# Auto-update script for NanoClaw instances
# This script pulls the latest code, rebuilds the container, and restarts instances

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔄 NanoClaw Auto-Update"
echo "======================="
echo ""

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
cd "$REPO_DIR"
git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git pull origin "$CURRENT_BRANCH"

# Rebuild container
echo ""
echo "🔨 Rebuilding container image..."
cd "$SCRIPT_DIR"
./build.sh latest

echo ""
echo "✅ Update complete!"
echo ""
echo "To restart running instances:"
echo "  1. Find running instances: ps aux | grep agent-runner"
echo "  2. Stop instances: kill <pid>"
echo "  3. Start fresh instances with the new image"
echo ""
echo "For Sprites instances (cloud), redeploy via Fly.io:"
echo "  fly deploy --app <app-name> --image nanoclaw-agent:latest"
