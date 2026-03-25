#!/bin/bash

set -euo pipefail

APP_NAME="MarkOS UI"
REPO_SLUG="${MARKOS_REPO_SLUG:-mktt-ai-global/MarkOS-UI}"
REPO_REF="${MARKOS_REPO_REF:-main}"
DEFAULT_LOCAL_HOST="127.0.0.1"
DEFAULT_LOCAL_UI_PORT="4173"
DEFAULT_GATEWAY_PORT="18789"
DEFAULT_HTTP_PORT="80"
DEFAULT_HTTPS_PORT="443"
DEFAULT_LOCAL_INSTALL_DIR="$HOME/.local/share/markos-ui"
DEFAULT_VPS_INSTALL_DIR="/srv/markos-ui"
DEFAULT_CONFIG_OUTPUT_DIR="./deploy/generated"
DEFAULT_OPENCLAW_SPEC="${OPENCLAW_NPM_SPEC:-openclaw@latest}"
SITE_NAME="markos-ui"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

MODE=""
INTERACTIVE=1
HOST="$DEFAULT_LOCAL_HOST"
UI_PORT="$DEFAULT_LOCAL_UI_PORT"
GATEWAY_PORT="$DEFAULT_GATEWAY_PORT"
HTTP_PORT="$DEFAULT_HTTP_PORT"
HTTPS_PORT="$DEFAULT_HTTPS_PORT"
DOMAIN=""
EMAIL=""
INSTALL_DIR=""
OUTPUT_DIR="$DEFAULT_CONFIG_OUTPUT_DIR"
ENABLE_HTTPS=""
INSTALL_OPENCLAW=""
OPEN_BROWSER=""
DOCKER_UPSTREAM_HOST="host.docker.internal"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"
SOURCE_DIR=""
WORKSPACE_DIR=""
TEMP_DIR=""
DIST_ROOT=""

INVOCATION_USER="${SUDO_USER:-$(id -un)}"
INVOCATION_GROUP="$(id -gn "$INVOCATION_USER")"

cleanup() {
  if [ -n "${TEMP_DIR:-}" ] && [ -d "${TEMP_DIR:-}" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

print_banner() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║          MarkOS UI One-Click Installer            ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
}

info() {
  echo -e "${BLUE}→${NC} $*"
}

success() {
  echo -e "${GREEN}✓${NC} $*"
}

warn() {
  echo -e "${YELLOW}⚠${NC} $*"
}

die() {
  echo -e "${RED}✗${NC} $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" > /dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    die "This step requires root privileges, but sudo is not available."
  fi
}

usage() {
  cat <<EOF
Usage:
  ./install.sh
  ./install.sh --mode local
  ./install.sh --mode vps --domain ai.example.com --email ops@example.com
  ./install.sh --mode docker --ui-port 8080 --gateway-port 18789
  ./install.sh --mode config --domain ai.example.com

Options:
  --mode <local|vps|docker|config>
  --host <host>
  --ui-port <port>
  --gateway-port <port>
  --domain <domain>
  --http-port <port>
  --https-port <port>
  --email <email>
  --install-dir <path>
  --output-dir <path>
  --docker-upstream-host <host>
  --https / --no-https
  --openclaw / --no-openclaw
  --open-browser / --no-open-browser
  --non-interactive
  --deploy-guide
  --help

Examples:
  bash <(curl -fsSL https://raw.githubusercontent.com/${REPO_SLUG}/main/install.sh)
  bash <(curl -fsSL https://raw.githubusercontent.com/${REPO_SLUG}/main/install.sh) --mode vps --domain ai.example.com --email ops@example.com
EOF
}

deploy_guide() {
  cat <<'EOF'
MarkOS UI deployment modes

1. Local preview
   ./install.sh --mode local

2. VPS production with Nginx + certbot auto-renew
   ./install.sh --mode vps --domain ai.example.com --email ops@example.com

3. Docker deployment
   ./install.sh --mode docker

4. Config generation only
   ./install.sh --mode config --domain ai.example.com

Template files:
  deploy/nginx/markos-ui.conf.template
  deploy/systemd/markos-openclaw-gateway.service.template
  docs/github-actions-ci.yml.example
EOF
}

prompt_with_default() {
  local label="$1"
  local default_value="$2"
  local value=""

  if [ "$INTERACTIVE" -eq 0 ]; then
    printf '%s' "$default_value"
    return
  fi

  read -r -p "$label [$default_value]: " value
  printf '%s' "${value:-$default_value}"
}

prompt_required() {
  local label="$1"
  local value=""

  if [ "$INTERACTIVE" -eq 0 ]; then
    die "Missing required value for: $label"
  fi

  while [ -z "$value" ]; do
    read -r -p "$label: " value
  done

  printf '%s' "$value"
}

prompt_yes_no() {
  local label="$1"
  local default_value="$2"
  local input=""
  local prompt_suffix="[y/N]"

  if [ "$default_value" = "y" ]; then
    prompt_suffix="[Y/n]"
  fi

  if [ "$INTERACTIVE" -eq 0 ]; then
    [ "$default_value" = "y" ]
    return
  fi

  while true; do
    read -r -p "$label $prompt_suffix: " input
    input="${input:-$default_value}"
    case "${input}" in
      y|Y|yes|YES) return 0 ;;
      n|N|no|NO) return 1 ;;
      *) warn "Please answer y or n." ;;
    esac
  done
}

