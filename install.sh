#!/bin/sh
# NY-CLI v3.0 Installation Script
# Usage: curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh

set -e

# Colors
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
printf "${DIM}            v3.0.2 • nyanime.tech${RESET}\n"
printf "\n"

REPO_URL="https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main"

# ─── Check required dependencies ───

printf "${CYAN}Checking prerequisites...${RESET}\n"

missing=""

if ! command -v node >/dev/null 2>&1; then
    missing="$missing nodejs"
fi

if ! command -v npm >/dev/null 2>&1; then
    missing="$missing npm"
fi

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    missing="$missing curl"
fi

if [ -n "$missing" ]; then
    printf "${RED}✗ Missing required dependencies:${RESET}$missing\n"
    printf "\n"
    printf "  Install them first:\n"
    printf "    ${DIM}Ubuntu/Debian:${RESET} sudo apt install$missing\n"
    printf "    ${DIM}Fedora:${RESET}        sudo dnf install$missing\n"
    printf "    ${DIM}Arch:${RESET}          sudo pacman -S$missing\n"
    printf "    ${DIM}macOS:${RESET}         brew install$missing\n"
    printf "\n"
    exit 1
fi

node_ver=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -n "$node_ver" ] && [ "$node_ver" -lt 18 ] 2>/dev/null; then
    printf "${RED}✗ Node.js 18+ required (found v$(node -v))${RESET}\n"
    exit 1
fi

printf "${GREEN}✓ Node.js $(node -v) found${RESET}\n"

# ─── Determine install locations ───

if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
    INSTALL_DIR="${PREFIX:-/usr/local}/lib/ny-cli"
    BIN_DIR="${PREFIX:-/usr/local}/bin"
else
    INSTALL_DIR="${PREFIX:-$HOME/.local}/lib/ny-cli"
    BIN_DIR="${PREFIX:-$HOME/.local}/bin"
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# ─── Download files ───

download() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -sL "$url" -o "$dest"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$dest" "$url"
    fi
}

printf "${CYAN}⟳ Downloading ny-cli v3.0...${RESET}\n"

download "$REPO_URL/ny-cli"       "$INSTALL_DIR/ny-cli"
download "$REPO_URL/backend.mjs"  "$INSTALL_DIR/backend.mjs"
download "$REPO_URL/package.json" "$INSTALL_DIR/package.json"

chmod +x "$INSTALL_DIR/ny-cli"

printf "${GREEN}✓ Files downloaded${RESET}\n"

# ─── Install npm dependencies ───

printf "${CYAN}⟳ Installing aniwatch package...${RESET}\n"

(cd "$INSTALL_DIR" && npm install --production --silent 2>/dev/null) || {
    printf "${RED}✗ npm install failed. Try running manually:${RESET}\n"
    printf "  cd $INSTALL_DIR && npm install --production\n"
    exit 1
}

printf "${GREEN}✓ Dependencies installed${RESET}\n"

# ─── Create symlink in bin ───

ln -sf "$INSTALL_DIR/ny-cli" "$BIN_DIR/ny-cli"

printf "${GREEN}✓ Symlinked to $BIN_DIR/ny-cli${RESET}\n"

# ─── Check PATH ───

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
        printf "\n"
        printf "${YELLOW}⚠ $BIN_DIR is not in your PATH${RESET}\n"
        printf "  Add this line to your ${DIM}~/.bashrc${RESET} or ${DIM}~/.zshrc${RESET}:\n"
        printf "\n"
        printf "    export PATH=\"\$PATH:$BIN_DIR\"\n"
        printf "\n"
        ;;
esac

# ─── Check optional dependencies ───

printf "\n"
opt_missing=""

if ! command -v mpv >/dev/null 2>&1; then
    opt_missing="$opt_missing mpv"
fi

if [ -n "$opt_missing" ]; then
    printf "${YELLOW}⚠ Recommended:${RESET}$opt_missing ${DIM}(video player)${RESET}\n"
    printf "    ${DIM}Ubuntu/Debian:${RESET} sudo apt install$opt_missing\n"
    printf "    ${DIM}Arch:${RESET}          sudo pacman -S$opt_missing\n"
    printf "    ${DIM}macOS:${RESET}         brew install$opt_missing\n"
fi

# ─── Done ───

printf "\n"
printf "${GREEN}╭────────────────────────────────────────╮${RESET}\n"
printf "${GREEN}│${RESET}  ${WHITE}Installation complete!${RESET} 🎉             ${GREEN}│${RESET}\n"
printf "${GREEN}├────────────────────────────────────────┤${RESET}\n"
printf "${GREEN}│${RESET}  Run ${CYAN}ny-cli${RESET} to start watching anime     ${GREEN}│${RESET}\n"
printf "${GREEN}│${RESET}  Run ${CYAN}ny-cli --help${RESET} for options          ${GREEN}│${RESET}\n"
printf "${GREEN}╰────────────────────────────────────────╯${RESET}\n"
printf "\n"
