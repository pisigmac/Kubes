#!/usr/bin/env bash
# Kubes: One-Line Autonomous Workstation Web Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/pisigmac/Kubes/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/pisigmac/Kubes/main/scripts/install.sh | bash -s -- --docker

set -euo pipefail

main() {
  local DEFAULT_REPO_URL="https://github.com/pisigmac/Kubes.git"
  local DEFAULT_BRANCH="main"
  local TARGET_DIR="${KUBES_DIR:-${HOME}/.kubes}"
  local DOCKER_MODE=false
  local SKIP_PROMPT=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --docker)
        DOCKER_MODE=true
        shift
        ;;
      -y|--yes)
        SKIP_PROMPT=true
        shift
        ;;
      --dir)
        TARGET_DIR="$2"
        shift 2
        ;;
      --branch)
        DEFAULT_BRANCH="$2"
        shift 2
        ;;
      -h|--help)
        echo "Kubes One-Line Installer"
        echo "Usage: curl -fsSL ... | bash -s -- [options]"
        echo "Options:"
        echo "  --docker       Install and launch in Docker appliance mode"
        echo "  --dir <path>   Target install directory (default: ~/.kubes)"
        echo "  --branch <b-name> Git branch to checkout (default: main)"
        echo "  -y, --yes      Non-interactive mode (auto-accept defaults)"
        exit 0
        ;;
      *)
        shift
        ;;
    esac
  done

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🪐 Kubes: Autonomous Agentic Workstation Installer"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. System & Architecture Detection
  local OS
  OS="$(uname -s)"
  local ARCH
  ARCH="$(uname -m)"

  echo "▶ [1/6] System Architecture: ${OS} (${ARCH})"
  if [[ "${OS}" != "Linux" && "${OS}" != "Darwin" ]]; then
    echo "❌ Error: Kubes currently supports Linux and macOS (Darwin)."
    exit 1
  fi

  # 2. Check Git & Curl
  echo "▶ [2/6] Verifying base utilities (git, curl)..."
  if ! command -v git >/dev/null 2>&1; then
    echo "❌ Git is required to install Kubes. Please install git (e.g. sudo apt install git)."
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "❌ Curl is required. Please install curl."
    exit 1
  fi

  # 3. Docker Mode vs Local Mode Toolchain Verification
  if [[ "${DOCKER_MODE}" == "true" ]]; then
    echo "▶ [3/6] Verifying Docker environment for Appliance Mode..."
    if ! command -v docker >/dev/null 2>&1; then
      echo "⚠️ Docker is not installed. Falling back to local native installation..."
      DOCKER_MODE=false
    elif ! docker info >/dev/null 2>&1; then
      echo "⚠️ Docker daemon is not running or current user lacks docker group permissions."
      echo "🔄 Falling back to local native installation..."
      DOCKER_MODE=false
    else
      echo "  🟢 Docker engine & compose verified."
    fi
  fi

  if [[ "${DOCKER_MODE}" == "false" ]]; then
    echo "▶ [3/6] Verifying local development toolchains..."

    # Node.js check (v22 required)
    if command -v node >/dev/null 2>&1; then
      local NODE_VER
      NODE_VER="$(node -v | sed 's/v//')"
      local NODE_MAJOR
      NODE_MAJOR="$(echo "${NODE_VER}" | cut -d. -f1)"
      if [[ "${NODE_MAJOR}" -lt 22 ]]; then
        echo "⚠️ Node.js v22+ is required (found v${NODE_VER})."
        echo "  Please install Node.js 22: https://nodejs.org/"
      else
        echo "  🟢 Node.js: v${NODE_VER}"
      fi
    else
      echo "⚠️ Node.js (v22+) not found. Please install Node.js 22."
    fi

    # pnpm check
    if command -v pnpm >/dev/null 2>&1; then
      echo "  🟢 pnpm: $(pnpm -v)"
    else
      echo "ℹ pnpm not found. Installing pnpm in user environment..."
      curl -fsSL https://get.pnpm.io/install.sh | sh - || true
      export PNPM_HOME="${HOME}/.local/share/pnpm"
      export PATH="${PNPM_HOME}:${PATH}"
    fi

    # Python uv check
    if command -v uv >/dev/null 2>&1; then
      echo "  🟢 uv: $(uv --version)"
    else
      echo "ℹ uv not found. Installing Astral uv in user environment..."
      curl -LsSf https://astral.sh/uv/install.sh | sh || true
      export PATH="${HOME}/.local/bin:${PATH}"
    fi

    # Bubblewrap check (Linux)
    if [[ "${OS}" == "Linux" ]]; then
      if command -v bwrap >/dev/null 2>&1; then
        echo "  🟢 Bubblewrap (bwrap sandbox): installed"
      else
        echo "  ℹ Bubblewrap not detected. Recommended for isolated Bash sandbox execution: 'sudo apt install bubblewrap'"
      fi
    fi
  fi

  # 4. Workspace Provisioning (Clone or Update)
  echo "▶ [4/6] Provisioning Kubes workspace at ${TARGET_DIR}..."
  mkdir -p "$(dirname "${TARGET_DIR}")"
  if [[ -d "${TARGET_DIR}/.git" ]]; then
    echo "  ℹ Existing repository found. Updating ${DEFAULT_BRANCH} branch..."
    git -C "${TARGET_DIR}" fetch origin "${DEFAULT_BRANCH}" || true
    git -C "${TARGET_DIR}" checkout "${DEFAULT_BRANCH}" || true
  else
    echo "  Cloning ${DEFAULT_REPO_URL} (${DEFAULT_BRANCH})..."
    git clone --branch "${DEFAULT_BRANCH}" "${DEFAULT_REPO_URL}" "${TARGET_DIR}"
  fi

  # 5. Dependency Installation & Database Seeding
  echo "▶ [5/6] Setting up environment and database..."
  cd "${TARGET_DIR}"

  # Set up .env.local if not present
  if [[ ! -f "${TARGET_DIR}/.env.local" && -f "${TARGET_DIR}/.env.example" ]]; then
    cp "${TARGET_DIR}/.env.example" "${TARGET_DIR}/.env.local"
    echo "  ✓ Generated .env.local from template"
  fi

  if [[ "${DOCKER_MODE}" == "false" ]]; then
    if command -v pnpm >/dev/null 2>&1; then
      echo "  📦 Installing Node dependencies..."
      pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    fi
    if command -v uv >/dev/null 2>&1 && [[ -d "${TARGET_DIR}/services/agent-core" ]]; then
      echo "  🐍 Syncing Python Agent Core dependencies..."
      (cd "${TARGET_DIR}/services/agent-core" && uv sync) || true
    fi
  fi

  # Seed database if not yet populated
  if [[ ! -f "${TARGET_DIR}/data/cubes.db" ]]; then
    echo "  🗄 Initializing local database with default specialist Cubes..."
    bash "${TARGET_DIR}/scripts/seed_data.sh" >/dev/null 2>&1 || true
  fi

  # 6. Global CLI Linking
  echo "▶ [6/6] Registering global 'kubes' command..."
  mkdir -p "${HOME}/.local/bin"
  chmod +x "${TARGET_DIR}/kubes"
  ln -sf "${TARGET_DIR}/kubes" "${HOME}/.local/bin/kubes"

  # PATH guidance
  local SHELL_RC=""
  if [[ -n "${ZSH_VERSION:-}" || "${SHELL:-}" == *"zsh"* ]]; then
    SHELL_RC="${HOME}/.zshrc"
  else
    SHELL_RC="${HOME}/.bashrc"
  fi

  if [[ ":${PATH}:" != *":${HOME}/.local/bin:"* ]]; then
    if [[ -f "${SHELL_RC}" ]] && ! grep -q '.local/bin' "${SHELL_RC}" 2>/dev/null; then
      echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${SHELL_RC}"
    fi
    export PATH="${HOME}/.local/bin:${PATH}"
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎉 Installation Complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Workspace: ${TARGET_DIR}"
  echo "Global CLI: ~/.local/bin/kubes"
  echo ""
  echo "To launch your Kubes workstation:"
  if [[ "${DOCKER_MODE}" == "true" ]]; then
    echo "  kubes start --docker"
  else
    echo "  kubes start"
  fi
  echo ""
  echo "To check system diagnostics & toolchains:"
  echo "  kubes doctor"
  echo ""
  echo "To inspect status & running ports:"
  echo "  kubes status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
