#!/bin/bash
# MarkOS UI Management Script
# Usage: markos [command] [args]
# Run without arguments for interactive menu.

set -Eo pipefail

SCRIPT_VERSION="1.2.0"
CONF_FILE=""
REPO_SLUG="mktt-ai-global/MarkOS-UI"

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────
info()    { echo -e "${BLUE}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
fail()    { echo -e "${RED}✗${NC} $*" >&2; }
die()     { fail "$@"; exit 1; }

command_exists() { command -v "$1" > /dev/null 2>&1; }

run_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command_exists sudo; then sudo "$@"
  else die "Root privileges required but sudo is not available."; fi
}

# ── Config File ───────────────────────────────────────────────
find_conf() {
  for candidate in \
    "${MARKOS_CONF:-}" \
    "/srv/markos-ui/.markos.conf" \
    "$HOME/.local/share/markos-ui/.markos.conf" \
    "./.markos.conf"; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      CONF_FILE="$candidate"
      return 0
    fi
  done
  return 1
}

read_conf() {
  local key="$1" default="${2:-}"
  if [ -n "$CONF_FILE" ] && [ -f "$CONF_FILE" ]; then
    local val
    val=$(grep -m1 "^${key}=" "$CONF_FILE" 2>/dev/null | cut -d= -f2-)
    if [ -n "$val" ]; then printf '%s' "$val"; return; fi
  fi
  printf '%s' "$default"
}

write_conf() {
  local key="$1" value="$2"
  [ -z "$CONF_FILE" ] && return
  if grep -q "^${key}=" "$CONF_FILE" 2>/dev/null; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$CONF_FILE"
  else
    echo "${key}=${value}" >> "$CONF_FILE"
  fi
}

load_conf() {
  DEPLOY_MODE=$(read_conf DEPLOY_MODE "vps")
  DOMAIN=$(read_conf DOMAIN "")
  UI_PORT=$(read_conf UI_PORT "443")
  GATEWAY_PORT=$(read_conf GATEWAY_PORT "18789")
  INSTALL_DIR=$(read_conf INSTALL_DIR "/srv/markos-ui")
  DIST_ROOT=$(read_conf DIST_ROOT "${INSTALL_DIR}/dist")
  ENABLE_HTTPS=$(read_conf ENABLE_HTTPS "1")
  EMAIL=$(read_conf EMAIL "")
  GATEWAY_TOKEN=$(read_conf GATEWAY_TOKEN "")
  INSTALLED_VERSION=$(read_conf VERSION "$SCRIPT_VERSION")
}

generate_conf() {
  local dir="$1"
  CONF_FILE="${dir}/.markos.conf"
  cat > "$CONF_FILE" << CONFEOF
# MarkOS UI configuration — managed by markos.sh
# Generated: $(date -Iseconds)
DEPLOY_MODE=${DEPLOY_MODE:-vps}
DOMAIN=${DOMAIN:-}
UI_PORT=${UI_PORT:-443}
GATEWAY_PORT=${GATEWAY_PORT:-18789}
INSTALL_DIR=${dir}
DIST_ROOT=${dir}/dist
ENABLE_HTTPS=${ENABLE_HTTPS:-1}
EMAIL=${EMAIL:-}
GATEWAY_TOKEN=${GATEWAY_TOKEN:-}
VERSION=${SCRIPT_VERSION}
CONFEOF
  success "Config saved to ${CONF_FILE}"
}

# ── Status Checks ─────────────────────────────────────────────
is_nginx_running() {
  systemctl is-active --quiet nginx 2>/dev/null
}

is_gateway_running() {
  systemctl is-active --quiet markos-openclaw-gateway.service 2>/dev/null
}

gateway_health() {
  curl -fsS --max-time 3 "http://127.0.0.1:${GATEWAY_PORT}/health" 2>/dev/null
}

get_ssl_expiry() {
  if [ -z "$DOMAIN" ]; then echo "N/A"; return; fi
  local cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  if [ -f "$cert" ]; then
    openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2
  else
    echo "No certificate"
  fi
}

get_gateway_token() {
  if [ -n "$GATEWAY_TOKEN" ]; then
    printf '%s' "$GATEWAY_TOKEN"
    return
  fi
  local ocj="${HOME}/.openclaw/openclaw.json"
  if [ -f "$ocj" ] && command_exists python3; then
    python3 -c "import json; print(json.load(open('${ocj}')).get('gateway',{}).get('auth',{}).get('token',''))" 2>/dev/null
  fi
}

