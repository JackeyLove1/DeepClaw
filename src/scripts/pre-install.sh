#!/usr/bin/env bash
# ================================================================
# ensure-dependencies.sh
# Silently installs Node.js LTS, Python 3, ripgrep, and the Python
# Playwright Chromium environment if they are missing.
# Exit code: 0 = success, 1 = at least one install/check failed.
# ================================================================

set -euo pipefail

CLR_CYAN='\033[0;36m'
CLR_YELLOW='\033[0;33m'
CLR_GREEN='\033[0;32m'
CLR_DARKGRAY='\033[0;90m'
CLR_RED='\033[0;31m'
CLR_RESET='\033[0m'

log_section() { echo -e "\n${CLR_CYAN}[$1]${CLR_RESET}"; }
log_skip() { echo -e "${CLR_DARKGRAY}  Already exists, skipping install.${CLR_RESET}"; }
log_info() { echo -e "${CLR_YELLOW}  $1${CLR_RESET}"; }
log_ok() { echo -e "${CLR_GREEN}  $1${CLR_RESET}"; }
log_err() { echo -e "${CLR_RED}  $1${CLR_RESET}" >&2; }

command_exists_any() {
    for cmd in "$@"; do
        command -v "$cmd" &>/dev/null && return 0
    done

    return 1
}

brew_install() {
    local formula="$1"
    local display_name="$2"

    log_info "Installing ${display_name} ..."

    if brew install --quiet "$formula" 2>&1; then
        log_ok "${display_name} is ready."
        return 0
    fi

    log_err "${display_name} install failed. Check Homebrew output."
    return 1
}

ensure_nodejs() {
    log_section "Node.js LTS"

    if command_exists_any node; then
        log_skip
        return 0
    fi

    if command_exists_any brew; then
        brew_install node "Node.js LTS"
        return $?
    fi

    if command -v apt-get &>/dev/null; then
        log_info "Installing Node.js LTS through NodeSource + apt ..."
        export DEBIAN_FRONTEND=noninteractive
        if curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -; then
            if sudo -E apt-get install -y -qq nodejs; then
                log_ok "Node.js LTS is ready."
                return 0
            fi
        fi

        log_err "Node.js LTS install failed. Check NodeSource / apt output."
        return 1
    fi

    log_err "brew or apt-get was not found; cannot install Node.js automatically."
    return 1
}

resolve_python() {
    for cmd in python3 python py; do
        if command -v "$cmd" &>/dev/null; then
            echo "$cmd"
            return 0
        fi
    done

    return 1
}

python_has_module() {
    local python_cmd="$1"
    local module_name="$2"

    "$python_cmd" -c "import ${module_name}" &>/dev/null
}

ensure_python_pip() {
    local python_cmd="$1"

    if "$python_cmd" -m pip --version &>/dev/null; then
        return 0
    fi

    log_info "Python pip not found; enabling ensurepip ..."
    "$python_cmd" -m ensurepip --upgrade
}

ensure_playwright_chromium() {
    local python_cmd="$1"

    log_section "Playwright Chromium"

    if ! ensure_python_pip "$python_cmd"; then
        log_err "Failed to enable pip for Python."
        return 1
    fi

    if python_has_module "$python_cmd" playwright; then
        log_skip
    else
        log_info "Installing Python Playwright package ..."
        "$python_cmd" -m pip install --user playwright || {
            log_err "Failed to install Python Playwright package."
            return 1
        }
    fi

    log_info "Installing Playwright Chromium browser ..."
    "$python_cmd" -m playwright install chromium || {
        log_err "Failed to install Playwright Chromium browser."
        return 1
    }

    log_ok "Playwright Chromium is ready."
}

install_failed=0
ensure_nodejs || install_failed=1

if ! command_exists_any brew; then
    if [[ "$install_failed" -eq 1 ]]; then
        exit 1
    fi

    log_err "Homebrew was not found. Install Homebrew from https://brew.sh and try again."
    exit 1
fi

declare -a PACKAGES=(
    "Python 3|python@3.12|python3 python py"
    "ripgrep|ripgrep|rg"
)

for entry in "${PACKAGES[@]}"; do
    IFS='|' read -r display_name formula commands_str <<< "$entry"
    log_section "$display_name"
    read -ra cmds <<< "$commands_str"

    if command_exists_any "${cmds[@]}"; then
        log_skip
        continue
    fi

    brew_install "$formula" "$display_name" || install_failed=1
done

if python_cmd="$(resolve_python)"; then
    ensure_playwright_chromium "$python_cmd" || install_failed=1
else
    log_err "Python command not found; skipping Playwright Chromium setup."
    install_failed=1
fi

echo -e "\nDependency script finished."

if [[ "$install_failed" -eq 1 ]]; then
    log_err "At least one dependency failed to install. Check errors above."
    exit 1
fi

echo -e "${CLR_YELLOW}If new software was installed, reopen the terminal to refresh PATH.${CLR_RESET}"
exit 0
