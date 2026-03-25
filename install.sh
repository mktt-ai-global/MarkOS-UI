#!/bin/bash

set -Eeuo pipefail

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
GATEWAY_PID=""
CURRENT_STEP="initialization"
STEP_INDEX=0
STEP_TOTAL=0

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

trap 'cleanup_gateway; cleanup' EXIT

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

set_step_total() {
  STEP_TOTAL="$1"
  STEP_INDEX=0
}

step() {
  STEP_INDEX=$((STEP_INDEX + 1))
  CURRENT_STEP="$1"
  echo ""
  echo -e "${CYAN}Step ${STEP_INDEX}/${STEP_TOTAL}${NC} ${CURRENT_STEP}"
}

show_failure_hints() {
  echo ""
  echo -e "${YELLOW}Troubleshooting hints${NC}"

  case "$MODE" in
    local)
      echo "  - Verify Node.js 22+ with: node -v"
      echo "  - Check whether the UI port is already in use: lsof -nP -iTCP:${UI_PORT} -sTCP:LISTEN"
      echo "  - Re-run the preview manually from the workspace: npm run preview -- --host ${HOST} --port ${UI_PORT}"
      if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
        echo "  - Check OpenClaw health with: openclaw status"
      fi
      ;;
    vps)
      echo "  - Check Nginx status: sudo systemctl status nginx --no-pager"
      echo "  - Check gateway service: sudo systemctl status markos-openclaw-gateway.service --no-pager"
      echo "  - Inspect gateway logs: sudo journalctl -u markos-openclaw-gateway.service -n 100 --no-pager"
      if [ "${ENABLE_HTTPS:-1}" = "1" ]; then
        echo "  - Confirm DNS for ${DOMAIN} points to this server before retrying cert issuance."
        echo "  - Re-test renewal later with: sudo certbot renew --dry-run"
      fi
      ;;
    docker)
      echo "  - Inspect the stack: docker compose ps"
      echo "  - Tail container logs: docker compose logs -f"
      echo "  - Stop the stack if needed: docker compose down"
      ;;
    config)
      echo "  - Verify the output directory is writable: ${OUTPUT_DIR}"
      echo "  - Re-run config generation with: ./install.sh --mode config --domain ${DOMAIN} --gateway-port ${GATEWAY_PORT}"
      ;;
  esac
}

on_error() {
  local exit_code="$?"

  if [ "$exit_code" -eq 130 ]; then
    echo ""
    warn "Installation interrupted by user."
    exit 130
  fi

  echo ""
  echo -e "${RED}Deployment stopped during:${NC} ${CURRENT_STEP}" >&2
  if [ -n "${WORKSPACE_DIR:-}" ]; then
    echo -e "${RED}Workspace:${NC} ${WORKSPACE_DIR}" >&2
  fi
  show_failure_hints >&2

  exit "$exit_code"
}

trap on_error ERR

mode_title() {
  case "$1" in
    local) printf '%s' 'Local Preview' ;;
    vps) printf '%s' 'VPS Production' ;;
    docker) printf '%s' 'Docker Deploy' ;;
    config) printf '%s' 'Config Only' ;;
    *) printf '%s' "$1" ;;
  esac
}

mode_description() {
  case "$1" in
    local) printf '%s' 'Build locally and run a preview server with optional OpenClaw bootstrap.' ;;
    vps) printf '%s' 'Deploy to a server with Nginx, systemd, HTTPS, and auto-renew certificates.' ;;
    docker) printf '%s' 'Build and run a containerized frontend that proxies to an existing OpenClaw gateway.' ;;
    config) printf '%s' 'Generate Nginx and systemd files only without modifying the host machine.' ;;
    *) printf '%s' '' ;;
  esac
}

source_hint() {
  local project_root
  project_root="$(find_project_root || true)"
  if [ -n "$project_root" ]; then
    printf '%s' "local project ($project_root)"
  else
    printf '%s' "GitHub archive (${REPO_SLUG}@${REPO_REF})"
  fi
}

