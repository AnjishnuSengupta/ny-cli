#!/bin/sh
# NY-CLI v5.5.9 Installation Script
# Universal installer for Linux (Arch, Fedora, Ubuntu/Debian) and macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh

set -e

# ═══════════════════════════════════════════════════════════════════════════════
# COLORS
# ═══════════════════════════════════════════════════════════════════════════════
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
RESET='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
# BANNER
# ═══════════════════════════════════════════════════════════════════════════════
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
printf "${DIM}            v5.5.10 • nyanime.qzz.io${RESET}\n"
printf "\n"

VERSION="5.5.10"
REPO_URL="https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main"
GITHUB_REPO="https://github.com/AnjishnuSengupta/ny-cli"

# ═══════════════════════════════════════════════════════════════════════════════
# DETECT OS AND PACKAGE MANAGER
# ═══════════════════════════════════════════════════════════════════════════════
detect_os() {
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
                # Try to detect from ID_LIKE
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
    
    printf "${DIM}Detected: ${OS} (${PKG_MANAGER})${RESET}\n"
}

# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL SYSTEM DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════
install_dependencies() {
    local deps="$1"
    
    if [ -z "$deps" ]; then
        return 0
    fi
    
    printf "${CYAN}Installing system dependencies: ${WHITE}$deps${RESET}\n"
    
    case "$PKG_MANAGER" in
        pacman)
            sudo pacman -S --noconfirm --needed $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        dnf)
            sudo dnf install -y $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        apt)
            sudo apt-get update -qq 2>/dev/null
            sudo apt-get install -y $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        zypper)
            sudo zypper install -y $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        apk)
            sudo apk add $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        brew)
            brew install $deps 2>/dev/null || {
                printf "${YELLOW}⚠ Some packages may need manual installation${RESET}\n"
            }
            ;;
        *)
            printf "${RED}Unknown package manager. Please install manually: $deps${RESET}\n"
            return 1
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK AND INSTALL PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════
check_prerequisites() {
    printf "${CYAN}Checking prerequisites...${RESET}\n"
    
    local missing_required=""
    local missing_optional=""
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        missing_required="$missing_required nodejs"
    else
        node_ver=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
        if [ -n "$node_ver" ] && [ "$node_ver" -lt 18 ] 2>/dev/null; then
            printf "${RED}✗ Node.js 18+ required (found v$(node -v))${RESET}\n"
            printf "  Please upgrade Node.js first.\n"
            exit 1
        fi
        printf "${GREEN}✓ Node.js $(node -v)${RESET}\n"
    fi
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        missing_required="$missing_required npm"
    else
        printf "${GREEN}✓ npm $(npm -v 2>/dev/null)${RESET}\n"
    fi
    
    # Check curl or wget
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        missing_required="$missing_required curl"
    fi
    
    # Check mpv (recommended player)
    if ! command -v mpv >/dev/null 2>&1; then
        missing_optional="$missing_optional mpv"
    else
        printf "${GREEN}✓ mpv installed${RESET}\n"
    fi
    

    # Check webtorrent-cli
    if ! command -v webtorrent >/dev/null 2>&1; then
        missing_optional="$missing_optional webtorrent-cli"
    else
        printf "${GREEN}✓ webtorrent-cli installed${RESET}\n"
    fi
    
    # Check bun (optional, for best experience)
    if ! command -v bun >/dev/null 2>&1; then
        printf "${DIM}ℹ Bun not found (optional, enhances UI)${RESET}\n"
    else
        printf "${GREEN}✓ Bun $(bun -v 2>/dev/null)${RESET}\n"
    fi
    
    # Install missing required dependencies
    if [ -n "$missing_required" ]; then
        printf "\n${YELLOW}Missing required dependencies:${WHITE}$missing_required${RESET}\n"
        
        # Map package names per distro
        case "$PKG_MANAGER" in
            pacman)
                pkg_names=$(echo "$missing_required" | sed 's/nodejs/nodejs npm/')
                ;;
            dnf)
                pkg_names=$(echo "$missing_required" | sed 's/nodejs/nodejs npm/')
                ;;
            apt)
                pkg_names=$(echo "$missing_required" | sed 's/nodejs/nodejs npm/')
                ;;
            brew)
                pkg_names=$(echo "$missing_required" | sed 's/nodejs/node/')
                ;;
            *)
                pkg_names="$missing_required"
                ;;
        esac
        
        printf "\n${CYAN}Would you like to install them now? [Y/n] ${RESET}"
        read -r response </dev/tty || response="y"
        case "$response" in
            [nN]*)
                printf "${RED}Cannot continue without required dependencies.${RESET}\n"
                exit 1
                ;;
            *)
                install_dependencies "$pkg_names"
                ;;
        esac
    fi
    
    # Offer to install optional dependencies
    if [ -n "$missing_optional" ]; then
        printf "\n${YELLOW}Recommended optional packages:${WHITE}$missing_optional${RESET}\n"
        printf "${DIM}  mpv   - Video player (required for playback)${RESET}\n"
        
        printf "\n${CYAN}Install recommended packages? [Y/n] ${RESET}"
        read -r response </dev/tty || response="y"
        case "$response" in
            [nN]*)
                printf "${DIM}Skipping optional packages${RESET}\n"
                ;;
            *)
        # Map package names per distro
        case "$PKG_MANAGER" in
            pacman)
                opt_pkgs="$missing_optional"
                ;;
            dnf)
                opt_pkgs="$missing_optional"
                ;;
            apt)
                opt_pkgs="$missing_optional"
                ;;
            brew)
                opt_pkgs="$missing_optional"
                ;;
            *)
                opt_pkgs="$missing_optional"
                ;;
        esac
        install_dependencies "$opt_pkgs"
        ;;
