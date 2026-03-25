#!/bin/bash
# ============================================================
# OpenClaw Web Control UI — One-Click Install Script
# ============================================================
# This script installs and connects the OpenClaw Web Control UI
# to a running (or new) OpenClaw gateway instance.
#
# Usage:
#   curl -fsSL <url>/install.sh | bash
#   — or —
#   chmod +x install.sh && ./install.sh
# ============================================================

set -euo pipefail

# --- Deploy guide (--deploy-guide) ---
deploy_guide() {
  cat <<'GUIDE'

╔══════════════════════════════════════════════════════════════╗
║         OpenClaw UI — VPS Deployment Guide                   ║
╚══════════════════════════════════════════════════════════════╝

1. BUILD THE UI
   npm run build        # produces ./dist

2. NGINX REVERSE PROXY
   Create /etc/nginx/sites-available/openclaw:

   server {
       listen 80;
       server_name your-domain.com;

       # Serve the built UI
       root /path/to/openclaw-ui/dist;
       index index.html;

       # SPA fallback
       location / {
           try_files $uri $uri/ /index.html;
       }

       # Proxy WebSocket to OpenClaw gateway
       location /ws {
           proxy_pass http://127.0.0.1:18789;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }

       # Proxy API to OpenClaw gateway
       location /v1 {
           proxy_pass http://127.0.0.1:18789;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location /tools {
           proxy_pass http://127.0.0.1:18789;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }

   Then enable and reload:
     ln -s /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
     nginx -t && systemctl reload nginx

3. SYSTEMD SERVICE FOR OPENCLAW GATEWAY
   Create /etc/systemd/system/openclaw-gateway.service:

   [Unit]
   Description=OpenClaw Gateway
   After=network.target

   [Service]
   Type=simple
   User=openclaw
   WorkingDirectory=/home/openclaw
   ExecStart=/usr/bin/env openclaw gateway
   Restart=on-failure
   RestartSec=5
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target

   Then enable and start:
     systemctl daemon-reload
     systemctl enable openclaw-gateway
     systemctl start openclaw-gateway

4. HTTPS (RECOMMENDED)
   Use certbot / Let's Encrypt:
     apt install certbot python3-certbot-nginx
     certbot --nginx -d your-domain.com
   Certbot will auto-configure HTTPS and set up certificate renewal.

GUIDE
  exit 0
}

# Handle --deploy-guide flag
if [[ "${1:-}" == "--deploy-guide" ]]; then
  deploy_guide
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   OpenClaw Web Control UI — Installer    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: Check prerequisites ---
echo -e "${BLUE}[1/6]${NC} Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found.${NC}"
  echo "  Please install Node.js 22+ (recommended: 24)"
  echo "  → https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo -e "${YELLOW}⚠ Node.js v$NODE_VERSION detected. OpenClaw requires Node 22+.${NC}"
  echo "  Recommended: Node 24"
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm not found.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# --- Step 2: Install / check OpenClaw ---
echo ""
echo -e "${BLUE}[2/6]${NC} Checking OpenClaw installation..."

if command -v openclaw &> /dev/null; then
  OPENCLAW_VER=$(openclaw --version 2>/dev/null || echo "unknown")
  echo -e "${GREEN}✓ OpenClaw found: $OPENCLAW_VER${NC}"
else
  echo -e "${YELLOW}OpenClaw not found. Installing...${NC}"
  npm install -g openclaw@latest
  echo -e "${GREEN}✓ OpenClaw installed${NC}"
fi

# --- Step 3: Run onboarding if needed ---
echo ""
echo -e "${BLUE}[3/6]${NC} Checking OpenClaw configuration..."

OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

if [ ! -f "$OPENCLAW_STATE_DIR/openclaw.json" ]; then
  echo -e "${YELLOW}No configuration found. Running onboarding...${NC}"
  openclaw onboard --install-daemon
  echo -e "${GREEN}✓ Onboarding complete${NC}"
else
  echo -e "${GREEN}✓ Configuration found at $OPENCLAW_STATE_DIR/openclaw.json${NC}"
fi

# --- Step 4: Install UI dependencies ---
echo ""
echo -e "${BLUE}[4/6]${NC} Installing Web Control UI dependencies..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# --- Step 5: Build the UI ---
echo ""
echo -e "${BLUE}[5/6]${NC} Building Web Control UI..."

npm run build
echo -e "${GREEN}✓ Build complete → dist/${NC}"

# --- Step 6: Start & connect ---
echo ""
echo -e "${BLUE}[6/6]${NC} Starting services..."

# Check if gateway is running
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"

if curl -s "http://127.0.0.1:$GATEWAY_PORT" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ OpenClaw gateway already running on port $GATEWAY_PORT${NC}"
else
  echo -e "${YELLOW}Starting OpenClaw gateway...${NC}"
  openclaw gateway &
  GATEWAY_PID=$!
  sleep 3

  if curl -s "http://127.0.0.1:$GATEWAY_PORT" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Gateway started (PID: $GATEWAY_PID)${NC}"
  else
    echo -e "${YELLOW}⚠ Gateway may still be starting. Check: openclaw status${NC}"
  fi
fi

# Start the built preview server
echo ""
echo -e "${CYAN}Starting Web Control UI...${NC}"
echo ""
UI_PORT="${OPENCLAW_UI_PORT:-4173}"

if [ -n "${GATEWAY_PID:-}" ]; then
  cleanup() {
    if kill -0 "$GATEWAY_PID" > /dev/null 2>&1; then
      echo ""
      echo -e "${YELLOW}Stopping temporary OpenClaw gateway (PID: $GATEWAY_PID)...${NC}"
      kill "$GATEWAY_PID" > /dev/null 2>&1 || true
    fi
  }

  trap cleanup EXIT INT TERM
fi

echo -e "  ${GREEN}→ UI:       ${NC} http://localhost:$UI_PORT"
echo -e "  ${GREEN}→ Gateway:  ${NC} http://127.0.0.1:$GATEWAY_PORT"
echo -e "  ${GREEN}→ WS:       ${NC} ws://127.0.0.1:$GATEWAY_PORT"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

npm run preview -- --host 0.0.0.0 --port "$UI_PORT"