preview_workspace_dir() {
  local default_install_dir="$1"
  local project_root

  if [ -n "${INSTALL_DIR:-}" ]; then
    printf '%s' "$INSTALL_DIR"
    return
  fi

  project_root="$(find_project_root || true)"
  if [ -n "$project_root" ] && { [ "$project_root" = "$CURRENT_DIR" ] || [ "$project_root" = "$SCRIPT_DIR" ]; }; then
    printf '%s' "$project_root"
  else
    printf '%s' "$default_install_dir"
  fi
}

get_listening_process() {
  local port="$1"

  if command_exists lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2> /dev/null | awk 'NR==2 {print $1 " (pid " $2 ")"}'
    return
  fi

  if command_exists ss; then
    ss -ltnp "( sport = :$port )" 2> /dev/null | awk 'NR==2 {print $NF}'
    return
  fi
}

warn_if_port_busy() {
  local label="$1"
  local port="$2"
  local process_info

  process_info="$(get_listening_process "$port" || true)"
  if [ -n "$process_info" ]; then
    warn "$label port $port is already in use by $process_info"
  fi
}

lookup_public_ip() {
  if command_exists curl; then
    curl -fsS --max-time 3 https://api.ipify.org 2> /dev/null || true
  fi
}

lookup_domain_ip() {
  if command_exists getent; then
    getent ahostsv4 "$DOMAIN" 2> /dev/null | awk 'NR==1 {print $1}'
    return
  fi

  if command_exists dig; then
    dig +short A "$DOMAIN" 2> /dev/null | awk 'NR==1 {print $1}'
    return
  fi

  if command_exists host; then
    host "$DOMAIN" 2> /dev/null | awk '/has address/ {print $NF; exit}'
  fi
}

warn_about_dns_mismatch() {
  local domain_ip public_ip

  [ "$MODE" = "vps" ] || return
  [ -n "$DOMAIN" ] || return

  domain_ip="$(lookup_domain_ip || true)"
  public_ip="$(lookup_public_ip || true)"

  if [ -z "$domain_ip" ]; then
    warn "Could not resolve $DOMAIN yet. Let's Encrypt issuance may fail until DNS is live."
    return
  fi

  if [ -n "$public_ip" ] && [ "$domain_ip" != "$public_ip" ]; then
    warn "$DOMAIN currently resolves to $domain_ip while this server appears to use $public_ip. Update DNS before running HTTPS issuance."
  fi
}

warn_about_environment() {
  case "$MODE" in
    local)
      warn_if_port_busy "UI" "$UI_PORT"
      warn_if_port_busy "Gateway" "$GATEWAY_PORT"
      ;;
    vps)
      warn_if_port_busy "HTTP" "$HTTP_PORT"
      warn_if_port_busy "HTTPS" "$HTTPS_PORT"
      warn_if_port_busy "Gateway" "$GATEWAY_PORT"
      warn_about_dns_mismatch
      ;;
    docker)
      warn_if_port_busy "Docker UI" "$UI_PORT"
      ;;
    config)
      :
      ;;
  esac
}

