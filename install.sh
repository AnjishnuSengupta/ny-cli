#!/bin/sh
# NY-CLI Installation Script
# Usage: curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | bash

set -e

echo ""
echo "  ███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗"
echo "  ████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║"
echo "  ██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║"
echo "  ██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║"
echo "  ██║ ╚████║   ██║         ╚██████╗███████╗██║"
echo "  ╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝"
echo ""
echo "  Installing NY-CLI - Your Terminal Gateway to Anime"
echo "  ─────────────────────────────────────────────────"
echo ""

# Colors
RED='\033[1;31m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
RESET='\033[0m'

# Determine install location
if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
    INSTALL_DIR="${PREFIX:-/usr/local}/bin"
else
    INSTALL_DIR="${PREFIX:-$HOME/.local}/bin"
fi

# Create directory if needed
mkdir -p "$INSTALL_DIR"

# Download ny-cli
echo "${CYAN}⟳ Downloading ny-cli...${RESET}"

if command -v curl >/dev/null 2>&1; then
    curl -sL "https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/ny-cli" -o "$INSTALL_DIR/ny-cli"
elif command -v wget >/dev/null 2>&1; then
    wget -qO "$INSTALL_DIR/ny-cli" "https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/ny-cli"
else
    echo "${RED}✗ Error: Neither curl nor wget found. Please install one of them.${RESET}"
    exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/ny-cli"

echo "${GREEN}✓ NY-CLI installed to $INSTALL_DIR/ny-cli${RESET}"

# Check if in PATH
case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        echo ""
        echo "${CYAN}⚠ Note: $INSTALL_DIR is not in your PATH${RESET}"
        echo "  Add this line to your ~/.bashrc or ~/.zshrc:"
        echo ""
        echo "    export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
        ;;
esac

# Check dependencies
echo ""
echo "${CYAN}Checking dependencies...${RESET}"

missing=""

if ! command -v curl >/dev/null 2>&1; then
    missing="$missing curl"
fi

if ! command -v mpv >/dev/null 2>&1; then
    missing="$missing mpv"
fi

if [ -n "$missing" ]; then
    echo "${CYAN}⚠ Optional dependencies not found:${RESET}$missing"
    echo ""
    echo "  Install them with:"
    echo "    Ubuntu/Debian: sudo apt install$missing"
    echo "    Fedora: sudo dnf install$missing"
    echo "    Arch: sudo pacman -S$missing"
    echo "    macOS: brew install$missing"
fi

echo ""
echo "${GREEN}╭────────────────────────────────────────╮${RESET}"
echo "${GREEN}│${RESET}  Installation complete! 🎉              ${GREEN}│${RESET}"
echo "${GREEN}├────────────────────────────────────────┤${RESET}"
echo "${GREEN}│${RESET}  Run 'ny-cli' to start watching anime  ${GREEN}│${RESET}"
echo "${GREEN}│${RESET}  Run 'ny-cli --help' for options       ${GREEN}│${RESET}"
echo "${GREEN}╰────────────────────────────────────────╯${RESET}"
echo ""