# ── Status Banner ─────────────────────────────────────────────
show_banner() {
  local nginx_status gateway_status gw_health ssl_expiry token url
  nginx_status=$(is_nginx_running && echo "${GREEN}● running${NC}" || echo "${RED}● stopped${NC}")
  gateway_status=$(is_gateway_running && echo "${GREEN}● running${NC}" || echo "${RED}● stopped${NC}")
  if gateway_health > /dev/null 2>&1; then
    gw_health="${GREEN}healthy${NC}"
  else
    gw_health="${YELLOW}unreachable${NC}"
  fi
  ssl_expiry=$(get_ssl_expiry)
  token=$(get_gateway_token)

  if [ "$ENABLE_HTTPS" = "1" ] && [ -n "$DOMAIN" ]; then
    url="https://${DOMAIN}"
  elif [ -n "$DOMAIN" ]; then
    url="http://${DOMAIN}:${UI_PORT}"
  else
    url="http://127.0.0.1:${UI_PORT}"
  fi

  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}${BOLD}         MarkOS UI Management (v${INSTALLED_VERSION})${NC}           ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC}  Nginx:    ${nginx_status}                              ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Gateway:  ${gateway_status}  (${gw_health})            ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Mode:     ${BOLD}${DEPLOY_MODE}${NC}  |  Gateway port: ${BOLD}${GATEWAY_PORT}${NC}        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  URL:      ${BOLD}${url}${NC}"
  echo -e "${CYAN}║${NC}  SSL:      ${ssl_expiry}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  if [ -n "$token" ]; then
    echo -e "  ${DIM}Connect: ${url}/#token=${token}${NC}"
  fi
  echo ""
}

# ── Service Control ───────────────────────────────────────────
cmd_start() {
  info "Starting MarkOS UI services..."
  run_root systemctl start nginx 2>/dev/null || true
  run_root systemctl start markos-openclaw-gateway.service 2>/dev/null || true
  sleep 3
  is_nginx_running && success "Nginx started." || warn "Nginx failed to start."
  is_gateway_running && success "Gateway started." || warn "Gateway failed to start."
}

cmd_stop() {
  info "Stopping MarkOS UI services..."
  run_root systemctl stop markos-openclaw-gateway.service 2>/dev/null || true
  run_root systemctl stop nginx 2>/dev/null || true
  success "Services stopped."
}

cmd_restart() {
  info "Restarting MarkOS UI services..."
  run_root systemctl restart markos-openclaw-gateway.service 2>/dev/null || true
  run_root systemctl restart nginx 2>/dev/null || true
  sleep 3
  is_nginx_running && success "Nginx restarted." || warn "Nginx failed to restart."
  is_gateway_running && success "Gateway restarted." || warn "Gateway failed to restart."
}

cmd_status() {
  show_banner
  echo -e "${BOLD}Services:${NC}"
  run_root systemctl status nginx --no-pager -l 2>&1 | head -5
  echo ""
  run_root systemctl status markos-openclaw-gateway.service --no-pager -l 2>&1 | head -5
}

# ── Configuration ─────────────────────────────────────────────
cmd_change_port() {
  local new_port
  echo -e "  Current UI port: ${BOLD}${UI_PORT}${NC}"
  read -r -p "  New port [${UI_PORT}]: " new_port
  new_port="${new_port:-$UI_PORT}"

  if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [ "$new_port" -lt 1 ] || [ "$new_port" -gt 65535 ]; then
    fail "Invalid port number: $new_port"; return 1
  fi

  if [ "$new_port" = "$UI_PORT" ]; then
    info "Port unchanged."; return 0
  fi

  info "Updating Nginx configuration..."
  local nginx_conf="/etc/nginx/sites-available/markos-ui.conf"
  if [ -f "$nginx_conf" ]; then
    run_root sed -i "s/listen ${UI_PORT};/listen ${new_port};/g" "$nginx_conf"
    run_root sed -i "s/listen \[::\]:${UI_PORT};/listen [::]:${new_port};/g" "$nginx_conf"
  fi

  info "Testing Nginx config..."
  if run_root nginx -t 2>/dev/null; then
    run_root systemctl reload nginx
    # Update firewall
    if command_exists ufw; then
      run_root ufw allow "${new_port}/tcp" 2>/dev/null || true
    fi
    UI_PORT="$new_port"
    write_conf UI_PORT "$UI_PORT"
    success "Port changed to ${new_port}."
    if [ "$ENABLE_HTTPS" = "1" ] && [ -n "$DOMAIN" ]; then
      echo -e "  URL: ${BOLD}https://${DOMAIN}:${new_port}${NC}"
    else
      echo -e "  URL: ${BOLD}http://${DOMAIN:-127.0.0.1}:${new_port}${NC}"
    fi
  else
    fail "Nginx config test failed. Reverting..."
    run_root sed -i "s/listen ${new_port};/listen ${UI_PORT};/g" "$nginx_conf"
    run_root sed -i "s/listen \[::\]:${new_port};/listen [::]:${UI_PORT};/g" "$nginx_conf"
  fi
}

