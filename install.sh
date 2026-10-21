#!/bin/sh
# NY-CLI Installation Script
# Universal installer for Linux and macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh

set -e

# ═══════════════════════════════════════════════════════════════════════════════
# COLORS & BANNER
# ═══════════════════════════════════════════════════════════════════════════════
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
RESET='\033[0m'

printf "\n"
printf "${MAGENTA}"
printf "  ███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗\n"
printf "  ████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║\n"
printf "  ██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║\n"
printf "  ██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║\n"
printf "  ██║ ╚████║   ██║         ╚██████╗███████╗██║\n"
printf "  ╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝\n"
printf "${RESET}\n"
printf "${DIM}${CYAN}       ⟨ Your Gateway to Anime Streaming ⟩${RESET}\n"
printf "${DIM}       ─────────────────────────────────────${RESET}\n"
printf "${DIM}            nyanime.qzz.io${RESET}\n"
printf "\n"

TARGET="${1:-latest}"

# Determine npm package specifier
if [ "$TARGET" = "latest" ] && [ -f "./package.json" ] && grep -q '"@anjishnusengupta/ny-cli"' ./package.json 2>/dev/null; then
    PKG_SPEC="."
else
    case "$TARGET" in
        */*|*.tgz|*.tar.gz)
            PKG_SPEC="$TARGET"
            ;;
        @anjishnusengupta/ny-cli*)
            PKG_SPEC="$TARGET"
            ;;
        v*)
            PKG_SPEC="@anjishnusengupta/ny-cli@${TARGET#v}"
            ;;
        latest)
            PKG_SPEC="@anjishnusengupta/ny-cli@latest"
            ;;
        *)
            PKG_SPEC="@anjishnusengupta/ny-cli@$TARGET"
            ;;
    esac
fi

# ═══════════════════════════════════════════════════════════════════════════════
# ELEVATION HELPER
# ═══════════════════════════════════════════════════════════════════════════════
run_elevated() {
    if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# DETECT OS AND PACKAGE MANAGER
# ═══════════════════════════════════════════════════════════════════════════════
OS="unknown"
PKG_MANAGER="unknown"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
        arch|manjaro|endeavouros|garuda)
            OS="arch"
            PKG_MANAGER="pacman"
            ;;
        fedora|rhel|centos|rocky|alma)
            OS="fedora"
            PKG_MANAGER="dnf"
            ;;
        debian|ubuntu|linuxmint|pop|elementary|zorin)
            OS="debian"
            PKG_MANAGER="apt"
            ;;
        opensuse*|suse*)
            OS="suse"
            PKG_MANAGER="zypper"
            ;;
        alpine)
            OS="alpine"
            PKG_MANAGER="apk"
            ;;
        *)
            case "$ID_LIKE" in
                *arch*) OS="arch"; PKG_MANAGER="pacman" ;;
                *fedora*|*rhel*) OS="fedora"; PKG_MANAGER="dnf" ;;
                *debian*|*ubuntu*) OS="debian"; PKG_MANAGER="apt" ;;
            esac
            ;;
    esac
elif [ "$(uname)" = "Darwin" ]; then
    OS="macos"
    PKG_MANAGER="brew"
fi

printf "${DIM}Detected OS: ${OS} (${PKG_MANAGER})${RESET}\n"

# ═══════════════════════════════════════════════════════════════════════════════
# PREREQUISITES: Node >= 20.18.0 and npm
# ═══════════════════════════════════════════════════════════════════════════════
printf "${CYAN}Checking Node.js & npm...${RESET}\n"

if ! command -v node >/dev/null 2>&1; then
    printf "${RED}✗ Node.js is not installed.${RESET}\n"
    printf "  ny-cli requires Node.js >= 20.18.0. Please install Node.js first.\n"
    exit 1
fi

if ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 18)) process.exit(1);
' 2>/dev/null; then
    printf "${RED}✗ Node.js >= 20.18.0 required (found $(node -v))${RESET}\n"
    printf "  Please upgrade Node.js first.\n"
    exit 1
fi
printf "${GREEN}✓ Node.js $(node -v)${RESET}\n"

if ! command -v npm >/dev/null 2>&1; then
    printf "${RED}✗ npm is not installed.${RESET}\n"
    exit 1
fi
printf "${GREEN}✓ npm $(npm -v)${RESET}\n"

# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL MEDIA DEPENDENCIES (SEPARATE CALLS)
# ═══════════════════════════════════════════════════════════════════════════════
install_system_pkg() {
    pkg="$1"
    case "$PKG_MANAGER" in
        pacman)
            run_elevated pacman -S --noconfirm --needed "$pkg" 2>/dev/null
            ;;
        dnf)
            run_elevated dnf install -y "$pkg" 2>/dev/null
            ;;
        apt)
            run_elevated apt-get update -qq 2>/dev/null || true
            run_elevated apt-get install -y "$pkg" 2>/dev/null
            ;;
        zypper)
            run_elevated zypper install -y "$pkg" 2>/dev/null
            ;;
        apk)
            run_elevated apk add "$pkg" 2>/dev/null
            ;;
        brew)
            brew install "$pkg" 2>/dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

# Install mpv
if command -v mpv >/dev/null 2>&1; then
    printf "${GREEN}✓ mpv is already installed${RESET}\n"
    MPV_STATUS="already installed"
else
    printf "${CYAN}Installing mpv...${RESET}\n"
    if install_system_pkg "mpv"; then
        printf "${GREEN}✓ mpv installed successfully${RESET}\n"
        MPV_STATUS="installed"
    else
        printf "${YELLOW}⚠ mpv installation failed or skipped (install manually for video playback)${RESET}\n"
        MPV_STATUS="not installed"
    fi
fi

# Install ffmpeg
if command -v ffmpeg >/dev/null 2>&1; then
    printf "${GREEN}✓ ffmpeg is already installed${RESET}\n"
    FFMPEG_STATUS="already installed"
else
    printf "${CYAN}Installing ffmpeg...${RESET}\n"
    if install_system_pkg "ffmpeg"; then
        printf "${GREEN}✓ ffmpeg installed successfully${RESET}\n"
        FFMPEG_STATUS="installed"
    else
        printf "${YELLOW}⚠ ffmpeg installation failed or skipped (install manually for downloads)${RESET}\n"
        FFMPEG_STATUS="not installed"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL NY-CLI VIA NPM
# ═══════════════════════════════════════════════════════════════════════════════
printf "\n${CYAN}Installing ${PKG_SPEC} via npm...${RESET}\n"

if run_elevated npm install -g "$PKG_SPEC"; then
    printf "${GREEN}✓ ny-cli package installed successfully${RESET}\n"
else
    # Retry without elevation in case user npm prefix is configured
    if npm install -g "$PKG_SPEC"; then
        printf "${GREEN}✓ ny-cli package installed successfully${RESET}\n"
    else
        printf "${RED}✗ npm install -g failed${RESET}\n"
        exit 1
    fi
fi

# Summary of installation results
printf "\n${CYAN}════════════════ Installation Summary ════════════════${RESET}\n"
printf "  ${WHITE}ny-cli:${RESET}  ${GREEN}installed${RESET} (${PKG_SPEC})\n"
printf "  ${WHITE}mpv:${RESET}     ${DIM}${MPV_STATUS}${RESET}\n"
printf "  ${WHITE}ffmpeg:${RESET}  ${DIM}${FFMPEG_STATUS}${RESET}\n"
printf "${CYAN}═══════════════════════════════════════════════════════${RESET}\n\n"

# ═══════════════════════════════════════════════════════════════════════════════
# ENSURE NY-CLI ACCESSIBLE IN PATH ACROSS ALL DISTRIBUTIONS
# ═══════════════════════════════════════════════════════════════════════════════
NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
NPM_BIN="$NPM_PREFIX/bin"
if [ -d "$NPM_BIN" ]; then
    export PATH="$NPM_BIN:$PATH"
fi

# Locate the installed ny-cli binary
INSTALLED_BIN=""
if command -v ny-cli >/dev/null 2>&1; then
    INSTALLED_BIN="$(command -v ny-cli)"
elif [ -x "$NPM_BIN/ny-cli" ]; then
    INSTALLED_BIN="$NPM_BIN/ny-cli"
elif [ -x "/usr/local/bin/ny-cli" ]; then
    INSTALLED_BIN="/usr/local/bin/ny-cli"
elif [ -x "/usr/bin/ny-cli" ]; then
    INSTALLED_BIN="/usr/bin/ny-cli"
elif [ -x "$HOME/.local/bin/ny-cli" ]; then
    INSTALLED_BIN="$HOME/.local/bin/ny-cli"
fi

# If command -v ny-cli is not already resolving from standard PATH, create symlinks
if [ -n "$INSTALLED_BIN" ]; then
    # Link into /usr/local/bin if /usr/local/bin exists
    if [ "$INSTALLED_BIN" != "/usr/local/bin/ny-cli" ] && [ -d "/usr/local/bin" ]; then
        run_elevated ln -sf "$INSTALLED_BIN" /usr/local/bin/ny-cli 2>/dev/null || true
    fi
    # Also link into ~/.local/bin as a per-user fallback
    if [ "$INSTALLED_BIN" != "$HOME/.local/bin/ny-cli" ]; then
        mkdir -p "$HOME/.local/bin" 2>/dev/null || true
        ln -sf "$INSTALLED_BIN" "$HOME/.local/bin/ny-cli" 2>/dev/null || true
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# RUN DOCTOR
# ═══════════════════════════════════════════════════════════════════════════════
printf "${CYAN}Running diagnostics (ny-cli --doctor)...${RESET}\n"
if command -v ny-cli >/dev/null 2>&1; then
    ny-cli --doctor || true
elif [ -n "$INSTALLED_BIN" ] && [ -x "$INSTALLED_BIN" ]; then
    "$INSTALLED_BIN" --doctor || true
else
    printf "${YELLOW}⚠ ny-cli binary not in current PATH. You may need to add $NPM_BIN to your PATH.${RESET}\n"
fi