validate_port() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  [ "$value" -ge 1 ] && [ "$value" -le 65535 ]
}

require_port() {
  local label="$1"
  local value="$2"
  validate_port "$value" || die "$label must be a valid port number. Received: $value"
}

select_mode_interactive() {
  local choice=""

  echo "Choose an install mode:"
  echo "  1. Local Preview"
  echo "  2. VPS Production"
  echo "  3. Docker Deploy"
  echo "  4. Generate Config Only"
  echo ""

  while true; do
    read -r -p "Select [1-4]: " choice
    case "$choice" in
      1) MODE="local"; return ;;
      2) MODE="vps"; return ;;
      3) MODE="docker"; return ;;
      4) MODE="config"; return ;;
      *) warn "Please choose 1, 2, 3, or 4." ;;
    esac
  done
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        MODE="${2:-}"
        shift 2
        ;;
      --host)
        HOST="${2:-}"
        shift 2
        ;;
      --ui-port)
        UI_PORT="${2:-}"
        shift 2
        ;;
      --gateway-port)
        GATEWAY_PORT="${2:-}"
        shift 2
        ;;
      --domain)
        DOMAIN="${2:-}"
        shift 2
        ;;
      --http-port)
        HTTP_PORT="${2:-}"
        shift 2
        ;;
      --https-port)
        HTTPS_PORT="${2:-}"
        shift 2
        ;;
      --email)
        EMAIL="${2:-}"
        shift 2
        ;;
      --install-dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --output-dir)
        OUTPUT_DIR="${2:-}"
        shift 2
        ;;
      --docker-upstream-host)
        DOCKER_UPSTREAM_HOST="${2:-}"
        shift 2
        ;;
      --https)
        ENABLE_HTTPS="1"
        shift
        ;;
      --no-https)
        ENABLE_HTTPS="0"
        shift
        ;;
      --openclaw)
        INSTALL_OPENCLAW="1"
        shift
        ;;
      --no-openclaw)
        INSTALL_OPENCLAW="0"
        shift
        ;;
      --open-browser)
        OPEN_BROWSER="1"
        shift
        ;;
      --no-open-browser)
        OPEN_BROWSER="0"
        shift
        ;;
      --non-interactive)
        INTERACTIVE=0
        shift
        ;;
      --deploy-guide)
        deploy_guide
        exit 0
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

