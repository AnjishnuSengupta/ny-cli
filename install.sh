#!/bin/sh
# NY-CLI Installation Script
# Usage: curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh

set -e

# Colors
RED='\033[1;31m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
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
printf "${DIM}            v1.1.0 • nyanime.tech${RESET}\n"
printf "\n"

# Determine install location
if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
    INSTALL_DIR="${PREFIX:-/usr/local}/bin"
else
    INSTALL_DIR="${PREFIX:-$HOME/.local}/bin"
fi

# Create directory if needed
mkdir -p "$INSTALL_DIR"

# Download ny-cli
printf "${CYAN}⟳ Downloading ny-cli...${RESET}\n"

if command -v curl >/dev/null 2>&1; then
    curl -sL "https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/ny-cli" -o "$INSTALL_DIR/ny-cli"
elif command -v wget >/dev/null 2>&1; then
    wget -qO "$INSTALL_DIR/ny-cli" "https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/ny-cli"
else
    printf "${RED}✗ Error: Neither curl nor wget found. Please install one of them.${RESET}\n"
    exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/ny-cli"

printf "${GREEN}✓ NY-CLI installed to $INSTALL_DIR/ny-cli${RESET}\n"

# Check if in PATH
case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        printf "\n"
        printf "${CYAN}⚠ Note: $INSTALL_DIR is not in your PATH${RESET}\n"
        printf "  Add this line to your ~/.bashrc or ~/.zshrc:\n"
        printf "\n"
        printf "    export PATH=\"\$PATH:$INSTALL_DIR\"\n"
        printf "\n"
        ;;
esac

# Check dependencies
printf "\n"
printf "${CYAN}Checking dependencies...${RESET}\n"

missing=""

if ! command -v curl >/dev/null 2>&1; then
    missing="$missing curl"
fi

if ! command -v mpv >/dev/null 2>&1; then
    missing="$missing mpv"
fi

if [ -n "$missing" ]; then
    printf "${CYAN}⚠ Optional dependencies not found:${RESET}$missing\n"
    printf "\n"
    printf "  Install them with:\n"
    printf "    Ubuntu/Debian: sudo apt install$missing\n"
    printf "    Fedora: sudo dnf install$missing\n"
    printf "    Arch: sudo pacman -S$missing\n"
    printf "    macOS: brew install$missing\n"
fi

printf "\n"
printf "${GREEN}╭────────────────────────────────────────╮${RESET}\n"
printf "${GREEN}│${RESET}  Installation complete! 🎉              ${GREEN}│${RESET}\n"
printf "${GREEN}├────────────────────────────────────────┤${RESET}\n"
printf "${GREEN}│${RESET}  Run 'ny-cli' to start watching anime  ${GREEN}│${RESET}\n"
printf "${GREEN}│${RESET}  Run 'ny-cli --help' for options       ${GREEN}│${RESET}\n"
printf "${GREEN}╰────────────────────────────────────────╯${RESET}\n"
printf "\n"