cmd_change_gateway_port() {
  local new_port
  echo -e "  Current gateway port: ${BOLD}${GATEWAY_PORT}${NC}"
  read -r -p "  New gateway port [${GATEWAY_PORT}]: " new_port
  new_port="${new_port:-$GATEWAY_PORT}"

  if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [ "$new_port" -lt 1 ] || [ "$new_port" -gt 65535 ]; then
    fail "Invalid port number: $new_port"; return 1
  fi

  if [ "$new_port" = "$GATEWAY_PORT" ]; then
    info "Port unchanged."; return 0
  fi

  info "Updating OpenClaw config..."
  local ocj="${HOME}/.openclaw/openclaw.json"
  if [ -f "$ocj" ] && command_exists python3; then
    python3 -c "
import json
with open('${ocj}', 'r') as f: c = json.load(f)
c.setdefault('gateway', {})['port'] = ${new_port}
with open('${ocj}', 'w') as f: json.dump(c, f, indent=2, ensure_ascii=False)
print('OK')
"
  fi

  info "Updating Nginx upstream..."
  local nginx_conf="/etc/nginx/sites-available/markos-ui.conf"
  if [ -f "$nginx_conf" ]; then
    run_root sed -i "s/127.0.0.1:${GATEWAY_PORT}/127.0.0.1:${new_port}/g" "$nginx_conf"
    if run_root nginx -t 2>/dev/null; then
      run_root systemctl reload nginx
    else
      fail "Nginx config test failed. Reverting..."
      run_root sed -i "s/127.0.0.1:${new_port}/127.0.0.1:${GATEWAY_PORT}/g" "$nginx_conf"
      return 1
    fi
  fi

  info "Restarting gateway..."
  run_root systemctl restart markos-openclaw-gateway.service 2>/dev/null || true
  sleep 5

  GATEWAY_PORT="$new_port"
  write_conf GATEWAY_PORT "$GATEWAY_PORT"
  success "Gateway port changed to ${new_port}."
}