find_project_root() {
  local candidate
  for candidate in "$CURRENT_DIR" "$SCRIPT_DIR"; do
    if [ -f "$candidate/package.json" ] && [ -f "$candidate/README.md" ]; then
      printf '%s' "$candidate"
      return
    fi
  done
}

download_repo_archive() {
  local download_root archive_url extracted_dir

  download_root="$(mktemp -d "${TMPDIR:-/tmp}/markos-ui.XXXXXX")"
  TEMP_DIR="$download_root"
  archive_url="https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${REPO_REF}"

  info "Downloading ${APP_NAME} sources from GitHub..."
  curl -fsSL "$archive_url" | tar -xz -C "$download_root"
  extracted_dir="$(find "$download_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

  [ -n "$extracted_dir" ] || die "Failed to extract repository archive."
  SOURCE_DIR="$extracted_dir"
  success "Downloaded source archive to a temporary workspace."
}

prepare_source_dir() {
  local project_root

  project_root="$(find_project_root || true)"
  if [ -n "$project_root" ]; then
    SOURCE_DIR="$project_root"
    success "Using local project source at $SOURCE_DIR"
  else
    download_repo_archive
  fi
}

prepare_workspace() {
  local default_install_dir="$1"
  local used_root=0

  prepare_source_dir

  if [ -n "$INSTALL_DIR" ]; then
    WORKSPACE_DIR="$INSTALL_DIR"
  elif [ "$SOURCE_DIR" = "$CURRENT_DIR" ] || [ "$SOURCE_DIR" = "$SCRIPT_DIR" ]; then
    WORKSPACE_DIR="$SOURCE_DIR"
  else
    WORKSPACE_DIR="$default_install_dir"
  fi

  if [ "$WORKSPACE_DIR" != "$SOURCE_DIR" ]; then
    info "Preparing workspace at $WORKSPACE_DIR"
    if [ -d "$WORKSPACE_DIR" ] && [ -w "$WORKSPACE_DIR" ]; then
      :
    elif mkdir -p "$WORKSPACE_DIR" 2> /dev/null && [ -w "$WORKSPACE_DIR" ]; then
      :
    else
      run_root mkdir -p "$WORKSPACE_DIR"
      used_root=1
    fi

    if [ "$used_root" -eq 1 ]; then
      run_root chown -R "$INVOCATION_USER:$INVOCATION_GROUP" "$WORKSPACE_DIR"
    fi

    tar \
      --exclude='./.git' \
      --exclude='./node_modules' \
      --exclude='./dist' \
      --exclude='./release' \
      --exclude='./test-results' \
      --exclude='./.vite' \
      --exclude='./openclaw-ui' \
      --exclude='./个' \
      --exclude='./.DS_Store' \
      -cf - -C "$SOURCE_DIR" . | tar -xf - -C "$WORKSPACE_DIR"
  fi

  cd "$WORKSPACE_DIR"
  success "Workspace ready at $WORKSPACE_DIR"
}

ensure_node_and_npm() {
  command_exists node || die "Node.js 22+ is required. Install it from https://nodejs.org/ and rerun the installer."
  command_exists npm || die "npm is required. Install Node.js 22+ and rerun the installer."

  local major_version
  major_version="$(node -v | sed 's/^v//' | cut -d. -f1)"

  if [ "$major_version" -lt 22 ]; then
    die "Node.js 22+ is required. Detected: $(node -v)"
  fi

  success "Node.js $(node -v) and npm $(npm -v) detected."
}

install_ui_dependencies() {
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
}

build_ui() {
  info "Installing frontend dependencies..."
  install_ui_dependencies
  info "Building production bundle..."
  npm run build
  success "Built frontend assets in $WORKSPACE_DIR/dist"
}