esac
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# DOWNLOAD HELPER
# ═══════════════════════════════════════════════════════════════════════════════
download() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$dest" "$url"
    else
        printf "${RED}Neither curl nor wget found${RESET}\n"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN INSTALLATION
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    detect_os
    check_prerequisites
    
    printf "\n"
    
    # Determine install locations
    if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
        INSTALL_DIR="${PREFIX:-/usr/local}/lib/ny-cli"
        BIN_DIR="${PREFIX:-/usr/local}/bin"
    else
        INSTALL_DIR="${PREFIX:-$HOME/.local}/lib/ny-cli"
        BIN_DIR="${PREFIX:-$HOME/.local}/bin"
    fi
    
    mkdir -p "$INSTALL_DIR" "$BIN_DIR"
    
    printf "${CYAN}⟳ Downloading ny-cli v${VERSION}...${RESET}\n"
    
    # Download core files
    download "$REPO_URL/ny-cli" "$INSTALL_DIR/ny-cli"
    download "$REPO_URL/backend.mjs" "$INSTALL_DIR/backend.mjs"
    download "$REPO_URL/cli-terminal.tsx" "$INSTALL_DIR/cli-terminal.tsx"
    download "$REPO_URL/cli-terminal-fallback.mjs" "$INSTALL_DIR/cli-terminal-fallback.mjs"
    download "$REPO_URL/package.json" "$INSTALL_DIR/package.json"
    
    chmod +x "$INSTALL_DIR/ny-cli"
    
    printf "${GREEN}✓ Files downloaded${RESET}\n"
    
    # Install npm dependencies
    printf "${CYAN}⟳ Installing npm dependencies...${RESET}\n"
    
    (cd "$INSTALL_DIR" && npm install --silent --omit=dev --legacy-peer-deps 2>/dev/null) || {
        printf "${YELLOW}⚠ npm install had warnings, continuing...${RESET}\n"
        (cd "$INSTALL_DIR" && npm install --omit=dev --legacy-peer-deps 2>&1 | tail -3)
    }
    
    printf "${GREEN}✓ Dependencies installed${RESET}\n"
    
    # Create symlink
    ln -sf "$INSTALL_DIR/ny-cli" "$BIN_DIR/ny-cli"
    
    printf "${GREEN}✓ Symlinked to $BIN_DIR/ny-cli${RESET}\n"
    
    # Check PATH
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *)
            printf "\n"
            printf "${YELLOW}⚠ $BIN_DIR is not in your PATH${RESET}\n"
            printf "  Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):\n"
            printf "\n"
            printf "    ${WHITE}export PATH=\"\$PATH:$BIN_DIR\"${RESET}\n"
            printf "\n"
            ;;
    esac
    
    # Success message
    printf "\n"
    printf "${GREEN}╭─────────────────────────────────────────────╮${RESET}\n"
    printf "${GREEN}│${RESET}  ${WHITE}✨ NY-CLI v${VERSION} installed!${RESET}              ${GREEN}│${RESET}\n"
    printf "${GREEN}├─────────────────────────────────────────────┤${RESET}\n"
    printf "${GREEN}│${RESET}  Run ${CYAN}ny-cli${RESET} to start watching anime       ${GREEN}│${RESET}\n"
    printf "${GREEN}│${RESET}  Run ${CYAN}ny-cli -h${RESET} for help                   ${GREEN}│${RESET}\n"
    printf "${GREEN}╰─────────────────────────────────────────────╯${RESET}\n"
    printf "\n"
    printf "${DIM}Tip: Install Bun for the best UI experience:${RESET}\n"
    printf "${DIM}  curl -fsSL https://bun.sh/install | bash${RESET}\n"
    printf "\n"
}

# Run main installation
main "$@"
