#!/bin/bash

# Fly.io Deployment Helper Script
# This script automates the Fly.io deployment process

set -e

echo "🚀 DEX Order Engine - Fly.io Deployment Helper"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if flyctl is installed
echo -e "${BLUE}[1/5]${NC} Checking Fly CLI..."
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}✗ Fly CLI not found${NC}"
    echo "Installing Fly CLI..."
    brew install flyctl
fi
echo -e "${GREEN}✓ Fly CLI is installed ($(flyctl version))${NC}"
echo ""

# Check if user is authenticated
echo -e "${BLUE}[2/5]${NC} Checking Fly authentication..."
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${YELLOW}⚠ Not authenticated${NC}"
    echo "Opening Fly.io login..."
    flyctl auth login
fi
echo -e "${GREEN}✓ Authenticated with Fly.io${NC}"
echo ""

# Check if fly.toml exists
echo -e "${BLUE}[3/5]${NC} Verifying configuration..."
if [ ! -f "fly.toml" ]; then
    echo -e "${YELLOW}⚠ fly.toml not found${NC}"
    echo "Running flyctl launch..."
    flyctl launch
else
    echo -e "${GREEN}✓ fly.toml exists${NC}"
fi
echo ""

# Deploy to Fly.io
echo -e "${BLUE}[4/5]${NC} Deploying to Fly.io..."
echo "This may take 3-5 minutes..."
flyctl deploy

echo ""
echo -e "${BLUE}[5/5]${NC} Initializing database..."

# Get app name from fly.toml
APP_NAME=$(grep '^app = ' fly.toml | cut -d'"' -f2)

# Wait for app to be ready
echo "Waiting for app to be ready..."
sleep 10

# Run migrations
echo "Running database migrations..."
flyctl ssh console -a "$APP_NAME" <<EOF
npm run migrate
exit
EOF

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Your app is ready at:${NC}"
echo -e "${GREEN}https://${APP_NAME}.fly.dev${NC}"
echo ""
echo "Useful commands:"
echo "  • View logs:      flyctl logs"
echo "  • SSH into app:   flyctl ssh console"
echo "  • View status:    flyctl status"
echo "  • Restart app:    flyctl restart"
echo "  • View secrets:   flyctl secrets list"
echo ""
echo "Test your API:"
echo "  curl https://${APP_NAME}.fly.dev/api/health"
echo ""