gateway_ready() {
  local url
  for url in \
    "http://127.0.0.1:${GATEWAY_PORT}/health" \
    "http://127.0.0.1:${GATEWAY_PORT}/v1/health" \
    "http://127.0.0.1:${GATEWAY_PORT}"; do
    if curl -fsS --max-time 2 "$url" > /dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

ensure_openclaw() {
  if command_exists openclaw; then
    success "OpenClaw detected: $(openclaw --version 2>/dev/null || echo unknown)"
  else
    info "Installing OpenClaw (${DEFAULT_OPENCLAW_SPEC})..."
    npm install -g "$DEFAULT_OPENCLAW_SPEC"
    success "OpenClaw installed."
  fi
}

ensure_openclaw_config() {
  local state_dir
  state_dir="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

  if [ -f "$state_dir/openclaw.json" ]; then
    success "OpenClaw config found at $state_dir/openclaw.json"
  else
    info "Running OpenClaw onboarding..."
    openclaw onboard --install-daemon
    success "OpenClaw onboarding completed."
  fi
}

maybe_install_openclaw_for_mode() {
  case "$MODE" in
    local)
      if [ -z "$INSTALL_OPENCLAW" ]; then
        if prompt_yes_no "Also install or verify the OpenClaw gateway for live mode?" "n"; then
          INSTALL_OPENCLAW="1"
        else
          INSTALL_OPENCLAW="0"
        fi
      fi
      ;;
    vps)
      if [ -z "$INSTALL_OPENCLAW" ]; then
        INSTALL_OPENCLAW="1"
      fi
      ;;
    docker|config)
      if [ -z "$INSTALL_OPENCLAW" ]; then
        INSTALL_OPENCLAW="0"
      fi
      ;;
  esac

  if [ "$INSTALL_OPENCLAW" = "1" ]; then
    ensure_openclaw
    ensure_openclaw_config
  fi
}

maybe_start_gateway() {
  if [ "$INSTALL_OPENCLAW" != "1" ]; then
    return
  fi

  if gateway_ready; then
    success "OpenClaw gateway already running on port $GATEWAY_PORT"
    return
  fi

  info "Starting a temporary OpenClaw gateway..."
  openclaw gateway &
  GATEWAY_PID=$!
  sleep 3

  if gateway_ready; then
    success "OpenClaw gateway started."
  else
    warn "Gateway may still be starting. You can check it with: openclaw status"
  fi
}

cleanup_gateway() {
  if [ -n "${GATEWAY_PID:-}" ] && kill -0 "$GATEWAY_PID" > /dev/null 2>&1; then
    warn "Stopping temporary OpenClaw gateway..."
    kill "$GATEWAY_PID" > /dev/null 2>&1 || true
  fi
}

open_url() {
  local url="$1"
  if [ "${OPEN_BROWSER:-0}" != "1" ]; then
    return
  fi

  if command_exists open; then
    open "$url" > /dev/null 2>&1 || true
  elif command_exists xdg-open; then
    xdg-open "$url" > /dev/null 2>&1 || true
  fi
}

render_template() {
  local template_path="$1"
  local output_path="$2"

  sed \
    -e "s#__DOMAIN__#${DOMAIN}#g" \
    -e "s#__DIST_ROOT__#${DIST_ROOT:-$WORKSPACE_DIR/dist}#g" \
    -e "s#__HTTP_PORT__#${HTTP_PORT}#g" \
    -e "s#__GATEWAY_PORT__#${GATEWAY_PORT}#g" \
    -e "s#__SERVICE_USER__#${INVOCATION_USER}#g" \
    -e "s#__WORKING_DIR__#${WORKSPACE_DIR}#g" \
    "$template_path" > "$output_path"
}

install_vps_packages() {
  if command_exists apt-get; then
    info "Installing Nginx and certbot packages with apt..."
    run_root apt-get update
    run_root apt-get install -y nginx certbot python3-certbot-nginx
    return
  fi

  if command_exists dnf; then
    info "Installing Nginx and certbot packages with dnf..."
    run_root dnf install -y nginx certbot python3-certbot-nginx
    return
  fi

  if command_exists yum; then
    info "Installing Nginx and certbot packages with yum..."
    run_root yum install -y nginx certbot python3-certbot-nginx
    return
  fi

  die "Unsupported package manager. Install Nginx and certbot manually, then rerun the VPS mode."
}