cmd_change_domain() {
  local new_domain
  echo -e "  Current domain: ${BOLD}${DOMAIN:-<none>}${NC}"
  read -r -p "  New domain: " new_domain
  new_domain="${new_domain:-$DOMAIN}"

  if [ -z "$new_domain" ]; then fail "Domain cannot be empty."; return 1; fi
  if [ "$new_domain" = "$DOMAIN" ]; then info "Domain unchanged."; return 0; fi

  local old_domain="${DOMAIN}"

  # Check DNS
  info "Checking DNS for ${new_domain}..."
  local domain_ip public_ip
  domain_ip=$(dig +short A "$new_domain" 2>/dev/null | head -1)
  public_ip=$(curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)
  if [ -z "$domain_ip" ]; then
    warn "Cannot resolve ${new_domain}. SSL certificate issuance may fail."
  elif [ -n "$public_ip" ] && [ "$domain_ip" != "$public_ip" ]; then
    warn "${new_domain} resolves to ${domain_ip}, but this server is ${public_ip}."
  else
    success "DNS OK: ${new_domain} → ${domain_ip}"
  fi

  info "Updating Nginx config..."
  local nginx_conf="/etc/nginx/sites-available/markos-ui.conf"
  if [ -f "$nginx_conf" ] && [ -n "$old_domain" ]; then
    run_root sed -i "s/server_name ${old_domain}/server_name ${new_domain}/g" "$nginx_conf"
    run_root sed -i "s/\$host = ${old_domain}/\$host = ${new_domain}/g" "$nginx_conf"
  fi

  if run_root nginx -t 2>/dev/null; then
    run_root systemctl reload nginx
  else
    fail "Nginx config test failed. Reverting..."
    if [ -n "$old_domain" ]; then
      run_root sed -i "s/server_name ${new_domain}/server_name ${old_domain}/g" "$nginx_conf"
    fi
    return 1
  fi

  DOMAIN="$new_domain"
  write_conf DOMAIN "$DOMAIN"

  # Update OpenClaw allowedOrigins
  local ocj="${HOME}/.openclaw/openclaw.json"
  if [ -f "$ocj" ] && command_exists python3; then
    info "Updating OpenClaw allowedOrigins..."
    python3 -c "
import json
with open('${ocj}', 'r') as f: c = json.load(f)
cu = c.setdefault('gateway', {}).setdefault('controlUi', {})
origins = cu.get('allowedOrigins', [])
origins = [o for o in origins if '${old_domain}' not in o]
origins.append('https://${new_domain}')
cu['allowedOrigins'] = list(set(origins))
with open('${ocj}', 'w') as f: json.dump(c, f, indent=2, ensure_ascii=False)
" 2>/dev/null
    run_root systemctl restart markos-openclaw-gateway.service 2>/dev/null || true
  fi

  # SSL
  if [ "$ENABLE_HTTPS" = "1" ]; then
    echo ""
    read -r -p "  Issue SSL certificate for ${new_domain}? [Y/n]: " ssl_choice
    ssl_choice="${ssl_choice:-y}"
    if [[ "$ssl_choice" =~ ^[Yy] ]]; then
      cmd_ssl_apply
    fi
  fi

  success "Domain changed to ${new_domain}."
  local token; token=$(get_gateway_token)
  echo -e "  URL: ${BOLD}https://${new_domain}${NC}"
  [ -n "$token" ] && echo -e "  Connect: https://${new_domain}/#token=${token}"
}

cmd_view_config() {
  echo -e "\n${BOLD}Current Configuration:${NC}\n"
  echo -e "  Deploy Mode:    ${BOLD}${DEPLOY_MODE}${NC}"
  echo -e "  Domain:         ${BOLD}${DOMAIN:-<not set>}${NC}"
  echo -e "  UI Port:        ${BOLD}${UI_PORT}${NC}"
  echo -e "  Gateway Port:   ${BOLD}${GATEWAY_PORT}${NC}"
  echo -e "  Install Dir:    ${BOLD}${INSTALL_DIR}${NC}"
  echo -e "  HTTPS:          ${BOLD}$([ "$ENABLE_HTTPS" = "1" ] && echo "enabled" || echo "disabled")${NC}"
  echo -e "  Email:          ${BOLD}${EMAIL:-<not set>}${NC}"
  echo -e "  Version:        ${BOLD}${INSTALLED_VERSION}${NC}"
  echo -e "  Config File:    ${DIM}${CONF_FILE}${NC}"
  echo ""
  local token; token=$(get_gateway_token)
  if [ -n "$token" ]; then
    echo -e "  Gateway Token:  ${DIM}${token:0:12}...${NC}"
    local url
    [ "$ENABLE_HTTPS" = "1" ] && [ -n "$DOMAIN" ] && url="https://${DOMAIN}" || url="http://${DOMAIN:-127.0.0.1}:${UI_PORT}"
    echo -e "  Connect URL:    ${BOLD}${url}/#token=${token}${NC}"
  fi
}

# ── SSL ───────────────────────────────────────────────────────
cmd_ssl_apply() {
  if [ -z "$DOMAIN" ]; then die "No domain configured. Set one first with option 7."; fi

  info "Issuing SSL certificate for ${DOMAIN}..."
  local certbot_args=("--nginx" "--non-interactive" "--agree-tos" "-d" "$DOMAIN" "--redirect")
  if [ -n "$EMAIL" ]; then
    certbot_args+=("-m" "$EMAIL")
  else
    certbot_args+=("--register-unsafely-without-email")
  fi

  if run_root certbot "${certbot_args[@]}" 2>&1; then
    run_root systemctl enable --now certbot.timer 2>/dev/null || true
    ENABLE_HTTPS=1
    write_conf ENABLE_HTTPS "1"
    success "SSL certificate issued and auto-renewal enabled."
  else
    fail "Certificate issuance failed. Check DNS and firewall (port 80 must be open)."
  fi
}