show_execution_summary() {
  local default_install_dir="$1"
  local planned_workspace
  local planned_source

  planned_workspace="$(preview_workspace_dir "$default_install_dir")"
  planned_source="$(source_hint)"

  echo -e "${CYAN}Deployment plan${NC}"
  echo -e "  ${GREEN}Mode:${NC} $(mode_title "$MODE")"
  echo -e "  ${GREEN}Summary:${NC} $(mode_description "$MODE")"
  echo -e "  ${GREEN}Source:${NC} $planned_source"
  echo -e "  ${GREEN}Workspace:${NC} $planned_workspace"

  case "$MODE" in
    local)
      echo -e "  ${GREEN}Bind host:${NC} $HOST"
      echo -e "  ${GREEN}UI port:${NC} $UI_PORT"
      echo -e "  ${GREEN}Gateway port:${NC} $GATEWAY_PORT"
      echo -e "  ${GREEN}Open browser:${NC} $(bool_label "${OPEN_BROWSER:-0}")"
      echo -e "  ${GREEN}OpenClaw bootstrap:${NC} $(bool_label "${INSTALL_OPENCLAW:-0}")"
      ;;
    vps)
      echo -e "  ${GREEN}Domain:${NC} $DOMAIN"
      echo -e "  ${GREEN}Gateway port:${NC} $GATEWAY_PORT"
      echo -e "  ${GREEN}HTTP/HTTPS:${NC} ${HTTP_PORT}/${HTTPS_PORT}"
      echo -e "  ${GREEN}HTTPS auto-renew:${NC} $(bool_label "${ENABLE_HTTPS:-1}")"
      if [ -n "$EMAIL" ]; then
        echo -e "  ${GREEN}Renewal email:${NC} $EMAIL"
      fi
      echo -e "  ${GREEN}System changes:${NC} nginx + certbot + systemd"
      ;;
    docker)
      echo -e "  ${GREEN}UI port:${NC} $UI_PORT"
      echo -e "  ${GREEN}OpenClaw upstream:${NC} ${DOCKER_UPSTREAM_HOST}:${GATEWAY_PORT}"
      ;;
    config)
      echo -e "  ${GREEN}Domain:${NC} $DOMAIN"
      echo -e "  ${GREEN}Gateway port:${NC} $GATEWAY_PORT"
      echo -e "  ${GREEN}Config output:${NC} $OUTPUT_DIR"
      ;;
  esac

  echo ""
}

confirm_execution() {
  if [ "$INTERACTIVE" -eq 1 ]; then
    prompt_yes_no "Continue with this plan?" "y" || die "Installation cancelled."
  fi
}

bool_label() {
  case "${1:-0}" in
    1|y|Y|yes|YES|true|TRUE) printf '%s' 'enabled' ;;
    *) printf '%s' 'disabled' ;;
  esac
}

select_mode_interactive() {
  local choice=""

  echo "Choose an install mode:"
  echo "  1. Local Preview    - $(mode_description local)"
  echo "  2. VPS Production   - $(mode_description vps)"
  echo "  3. Docker Deploy    - $(mode_description docker)"
  echo "  4. Config Only      - $(mode_description config)"
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
}

install_requested_openclaw() {
  if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
    ensure_openclaw
    ensure_openclaw_config
  fi
}

require_openclaw_binary() {
  command_exists openclaw || die "OpenClaw CLI is required for this mode. Install it first or rerun without --no-openclaw."
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

show_next_steps() {
  echo -e "${CYAN}Next steps${NC}"

  case "$MODE" in
    local)
      echo "  - Keep this terminal open while the preview server is running."
      echo "  - Re-open the UI at: http://${HOST}:${UI_PORT}"
      if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
        echo "  - Verify gateway status with: openclaw status"
      fi
      ;;
    vps)
      echo "  - Verify Nginx: sudo systemctl status nginx --no-pager"
      echo "  - Verify gateway: sudo systemctl status markos-openclaw-gateway.service --no-pager"
      echo "  - Review gateway logs: sudo journalctl -u markos-openclaw-gateway.service -n 100 --no-pager"
      if [ "${ENABLE_HTTPS:-1}" = "1" ]; then
        echo "  - Test certificate renewal: sudo certbot renew --dry-run"
      fi
      ;;
    docker)
      echo "  - Inspect containers: docker compose ps"
      echo "  - Tail logs: docker compose logs -f"
      echo "  - Stop the stack: docker compose down"
      ;;
    config)
      echo "  - Review the generated files before copying them into /etc."
      echo "  - Nginx file: ${OUTPUT_DIR}/nginx/${SITE_NAME}.conf"
      echo "  - Systemd file: ${OUTPUT_DIR}/systemd/markos-openclaw-gateway.service"
      ;;
  esac

  echo ""
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
  configure_local_mode
  maybe_install_openclaw_for_mode
  show_execution_summary "$INSTALL_DIR"
  warn_about_environment
  confirm_execution
  set_step_total $((4 + (${INSTALL_OPENCLAW:-0} == 1 ? 2 : 0)))
  step "Preparing workspace"
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  step "Verifying Node.js and npm"
  ensure_node_and_npm
  if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
    step "Installing or verifying OpenClaw"
  fi
  install_requested_openclaw
  step "Building the frontend bundle"
  build_ui
  if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
    step "Ensuring the OpenClaw gateway is reachable"
  fi
  maybe_start_gateway
  step "Starting the local preview server"

  echo ""
  echo -e "${CYAN}Local preview is ready${NC}"
  echo -e "  ${GREEN}UI:${NC} http://${HOST}:${UI_PORT}"
  echo -e "  ${GREEN}Gateway:${NC} http://127.0.0.1:${GATEWAY_PORT}"
  echo ""

  show_next_steps
  open_url "http://${HOST}:${UI_PORT}"
  npm run preview -- --host "$HOST" --port "$UI_PORT"
}

