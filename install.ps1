# NY-CLI Windows Installation Script
# Universal installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗" -ForegroundColor Magenta
Write-Host "  ████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║" -ForegroundColor Magenta
Write-Host "  ██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║" -ForegroundColor Magenta
Write-Host "  ██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║" -ForegroundColor Magenta
Write-Host "  ██║ ╚████║   ██║         ╚██████╗███████╗██║" -ForegroundColor Magenta
Write-Host "  ╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "       ⟨ Your Gateway to Anime Streaming ⟩" -ForegroundColor Cyan
Write-Host "       ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "            nyanime.qzz.io" -ForegroundColor DarkGray
Write-Host ""

# 1. Check Node.js and npm
Write-Host "Checking Node.js & npm..." -ForegroundColor Cyan

$hasNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $hasNode) {
    Write-Host "Node.js is not installed. Attempting installation via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Error "Please install Node.js >= 20.18.0 from https://nodejs.org"
        exit 1
    }
}

try {
    $nodeVer = & node -e 'console.log(process.versions.node)'
    $parts = $nodeVer.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 18)) {
        Write-Error "Node.js >= 20.18.0 is required (found v$nodeVer). Please update Node.js."
        exit 1
    }
    Write-Host "✓ Node.js v$nodeVer" -ForegroundColor Green
} catch {
    Write-Error "Failed to verify Node.js version."
    exit 1
}

$hasNpm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $hasNpm) {
    Write-Error "npm is not available in PATH."
    exit 1
}
$npmVer = & npm -v
Write-Host "✓ npm v$npmVer" -ForegroundColor Green

# 2. Check & install mpv and ffmpeg via winget if available
Write-Host "`nChecking Media Tools (mpv & ffmpeg)..." -ForegroundColor Cyan

$hasMpv = Get-Command mpv -ErrorAction SilentlyContinue
if (-not $hasMpv -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Installing mpv via winget..." -ForegroundColor Cyan
    try {
        winget install -e --id mpv.mpv --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Host "✓ mpv installed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ mpv installation failed or skipped (you can install mpv manually from https://mpv.io)" -ForegroundColor Yellow
    }
} elseif ($hasMpv) {
    Write-Host "✓ mpv is already installed" -ForegroundColor Green
} else {
    Write-Host "⚠ mpv not detected (install via 'winget install mpv.mpv' for video playback)" -ForegroundColor Yellow
}

$hasFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $hasFfmpeg -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Installing ffmpeg via winget..." -ForegroundColor Cyan
    try {
        winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Host "✓ ffmpeg installed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ ffmpeg installation failed or skipped (you can install ffmpeg manually)" -ForegroundColor Yellow
    }
} elseif ($hasFfmpeg) {
    Write-Host "✓ ffmpeg is already installed" -ForegroundColor Green
} else {
    Write-Host "⚠ ffmpeg not detected (install via 'winget install Gyan.FFmpeg' for stream downloading)" -ForegroundColor Yellow
}

# 3. Install ny-cli via npm
$target = if ($args.Count -gt 0) { $args[0] } else { "latest" }
$pkgSpec = "@anjishnusengupta/ny-cli@$target"

if ($target -eq "latest" -and (Test-Path ".\package.json")) {
    $content = Get-Content ".\package.json" -Raw -ErrorAction SilentlyContinue
    if ($content -match '"@anjishnusengupta/ny-cli"') {
        $pkgSpec = "."
    }
}

Write-Host "`nInstalling ny-cli ($pkgSpec) via npm..." -ForegroundColor Cyan
& npm install -g "$pkgSpec"

if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install -g failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "✓ ny-cli package installed successfully" -ForegroundColor Green

# 4. Refresh environment PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$npmPrefix = & npm prefix -g
$npmBin = Join-Path $npmPrefix ""
if ($env:Path -notlike "*$npmBin*") {
    $env:Path = "$npmBin;$env:Path"
}

# 5. Run diagnostics
Write-Host "`nRunning diagnostics (ny-cli --doctor)..." -ForegroundColor Cyan
$nyCliCmd = Get-Command ny-cli -ErrorAction SilentlyContinue
if ($nyCliCmd) {
    & ny-cli --doctor
} else {
    $fallbackBin = Join-Path $npmPrefix "ny-cli.cmd"
    if (Test-Path $fallbackBin) {
        & $fallbackBin --doctor
    } else {
        Write-Host "⚠ ny-cli is installed at $npmPrefix. Please ensure your npm global directory is in PATH." -ForegroundColor Yellow
    }
}