cmd_ssl_force_renew() {
  if [ -z "$DOMAIN" ]; then die "No domain configured."; fi
  info "Force-renewing SSL certificate..."
  run_root certbot renew --force-renewal --cert-name "$DOMAIN" 2>&1
  run_root systemctl reload nginx 2>/dev/null || true
  success "Certificate renewed."
}

cmd_ssl_info() {
  if [ -z "$DOMAIN" ]; then echo "  No domain configured."; return; fi
  echo ""
  run_root certbot certificates -d "$DOMAIN" 2>&1
}

# ── Logs ──────────────────────────────────────────────────────
cmd_logs_nginx() {
  info "Nginx logs (Ctrl+C to stop):"
  tail -f /var/log/nginx/access.log /var/log/nginx/error.log 2>/dev/null
}

cmd_logs_gateway() {
  info "Gateway logs (Ctrl+C to stop):"
  journalctl -u markos-openclaw-gateway.service -f --no-pager 2>/dev/null
}

# ── Update & Rebuild ──────────────────────────────────────────
cmd_update() {
  info "Updating MarkOS UI..."
  cd "$INSTALL_DIR" || die "Install directory not found: $INSTALL_DIR"

  if [ -d .git ]; then
    info "Pulling latest changes..."
    git pull origin main 2>&1
  else
    info "Downloading latest release..."
    local tmp
    tmp=$(mktemp -d)
    curl -fsSL "https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/main" | tar -xz -C "$tmp"
    local extracted
    extracted=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)
    if [ -n "$extracted" ]; then
      rsync -a --exclude='.markos.conf' --exclude='.env' --exclude='node_modules' --exclude='dist' "$extracted/" "$INSTALL_DIR/"
      rm -rf "$tmp"
    fi
  fi

  cmd_rebuild
}

cmd_rebuild() {
  info "Rebuilding frontend..."
  cd "$INSTALL_DIR" || die "Install directory not found: $INSTALL_DIR"

  npm ci 2>&1 | tail -3
  npm run build 2>&1 | tail -5

  run_root systemctl reload nginx 2>/dev/null || true
  success "Frontend rebuilt and deployed."
}

# ── Token Reset ───────────────────────────────────────────────
cmd_reset_token() {
  local ocj="${HOME}/.openclaw/openclaw.json"
  if [ ! -f "$ocj" ]; then die "OpenClaw config not found at $ocj"; fi

  local new_token
  new_token=$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | xxd -p | tr -d '\n' | head -c 48)

  info "Resetting gateway token..."
  python3 -c "
import json
with open('${ocj}', 'r') as f: c = json.load(f)
c.setdefault('gateway', {}).setdefault('auth', {})['token'] = '${new_token}'
with open('${ocj}', 'w') as f: json.dump(c, f, indent=2, ensure_ascii=False)
"

  GATEWAY_TOKEN="$new_token"
  write_conf GATEWAY_TOKEN "$GATEWAY_TOKEN"

  info "Restarting gateway..."
  run_root systemctl restart markos-openclaw-gateway.service 2>/dev/null || true
  sleep 5

  success "Token reset complete."
  local url
  [ "$ENABLE_HTTPS" = "1" ] && [ -n "$DOMAIN" ] && url="https://${DOMAIN}" || url="http://${DOMAIN:-127.0.0.1}:${UI_PORT}"
  echo -e "  New connect URL: ${BOLD}${url}/#token=${new_token}${NC}"
  echo -e "  ${YELLOW}All existing browser sessions will need to reconnect with this URL.${NC}"
}