run_vps_mode() {
  configure_vps_mode
  maybe_install_openclaw_for_mode
  show_execution_summary "$INSTALL_DIR"
  warn_about_environment
  confirm_execution
  set_step_total $((6 + (${INSTALL_OPENCLAW:-0} == 1 ? 1 : 0) + (${ENABLE_HTTPS:-1} == 1 ? 1 : 0)))
  step "Preparing deployment workspace"
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  step "Verifying Node.js and npm"
  ensure_node_and_npm
  if [ "${INSTALL_OPENCLAW:-0}" = "1" ]; then
    step "Installing or verifying OpenClaw"
  fi
  install_requested_openclaw
  require_openclaw_binary
  step "Building the frontend bundle"
  build_ui
  step "Installing Nginx and certbot"
  install_vps_packages
  step "Configuring Nginx"
  configure_nginx_site
  step "Installing the OpenClaw gateway service"
  configure_gateway_service

  if [ "${ENABLE_HTTPS:-1}" = "1" ]; then
    step "Issuing HTTPS certificates and enabling auto-renew"
    enable_https_with_certbot
  fi

  echo ""
  echo -e "${CYAN}VPS deployment complete${NC}"
  echo -e "  ${GREEN}Install dir:${NC} $WORKSPACE_DIR"
  echo -e "  ${GREEN}Domain:${NC} https://${DOMAIN}"
  echo -e "  ${GREEN}Gateway service:${NC} markos-openclaw-gateway.service"
  echo ""

  show_next_steps
}

run_docker_mode() {
  configure_docker_mode
  show_execution_summary "$INSTALL_DIR"
  warn_about_environment
  confirm_execution
  set_step_total 3
  step "Preparing workspace"
  prepare_workspace "$INSTALL_DIR"
  DIST_ROOT="$WORKSPACE_DIR/dist"
  step "Verifying Docker and Docker Compose"
  command_exists docker || die "Docker is required for Docker mode."
  docker compose version > /dev/null 2>&1 || die "Docker Compose v2 is required for Docker mode."

  step "Building and starting the Docker stack"
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

  show_next_steps
}

run_config_mode() {
  configure_config_mode
  show_execution_summary "$INSTALL_DIR"
  confirm_execution
  set_step_total 2
  step "Loading source templates"
  prepare_source_dir
  WORKSPACE_DIR="$SOURCE_DIR"
  DIST_ROOT="$INSTALL_DIR/dist"
  step "Rendering deployment files"
  mkdir -p "$OUTPUT_DIR/nginx" "$OUTPUT_DIR/systemd"

  render_template "$WORKSPACE_DIR/deploy/nginx/markos-ui.conf.template" "$OUTPUT_DIR/nginx/${SITE_NAME}.conf"
  render_template "$WORKSPACE_DIR/deploy/systemd/markos-openclaw-gateway.service.template" "$OUTPUT_DIR/systemd/markos-openclaw-gateway.service"

  echo ""
  echo -e "${CYAN}Generated deployment config${NC}"
  echo -e "  ${GREEN}Nginx:${NC} $OUTPUT_DIR/nginx/${SITE_NAME}.conf"
  echo -e "  ${GREEN}Systemd:${NC} $OUTPUT_DIR/systemd/markos-openclaw-gateway.service"
  echo ""

  show_next_steps
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
