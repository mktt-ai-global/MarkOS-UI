#!/bin/sh

set -eu

# ── Defaults ──────────────────────────────────────────────────
export OPENCLAW_UPSTREAM_HOST="${OPENCLAW_UPSTREAM_HOST:-host.docker.internal}"
export OPENCLAW_UPSTREAM_PORT="${OPENCLAW_UPSTREAM_PORT:-18789}"
export NGINX_CLIENT_MAX_BODY="${NGINX_CLIENT_MAX_BODY:-16m}"
export NGINX_WS_TIMEOUT="${NGINX_WS_TIMEOUT:-300}"
export NGINX_GZIP="${NGINX_GZIP:-on}"

# ── Render nginx config from template ─────────────────────────
envsubst '
  ${OPENCLAW_UPSTREAM_HOST}
  ${OPENCLAW_UPSTREAM_PORT}
  ${NGINX_CLIENT_MAX_BODY}
  ${NGINX_WS_TIMEOUT}
  ${NGINX_GZIP}
' < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# ── Validate the generated nginx config ───────────────────────
if ! nginx -t 2>/dev/null; then
  echo ""
  echo "  [ERROR] Nginx configuration is invalid."
  echo "  This usually means an environment variable has a bad value."
  echo "  Check your .env file or docker-compose.yml environment section."
  echo ""
  nginx -t
  exit 1
fi

# ── Print startup summary ────────────────────────────────────
echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │            MarkOS UI is starting             │"
echo "  ├──────────────────────────────────────────────┤"
echo "  │  UI (inside container) :  http://0.0.0.0:80  │"
echo "  │  Gateway upstream      :  ${OPENCLAW_UPSTREAM_HOST}:${OPENCLAW_UPSTREAM_PORT}"
echo "  │  Gzip compression      :  ${NGINX_GZIP}"
echo "  │  WebSocket timeout     :  ${NGINX_WS_TIMEOUT}s"
echo "  │  Max request body      :  ${NGINX_CLIENT_MAX_BODY}"
echo "  └──────────────────────────────────────────────┘"
echo ""
echo "  Open in browser: http://localhost:\${MARKOS_UI_PORT:-4173}"
echo ""

# ── Start nginx ───────────────────────────────────────────────
exec nginx -g 'daemon off;'