# ── Backup ────────────────────────────────────────────────────
cmd_backup() {
  local backup_dir="${INSTALL_DIR}/backups"
  local timestamp; timestamp=$(date +%Y%m%d-%H%M%S)
  local backup_file="${backup_dir}/markos-backup-${timestamp}.tar.gz"

  mkdir -p "$backup_dir"
  info "Creating backup..."

  local files=()
  [ -f "$CONF_FILE" ] && files+=("$CONF_FILE")
  [ -f "${INSTALL_DIR}/.env" ] && files+=("${INSTALL_DIR}/.env")
  [ -f "/etc/nginx/sites-available/markos-ui.conf" ] && files+=("/etc/nginx/sites-available/markos-ui.conf")
  [ -f "${HOME}/.openclaw/openclaw.json" ] && files+=("${HOME}/.openclaw/openclaw.json")
  [ -f "/etc/systemd/system/markos-openclaw-gateway.service" ] && files+=("/etc/systemd/system/markos-openclaw-gateway.service")

  if [ ${#files[@]} -eq 0 ]; then
    warn "No config files found to backup."; return
  fi

  tar -czf "$backup_file" "${files[@]}" 2>/dev/null
  success "Backup saved to ${backup_file}"
  echo -e "  Included: ${#files[@]} files"
}

# ── Uninstall ─────────────────────────────────────────────────
cmd_uninstall() {
  echo ""
  warn "This will stop all services and remove MarkOS UI files."
  read -r -p "  Type 'yes' to confirm uninstall: " confirm
  if [ "$confirm" != "yes" ]; then
    info "Uninstall cancelled."; return
  fi

  info "Stopping services..."
  run_root systemctl stop markos-openclaw-gateway.service 2>/dev/null || true
  run_root systemctl disable markos-openclaw-gateway.service 2>/dev/null || true
  run_root rm -f /etc/systemd/system/markos-openclaw-gateway.service
  run_root systemctl daemon-reload 2>/dev/null || true

  info "Removing Nginx config..."
  run_root rm -f /etc/nginx/sites-enabled/markos-ui.conf
  run_root rm -f /etc/nginx/sites-available/markos-ui.conf
  run_root systemctl reload nginx 2>/dev/null || true

  info "Removing management command..."
  run_root rm -f /usr/local/bin/markos

  echo ""
  read -r -p "  Also remove install directory ${INSTALL_DIR}? [y/N]: " remove_dir
  if [[ "$remove_dir" =~ ^[Yy] ]]; then
    rm -rf "$INSTALL_DIR"
    success "Install directory removed."
  fi

  read -r -p "  Also remove SSL certificates for ${DOMAIN}? [y/N]: " remove_ssl
  if [[ "$remove_ssl" =~ ^[Yy] ]] && [ -n "$DOMAIN" ]; then
    run_root certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || true
    success "Certificates removed."
  fi

  success "MarkOS UI has been uninstalled."
}

# ── Interactive Menu ──────────────────────────────────────────
show_menu() {
  echo -e "${CYAN}─── Service Control ───────────────────────────────────${NC}"
  echo -e "  ${BOLD}1.${NC}  Start services"
  echo -e "  ${BOLD}2.${NC}  Stop services"
  echo -e "  ${BOLD}3.${NC}  Restart services"
  echo -e "  ${BOLD}4.${NC}  View detailed status"
  echo ""
  echo -e "${CYAN}─── Configuration ─────────────────────────────────────${NC}"
  echo -e "  ${BOLD}5.${NC}  Change UI port"
  echo -e "  ${BOLD}6.${NC}  Change gateway port"
  echo -e "  ${BOLD}7.${NC}  Change domain"
  echo -e "  ${BOLD}8.${NC}  View current config"
  echo ""
  echo -e "${CYAN}─── SSL Certificate ───────────────────────────────────${NC}"
  echo -e "  ${BOLD}9.${NC}  Apply/renew SSL certificate"
  echo -e "  ${BOLD}10.${NC} Force renew SSL"
  echo -e "  ${BOLD}11.${NC} View certificate info"
  echo ""
  echo -e "${CYAN}─── Maintenance ───────────────────────────────────────${NC}"
  echo -e "  ${BOLD}12.${NC} View Nginx logs"
  echo -e "  ${BOLD}13.${NC} View gateway logs"
  echo -e "  ${BOLD}14.${NC} Update MarkOS UI"
  echo -e "  ${BOLD}15.${NC} Rebuild frontend"
  echo ""
  echo -e "${CYAN}─── Advanced ──────────────────────────────────────────${NC}"
  echo -e "  ${BOLD}16.${NC} Reset gateway token"
  echo -e "  ${BOLD}17.${NC} Backup configuration"
  echo -e "  ${BOLD}18.${NC} Uninstall"
  echo ""
  echo -e "  ${BOLD}0.${NC}  Exit"
  echo ""
}

run_interactive() {
  while true; do
    show_banner
    show_menu
    read -r -p "  Choose [0-18]: " choice
    echo ""
    case "$choice" in
      1)  cmd_start ;;
      2)  cmd_stop ;;
      3)  cmd_restart ;;
      4)  cmd_status ;;
      5)  cmd_change_port ;;
      6)  cmd_change_gateway_port ;;
      7)  cmd_change_domain ;;
      8)  cmd_view_config ;;
      9)  cmd_ssl_apply ;;
      10) cmd_ssl_force_renew ;;
      11) cmd_ssl_info ;;
      12) cmd_logs_nginx ;;
      13) cmd_logs_gateway ;;
      14) cmd_update ;;
      15) cmd_rebuild ;;
      16) cmd_reset_token ;;
      17) cmd_backup ;;
      18) cmd_uninstall; exit 0 ;;
      0)  echo "  Bye!"; exit 0 ;;
      *)  warn "Invalid choice: $choice" ;;
    esac
    echo ""
    read -r -p "  Press Enter to continue..." _
    clear 2>/dev/null || true
  done
}