configure_nginx_site() {
  local rendered_config site_available site_enabled

  rendered_config="$(mktemp "${TMPDIR:-/tmp}/markos-ui.nginx.XXXXXX")"
  render_template "$WORKSPACE_DIR/deploy/nginx/markos-ui.conf.template" "$rendered_config"

  site_available="/etc/nginx/sites-available/${SITE_NAME}.conf"
  site_enabled="/etc/nginx/sites-enabled/${SITE_NAME}.conf"

  run_root chmod -R a+rX "$WORKSPACE_DIR/dist"
  run_root cp "$rendered_config" "$site_available"
  run_root ln -sfn "$site_available" "$site_enabled"
  run_root nginx -t
  run_root systemctl enable --now nginx
  run_root systemctl reload nginx

  success "Nginx site enabled: $site_available"
}

configure_gateway_service() {
  local rendered_service service_path

  service_path="/etc/systemd/system/markos-openclaw-gateway.service"
  rendered_service="$(mktemp "${TMPDIR:-/tmp}/markos-ui.service.XXXXXX")"
  render_template "$WORKSPACE_DIR/deploy/systemd/markos-openclaw-gateway.service.template" "$rendered_service"

  run_root cp "$rendered_service" "$service_path"
  run_root systemctl daemon-reload
  run_root systemctl enable --now markos-openclaw-gateway.service

  success "Systemd gateway service installed: $service_path"
}

enable_https_with_certbot() {
  local certbot_args=("--nginx" "--non-interactive" "--agree-tos" "-d" "$DOMAIN" "--redirect")

  if [ -n "$EMAIL" ]; then
    certbot_args+=("-m" "$EMAIL")
  else
    certbot_args+=("--register-unsafely-without-email")
  fi

  info "Issuing Let's Encrypt certificate for $DOMAIN ..."
  run_root certbot "${certbot_args[@]}"

  if command_exists systemctl; then
    if run_root systemctl list-unit-files certbot.timer > /dev/null 2>&1; then
      run_root systemctl enable --now certbot.timer
      success "Enabled certbot.timer for automatic renewal."
    else
      warn "certbot.timer was not found. certbot may still install its own renewal job."
    fi
  fi

  success "HTTPS is configured for $DOMAIN. Certificates will auto-renew via certbot."
}

configure_local_mode() {
  HOST="${HOST:-$DEFAULT_LOCAL_HOST}"
  UI_PORT="${UI_PORT:-$DEFAULT_LOCAL_UI_PORT}"
  GATEWAY_PORT="${GATEWAY_PORT:-$DEFAULT_GATEWAY_PORT}"

  if [ "$INTERACTIVE" -eq 1 ]; then
    HOST="$(prompt_with_default "Bind host" "$HOST")"
    UI_PORT="$(prompt_with_default "UI port" "$UI_PORT")"
    GATEWAY_PORT="$(prompt_with_default "Gateway port" "$GATEWAY_PORT")"
    if [ -z "$OPEN_BROWSER" ]; then
      if prompt_yes_no "Open the browser automatically when ready?" "y"; then
        OPEN_BROWSER="1"
      else
        OPEN_BROWSER="0"
      fi
    fi
  fi

  require_port "UI port" "$UI_PORT"
  require_port "Gateway port" "$GATEWAY_PORT"
}

