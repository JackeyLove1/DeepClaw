# ================================================================
# Ensure-Dependencies.ps1
# Silently installs Node.js LTS, Python 3, ripgrep, and the
# Python Playwright Chromium environment if they are missing.
# Exit code: 0 = success, 1 = at least one install/check failed.
# ================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# winget returns this code when an exact package is already installed.
Set-Variable -Name WINGET_ALREADY_INSTALLED -Value (-1978335189) -Option Constant

$packages = @(
    [pscustomobject]@{
        DisplayName = 'Node.js LTS'
        PackageId   = 'OpenJS.NodeJS.LTS'
        Commands    = @('node')
    },
    [pscustomobject]@{
        DisplayName = 'Python 3'
        PackageId   = 'Python.Python.3'
        Commands    = @('python', 'py')
    },
    [pscustomobject]@{
        DisplayName = 'ripgrep'
        PackageId   = 'BurntSushi.ripgrep.MSVC'
        Commands    = @('rg')
    }
)

function Test-AnyCommand {
    param([string[]]$Names)

    foreach ($name in $Names) {
        if (Get-Command $name -ErrorAction SilentlyContinue) {
            return $true
        }
    }

    return $false
}

function Install-PackageSilently {
    param(
        [string]$PackageId,
        [string]$DisplayName
    )

    Write-Host "  Installing $DisplayName ..." -ForegroundColor Yellow

    $proc = Start-Process `
        -FilePath 'winget' `
        -ArgumentList @(
            'install',
            '--exact',
            '--id', $PackageId,
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
        Write-Host "  $DisplayName is ready." -ForegroundColor Green
        return $true
    }

    Write-Warning "  $DisplayName install failed. winget exit code: $code"
    return $false
}

function Get-PythonCommand {
    foreach ($name in @('python', 'py', 'python3')) {
        if (Get-Command $name -ErrorAction SilentlyContinue) {
            return $name
        }
    }

    return $null
}

function Test-PythonModule {
    param(
        [string]$PythonCommand,
        [string]$ModuleName
    )

    & $PythonCommand -c "import $ModuleName" *> $null
    return $LASTEXITCODE -eq 0
}

function Ensure-PythonPip {
    param([string]$PythonCommand)

    & $PythonCommand -m pip --version *> $null
    if ($LASTEXITCODE -eq 0) {
        return $true
    }

    Write-Host '  Python pip not found; enabling ensurepip ...' -ForegroundColor Yellow
    & $PythonCommand -m ensurepip --upgrade
    return $LASTEXITCODE -eq 0
}

function Test-PythonWithPip {
    param([string]$PythonCommand)

    & $PythonCommand --version *> $null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    & $PythonCommand -m pip --version *> $null
    return $LASTEXITCODE -eq 0
}

function Ensure-PlaywrightChromium {
    param([string]$PythonCommand)

    Write-Host "`n[Playwright Chromium]" -ForegroundColor Cyan

    if (-not (Ensure-PythonPip -PythonCommand $PythonCommand)) {
        Write-Warning '  Failed to enable pip for Python.'
        return $false
    }

    if (Test-PythonModule -PythonCommand $PythonCommand -ModuleName 'playwright') {
        Write-Host '  Python Playwright package exists.' -ForegroundColor DarkGray
    } else {
        Write-Host '  Installing Python Playwright package ...' -ForegroundColor Yellow
        & $PythonCommand -m pip install --user playwright
        if ($LASTEXITCODE -ne 0) {
            Write-Warning '  Failed to install Python Playwright package.'
            return $false
        }
    }

    Write-Host '  Installing Playwright Chromium browser ...' -ForegroundColor Yellow
    & $PythonCommand -m playwright install chromium
    if ($LASTEXITCODE -eq 0) {
        Write-Host '  Playwright Chromium is ready.' -ForegroundColor Green
        return $true
    }

    Write-Warning '  Failed to install Playwright Chromium browser.'
    return $false
}

if (-not (Get-Command 'winget' -ErrorAction SilentlyContinue)) {
    Write-Error 'winget was not found. Install App Installer and try again.'
    exit 1
}

$installFailed = $false

foreach ($pkg in $packages) {
    Write-Host "`n[$($pkg.DisplayName)]" -ForegroundColor Cyan

    if ($pkg.DisplayName -eq 'Python 3') {
        $pythonCommand = Get-PythonCommand
        if ($pythonCommand -and (Test-PythonWithPip -PythonCommand $pythonCommand)) {
            Write-Host '  Existing Python and pip found, skipping install.' -ForegroundColor DarkGray
            continue
        }
    }

    if (Test-AnyCommand -Names $pkg.Commands) {
        Write-Host '  Already exists, skipping install.' -ForegroundColor DarkGray
        continue
    }

    $ok = Install-PackageSilently -PackageId $pkg.PackageId -DisplayName $pkg.DisplayName
    if (-not $ok) {
        $installFailed = $true
    }
}

$pythonCommand = Get-PythonCommand
if ($pythonCommand) {
    $ok = Ensure-PlaywrightChromium -PythonCommand $pythonCommand
    if (-not $ok) {
        $installFailed = $true
    }
} else {
    Write-Warning '  Python command not found; skipping Playwright Chromium setup.'
    $installFailed = $true
}

Write-Host "`nDependency script finished." -ForegroundColor White

if ($installFailed) {
    Write-Host 'At least one dependency failed to install. Check warnings above.' -ForegroundColor Red
    exit 1
}

Write-Host 'If new software was installed, reopen PowerShell to refresh PATH.' -ForegroundColor DarkYellow
exit 0