# ── Direct Command Mode ──────────────────────────────────────
run_direct() {
  case "$1" in
    start)        cmd_start ;;
    stop)         cmd_stop ;;
    restart)      cmd_restart ;;
    status)       show_banner ;;
    config)       cmd_view_config ;;
    port)         [ -n "${2:-}" ] && { UI_PORT="$UI_PORT"; read_input="$2"; } || true; cmd_change_port ;;
    gateway-port) cmd_change_gateway_port ;;
    domain)       cmd_change_domain ;;
    ssl)          cmd_ssl_apply ;;
    ssl-renew)    cmd_ssl_force_renew ;;
    ssl-info)     cmd_ssl_info ;;
    logs)         cmd_logs_gateway ;;
    logs-nginx)   cmd_logs_nginx ;;
    update)       cmd_update ;;
    rebuild)      cmd_rebuild ;;
    token)        cmd_reset_token ;;
    backup)       cmd_backup ;;
    uninstall)    cmd_uninstall ;;
    help|--help|-h)
      echo "Usage: markos [command]"
      echo ""
      echo "Commands:"
      echo "  start          Start all services"
      echo "  stop           Stop all services"
      echo "  restart        Restart all services"
      echo "  status         Show status banner"
      echo "  config         View current configuration"
      echo "  port           Change UI port"
      echo "  gateway-port   Change gateway port"
      echo "  domain         Change domain"
      echo "  ssl            Apply SSL certificate"
      echo "  ssl-renew      Force renew SSL"
      echo "  ssl-info       View certificate info"
      echo "  logs           View gateway logs"
      echo "  logs-nginx     View Nginx logs"
      echo "  update         Update to latest version"
      echo "  rebuild        Rebuild frontend"
      echo "  token          Reset gateway token"
      echo "  backup         Backup configuration"
      echo "  uninstall      Uninstall MarkOS UI"
      echo ""
      echo "Run without arguments for interactive menu."
      ;;
    *)
      fail "Unknown command: $1"
      echo "  Run 'markos help' for available commands."
      exit 1
      ;;
  esac
}

# ── Main ──────────────────────────────────────────────────────
main() {
  if ! find_conf; then
    # No config found — generate one from current state
    local dir="/srv/markos-ui"
    [ -d "$dir" ] || dir="$(pwd)"

    # Try to detect current settings
    DEPLOY_MODE="vps"
    GATEWAY_PORT="18789"
    UI_PORT="443"
    DOMAIN=""
    ENABLE_HTTPS="0"
    EMAIL=""

    # Detect domain from nginx
    local nginx_conf="/etc/nginx/sites-available/markos-ui.conf"
    if [ -f "$nginx_conf" ]; then
      DOMAIN=$(grep -m1 'server_name' "$nginx_conf" 2>/dev/null | awk '{print $2}' | tr -d ';' || true)
      [ "$DOMAIN" = "_" ] && DOMAIN=""
    fi

    # Detect HTTPS
    if [ -n "$DOMAIN" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
      ENABLE_HTTPS="1"
    fi

    # Detect gateway token
    GATEWAY_TOKEN=$(get_gateway_token)

    generate_conf "$dir"
    load_conf
  else
    load_conf
  fi

  if [ "$#" -eq 0 ]; then
    run_interactive
  else
    run_direct "$@"
  fi
}

main "$@"