configure_vps_mode() {
  DOMAIN="${DOMAIN:-}"
  GATEWAY_PORT="${GATEWAY_PORT:-$DEFAULT_GATEWAY_PORT}"
  HTTP_PORT="${HTTP_PORT:-$DEFAULT_HTTP_PORT}"
  HTTPS_PORT="${HTTPS_PORT:-$DEFAULT_HTTPS_PORT}"
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_VPS_INSTALL_DIR}"

  if [ "$INTERACTIVE" -eq 1 ]; then
    if [ -n "$DOMAIN" ]; then
      DOMAIN="$(prompt_with_default "Domain name" "$DOMAIN")"
    else
      DOMAIN="$(prompt_required "Domain name")"
    fi
    GATEWAY_PORT="$(prompt_with_default "OpenClaw gateway port" "$GATEWAY_PORT")"
    HTTP_PORT="$(prompt_with_default "Public HTTP port" "$HTTP_PORT")"
    HTTPS_PORT="$(prompt_with_default "Public HTTPS port" "$HTTPS_PORT")"
    INSTALL_DIR="$(prompt_with_default "Install directory" "$INSTALL_DIR")"

    if [ -z "$ENABLE_HTTPS" ]; then
      if prompt_yes_no "Enable HTTPS and automatic certificate renewal?" "y"; then
        ENABLE_HTTPS="1"
      else
        ENABLE_HTTPS="0"
      fi
    fi

    if [ "$ENABLE_HTTPS" = "1" ]; then
      EMAIL="$(prompt_with_default "Email for Let's Encrypt renewal notices (optional)" "$EMAIL")"
    fi
  fi

  [ -n "$DOMAIN" ] || die "A domain is required for VPS mode."
  require_port "Gateway port" "$GATEWAY_PORT"
  require_port "HTTP port" "$HTTP_PORT"
  require_port "HTTPS port" "$HTTPS_PORT"

  if [ "${ENABLE_HTTPS:-1}" = "1" ] && { [ "$HTTP_PORT" != "80" ] || [ "$HTTPS_PORT" != "443" ]; }; then
    warn "Automatic HTTPS renewal with certbot is most reliable on ports 80 and 443. Resetting them to 80/443."
    HTTP_PORT="80"
    HTTPS_PORT="443"
  fi
}

configure_docker_mode() {
  UI_PORT="${UI_PORT:-$DEFAULT_LOCAL_UI_PORT}"
  GATEWAY_PORT="${GATEWAY_PORT:-$DEFAULT_GATEWAY_PORT}"
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_LOCAL_INSTALL_DIR}"

  if [ "$INTERACTIVE" -eq 1 ]; then
    UI_PORT="$(prompt_with_default "Docker-exposed UI port" "$UI_PORT")"
    DOCKER_UPSTREAM_HOST="$(prompt_with_default "Docker upstream host for OpenClaw" "$DOCKER_UPSTREAM_HOST")"
    GATEWAY_PORT="$(prompt_with_default "Upstream OpenClaw gateway port" "$GATEWAY_PORT")"
    INSTALL_DIR="$(prompt_with_default "Workspace directory" "$INSTALL_DIR")"
  fi

  require_port "UI port" "$UI_PORT"
  require_port "Gateway port" "$GATEWAY_PORT"
}

configure_config_mode() {
  DOMAIN="${DOMAIN:-example.com}"
  GATEWAY_PORT="${GATEWAY_PORT:-$DEFAULT_GATEWAY_PORT}"
  OUTPUT_DIR="${OUTPUT_DIR:-$DEFAULT_CONFIG_OUTPUT_DIR}"
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_VPS_INSTALL_DIR}"

  if [ "$INTERACTIVE" -eq 1 ]; then
    DOMAIN="$(prompt_with_default "Domain name for generated config" "$DOMAIN")"
    GATEWAY_PORT="$(prompt_with_default "OpenClaw gateway port" "$GATEWAY_PORT")"
    INSTALL_DIR="$(prompt_with_default "Frontend install directory in generated config" "$INSTALL_DIR")"
    OUTPUT_DIR="$(prompt_with_default "Output directory" "$OUTPUT_DIR")"
  fi

  require_port "Gateway port" "$GATEWAY_PORT"
}

