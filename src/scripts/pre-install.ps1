# ================================================================
# Ensure-Dependencies.ps1
# 静默安装 Node.js LTS、Python 3.12 和 ripgrep（如未检测到）
# 退出码：0 = 全部就绪，1 = 至少一项安装失败
# ================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── 常量 ──────────────────────────────────────────────────────────
# winget 约定：0x8A150011 = 该包已安装，视为成功
Set-Variable -Name WINGET_ALREADY_INSTALLED -Value (-1978335189) -Option Constant

$packages = @(
    [pscustomobject]@{
        DisplayName = 'Node.js LTS'
        PackageId   = 'OpenJS.NodeJS.LTS'
        Commands    = @('node')
    },
    [pscustomobject]@{
        DisplayName = 'Python 3.12'
        PackageId   = 'Python.Python.3.12'
        Commands    = @('python', 'py')
    },
    [pscustomobject]@{
        DisplayName = 'ripgrep'
        PackageId   = 'BurntSushi.ripgrep.MSVC'
        Commands    = @('rg')
    }
)

# ── 辅助函数 ──────────────────────────────────────────────────────
function Test-AnyCommand {
    param([string[]]$Names)
    foreach ($name in $Names) {
        if (Get-Command $name -ErrorAction SilentlyContinue) { return $true }
    }
    return $false
}

function Install-PackageSilently {
    param(
        [string]$PackageId,
        [string]$DisplayName
    )

    Write-Host "  → 正在安装 $DisplayName ..." -ForegroundColor Yellow

    $proc = Start-Process `
        -FilePath   'winget' `
        -ArgumentList @(
            'install',
            '--exact',
            '--id',                   $PackageId,
            '--silent',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--disable-interactivity'
        ) `
        -NoNewWindow `
        -Wait `
        -PassThru

    $code = $proc.ExitCode

    if ($code -eq 0 -or $code -eq $WINGET_ALREADY_INSTALLED) {
        Write-Host "  ✓ $DisplayName 安装成功。" -ForegroundColor Green
        return $true
    }

    Write-Warning "  ✗ $DisplayName 安装失败（winget 退出码：$code）"
    return $false
}

# ── 前置检查 ──────────────────────────────────────────────────────
if (-not (Get-Command 'winget' -ErrorAction SilentlyContinue)) {
    Write-Error '未检测到 winget，请先安装 App Installer 后重试。'
    exit 1
}

# ── 主流程 ────────────────────────────────────────────────────────
$installFailed = $false

foreach ($pkg in $packages) {
    Write-Host "`n[$($pkg.DisplayName)]" -ForegroundColor Cyan

    if (Test-AnyCommand -Names $pkg.Commands) {
        Write-Host '  已存在，跳过安装。' -ForegroundColor DarkGray
        continue
    }

    $ok = Install-PackageSilently -PackageId $pkg.PackageId -DisplayName $pkg.DisplayName
    if (-not $ok) { $installFailed = $true }
}

# ── 收尾提示 ──────────────────────────────────────────────────────
Write-Host "`n脚本运行结束。" -ForegroundColor White

if ($installFailed) {
    Write-Host '⚠️  部分软件安装失败，请检查上方警告信息。' -ForegroundColor Red
    exit 1
}

Write-Host '⚠️  如有新软件被安装，请重新打开 PowerShell 窗口以刷新 PATH。' -ForegroundColor DarkYellow
exit 0