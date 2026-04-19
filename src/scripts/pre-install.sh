#!/usr/bin/env bash
# ================================================================
# ensure-dependencies.sh
# 静默安装 Node.js LTS、Python 3 和 ripgrep（如未检测到）
# 退出码：0 = 全部就绪，1 = 至少一项安装失败
# 用法：bash ensure-dependencies.sh
# ================================================================

set -euo pipefail

# ── 颜色输出 ──────────────────────────────────────────────────────
CLR_CYAN='\033[0;36m'
CLR_YELLOW='\033[0;33m'
CLR_GREEN='\033[0;32m'
CLR_DARKGRAY='\033[0;90m'
CLR_RED='\033[0;31m'
CLR_RESET='\033[0m'

log_section() { echo -e "\n${CLR_CYAN}[$1]${CLR_RESET}"; }
log_skip()    { echo -e "${CLR_DARKGRAY}  已存在，跳过安装。${CLR_RESET}"; }
log_info()    { echo -e "${CLR_YELLOW}  → $1${CLR_RESET}"; }
log_ok()      { echo -e "${CLR_GREEN}  ✓ $1${CLR_RESET}"; }
log_err()     { echo -e "${CLR_RED}  ✗ $1${CLR_RESET}" >&2; }

# ── 辅助函数 ──────────────────────────────────────────────────────

# 检测任意一个命令是否存在（接受多个命令名）
command_exists_any() {
    for cmd in "$@"; do
        command -v "$cmd" &>/dev/null && return 0
    done
    return 1
}

# 通过 Homebrew 静默安装，返回 0（成功）或 1（失败）
brew_install() {
    local formula="$1"
    local display_name="$2"

    log_info "正在安装 ${display_name} ..."

    # brew install 在包已安装时同样返回 0，无需处理特殊退出码
    if brew install --quiet "$formula" 2>&1; then
        log_ok "${display_name} 安装成功。"
        return 0
    else
        log_err "${display_name} 安装失败，请检查 Homebrew 输出。"
        return 1
    fi
}

# 确保已安装 Node.js（LTS）：优先 Homebrew，否则 Debian/Ubuntu 使用 NodeSource + apt
ensure_nodejs() {
    log_section "Node.js LTS"

    if command_exists_any node; then
        log_skip
        return 0
    fi

    if command_exists_any brew; then
        brew_install node "Node.js LTS" || return 1
        return 0
    fi

    if command -v apt-get &>/dev/null; then
        log_info "正在通过 NodeSource 配置并静默安装 Node.js LTS ..."
        export DEBIAN_FRONTEND=noninteractive
        if curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -; then
            if sudo -E apt-get install -y -qq nodejs; then
                log_ok "Node.js LTS 安装成功。"
                return 0
            fi
        fi
        log_err "Node.js LTS 安装失败，请检查 NodeSource / apt 输出。"
        return 1
    fi

    log_err "未检测到 brew 或 apt-get，无法自动安装 Node.js。"
    return 1
}

# ── Node.js（可在无 Homebrew 的 Debian/Ubuntu 上通过 apt 安装）────────
install_failed=0
ensure_nodejs || install_failed=1

# ── 前置检查：Homebrew ────────────────────────────────────────────
if ! command_exists_any brew; then
    if [[ "$install_failed" -eq 1 ]]; then
        exit 1
    fi
    echo -e "${CLR_RED}未检测到 Homebrew，请先访问 https://brew.sh 安装后重试。${CLR_RESET}" >&2
    exit 1
fi

# ── 软件包定义（name|formula|检测命令...） ────────────────────────
declare -a PACKAGES=(
    "Python 3|python@3.12|python3 python py"
    "ripgrep|ripgrep|rg"
)

# ── 主流程 ────────────────────────────────────────────────────────
for entry in "${PACKAGES[@]}"; do
    IFS='|' read -r display_name formula commands_str <<< "$entry"
    log_section "$display_name"

    # 将空格分隔的命令字符串转为数组
    read -ra cmds <<< "$commands_str"

    if command_exists_any "${cmds[@]}"; then
        log_skip
        continue
    fi

    brew_install "$formula" "$display_name" || install_failed=1
done

# ── 收尾提示 ──────────────────────────────────────────────────────
echo -e "\n脚本运行结束。"

if [[ "$install_failed" -eq 1 ]]; then
    log_err "部分软件安装失败，请检查上方错误信息。"
    exit 1
fi

echo -e "${CLR_YELLOW}⚠️  如有新软件被安装，请重新打开终端窗口以刷新 PATH。${CLR_RESET}"
exit 0