run_local_mode() {
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_LOCAL_INSTALL_DIR}"
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  ensure_node_and_npm
  configure_local_mode
  maybe_install_openclaw_for_mode
  build_ui
  maybe_start_gateway

  trap 'cleanup_gateway; cleanup' EXIT INT TERM

  echo ""
  echo -e "${CYAN}Local preview is ready${NC}"
  echo -e "  ${GREEN}UI:${NC} http://${HOST}:${UI_PORT}"
  echo -e "  ${GREEN}Gateway:${NC} http://127.0.0.1:${GATEWAY_PORT}"
  echo ""

  open_url "http://${HOST}:${UI_PORT}"
  npm run preview -- --host "$HOST" --port "$UI_PORT"
}

run_vps_mode() {
  configure_vps_mode
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  ensure_node_and_npm
  maybe_install_openclaw_for_mode
  build_ui
  install_vps_packages
  configure_nginx_site
  configure_gateway_service

  if [ "${ENABLE_HTTPS:-1}" = "1" ]; then
    enable_https_with_certbot
  fi

  echo ""
  echo -e "${CYAN}VPS deployment complete${NC}"
  echo -e "  ${GREEN}Install dir:${NC} $WORKSPACE_DIR"
  echo -e "  ${GREEN}Domain:${NC} https://${DOMAIN}"
  echo -e "  ${GREEN}Gateway service:${NC} markos-openclaw-gateway.service"
  echo ""
}

run_docker_mode() {
  configure_docker_mode
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  command_exists docker || die "Docker is required for Docker mode."
  docker compose version > /dev/null 2>&1 || die "Docker Compose v2 is required for Docker mode."

  info "Building and starting the Docker stack..."
  MARKOS_UI_PORT="$UI_PORT" \
  OPENCLAW_UPSTREAM_HOST="$DOCKER_UPSTREAM_HOST" \
  OPENCLAW_UPSTREAM_PORT="$GATEWAY_PORT" \
    docker compose up -d --build

  echo ""
  echo -e "${CYAN}Docker deployment is ready${NC}"
  echo -e "  ${GREEN}UI:${NC} http://127.0.0.1:${UI_PORT}"
  echo -e "  ${GREEN}OpenClaw upstream:${NC} http://${DOCKER_UPSTREAM_HOST}:${GATEWAY_PORT}"
  echo ""
}

run_config_mode() {
  configure_config_mode
  prepare_source_dir
  WORKSPACE_DIR="$SOURCE_DIR"
  DIST_ROOT="$INSTALL_DIR/dist"
  mkdir -p "$OUTPUT_DIR/nginx" "$OUTPUT_DIR/systemd"

  render_template "$WORKSPACE_DIR/deploy/nginx/markos-ui.conf.template" "$OUTPUT_DIR/nginx/${SITE_NAME}.conf"
  render_template "$WORKSPACE_DIR/deploy/systemd/markos-openclaw-gateway.service.template" "$OUTPUT_DIR/systemd/markos-openclaw-gateway.service"

  echo ""
  echo -e "${CYAN}Generated deployment config${NC}"
  echo -e "  ${GREEN}Nginx:${NC} $OUTPUT_DIR/nginx/${SITE_NAME}.conf"
  echo -e "  ${GREEN}Systemd:${NC} $OUTPUT_DIR/systemd/markos-openclaw-gateway.service"
  echo ""
}

main() {
  parse_args "$@"
  print_banner

  if [ -z "$MODE" ]; then
    if [ "$INTERACTIVE" -eq 1 ]; then
      select_mode_interactive
    else
      MODE="local"
    fi
  fi

  case "$MODE" in
    local)
      run_local_mode
      ;;
    vps)
      run_vps_mode
      ;;
    docker)
      run_docker_mode
      ;;
    config)
      run_config_mode
      ;;
    *)
      die "Unsupported mode: $MODE"
      ;;
  esac
}

main "$@"
