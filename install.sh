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
# USER & PRIVILEGE DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
CURRENT_UID="$(id -u 2>/dev/null || echo 1)"
if [ "$CURRENT_UID" -eq 0 ] && [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
    REAL_USER="$SUDO_USER"
    REAL_HOME="$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6 || true)"
    if [ -z "$REAL_HOME" ] && command -v dscl >/dev/null 2>&1; then
        REAL_HOME="$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
    fi
    if [ -z "$REAL_HOME" ]; then
        REAL_HOME="/home/$SUDO_USER"
    fi
    REAL_GROUP="$(id -gn "$SUDO_USER" 2>/dev/null || echo "$SUDO_USER")"
else
    REAL_USER="$(id -un 2>/dev/null || echo "$USER")"
    REAL_HOME="$HOME"
    REAL_GROUP="$(id -gn "$REAL_USER" 2>/dev/null || echo "$REAL_USER")"
fi

run_elevated() {
    if [ "$CURRENT_UID" -eq 0 ]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

run_as_user() {
    if [ "$CURRENT_UID" -eq 0 ] && [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
        if command -v sudo >/dev/null 2>&1; then
            sudo -u "$SUDO_USER" "$@"
        elif command -v su >/dev/null 2>&1; then
            su - "$SUDO_USER" -c "$*"
        else
            "$@"
        fi
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

NPM_CACHE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/ny-cli-npm.XXXXXX" 2>/dev/null || mktemp -d)"
trap 'rm -rf "$NPM_CACHE_TMP"' EXIT INT TERM HUP
chmod 700 "$NPM_CACHE_TMP" 2>/dev/null || true
if [ "$CURRENT_UID" -eq 0 ] && [ -n "$REAL_USER" ] && [ "$REAL_USER" != "root" ]; then
    chown -R "$REAL_USER:$REAL_GROUP" "$NPM_CACHE_TMP" 2>/dev/null || true
fi

NPM_SUCCESS=false

# Method 1: If running as non-root user, try user npm environment first
if [ "$CURRENT_UID" -ne 0 ]; then
    if npm install -g --cache "$NPM_CACHE_TMP" --no-fund --no-audit "$PKG_SPEC" 2>/dev/null; then
        NPM_SUCCESS=true
        printf "${GREEN}✓ ny-cli package installed successfully (user environment)${RESET}\n"
    fi
fi

# Method 2: Global elevated install (system-wide), keeping cache isolated from ~/.npm
if [ "$NPM_SUCCESS" = "false" ]; then
    if run_elevated env npm_config_cache="$NPM_CACHE_TMP" npm install -g --cache "$NPM_CACHE_TMP" --foreground-scripts --unsafe-perm=true --no-fund --no-audit "$PKG_SPEC" 2>/dev/null; then
        NPM_SUCCESS=true
        printf "${GREEN}✓ ny-cli package installed successfully (global)${RESET}\n"
    fi
fi

# Method 3: Fallback to user ~/.local prefix if global directory is permission-restricted
if [ "$NPM_SUCCESS" = "false" ]; then
    printf "${YELLOW}⚠ Global install requires user prefix, installing into ${REAL_HOME}/.local...${RESET}\n"
    run_as_user mkdir -p "$REAL_HOME/.local" 2>/dev/null || true
    if run_as_user env npm_config_cache="$NPM_CACHE_TMP" npm install -g --prefix "$REAL_HOME/.local" --cache "$NPM_CACHE_TMP" --no-fund --no-audit "$PKG_SPEC"; then
        NPM_SUCCESS=true
        printf "${GREEN}✓ ny-cli package installed successfully in ${REAL_HOME}/.local${RESET}\n"
    fi
fi

rm -rf "$NPM_CACHE_TMP" 2>/dev/null || true

if [ "$NPM_SUCCESS" = "false" ]; then
    printf "${RED}✗ npm install failed.${RESET}\n"
    printf "  Try installing to your user directory: npm install -g --prefix ~/.local ${PKG_SPEC}\n"
    exit 1
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
USER_LOCAL_BIN="$REAL_HOME/.local/bin"

for p in "$NPM_BIN" "$USER_LOCAL_BIN" "/usr/local/bin"; do
    if [ -d "$p" ]; then
        case ":$PATH:" in
            *":$p:"*) ;;
            *) export PATH="$p:$PATH" ;;
        esac
    fi
done

# Locate the installed ny-cli binary
INSTALLED_BIN=""
if command -v ny-cli >/dev/null 2>&1; then
    INSTALLED_BIN="$(command -v ny-cli)"
elif [ -x "$NPM_BIN/ny-cli" ]; then
    INSTALLED_BIN="$NPM_BIN/ny-cli"
elif [ -x "$USER_LOCAL_BIN/ny-cli" ]; then
    INSTALLED_BIN="$USER_LOCAL_BIN/ny-cli"
elif [ -x "/usr/local/bin/ny-cli" ]; then
    INSTALLED_BIN="/usr/local/bin/ny-cli"
elif [ -x "/usr/bin/ny-cli" ]; then
    INSTALLED_BIN="/usr/bin/ny-cli"
fi

# If command -v ny-cli is not already resolving from standard PATH, create symlinks
if [ -n "$INSTALLED_BIN" ]; then
    # Link into /usr/local/bin if /usr/local/bin exists and writable or with elevation
    if [ "$INSTALLED_BIN" != "/usr/local/bin/ny-cli" ] && [ -d "/usr/local/bin" ]; then
        run_elevated ln -sf "$INSTALLED_BIN" /usr/local/bin/ny-cli 2>/dev/null || true
    fi
    # Also link into user ~/.local/bin as a per-user fallback
    if [ "$INSTALLED_BIN" != "$USER_LOCAL_BIN/ny-cli" ]; then
        run_as_user mkdir -p "$USER_LOCAL_BIN" 2>/dev/null || true
        run_as_user ln -sf "$INSTALLED_BIN" "$USER_LOCAL_BIN/ny-cli" 2>/dev/null || true
        if [ "$CURRENT_UID" -eq 0 ] && [ -n "$REAL_USER" ]; then
            chown -h "$REAL_USER:$REAL_GROUP" "$USER_LOCAL_BIN/ny-cli" "$USER_LOCAL_BIN" 2>/dev/null || true
        fi
    fi
fi

# Self-heal any directories in user home that might have been accidentally owned by root
if [ "$CURRENT_UID" -eq 0 ] && [ -n "$REAL_USER" ] && [ "$REAL_USER" != "root" ]; then
    for udir in "$REAL_HOME/.config/ny-cli" "$REAL_HOME/.local/state/ny-cli" "$REAL_HOME/.local/share/ny-cli"; do
        if [ -e "$udir" ]; then
            chown -R "$REAL_USER:$REAL_GROUP" "$udir" 2>/dev/null || true
            chmod 700 "$udir" 2>/dev/null || true
            find "$udir" -type f -exec chmod 600 {} + 2>/dev/null || true
        fi
    done
    if [ -e "$USER_LOCAL_BIN/ny-cli" ]; then
        chown -h "$REAL_USER:$REAL_GROUP" "$USER_LOCAL_BIN/ny-cli" 2>/dev/null || true
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# RUN DOCTOR (ALWAYS AS USER, NEVER AS ROOT)
# ═══════════════════════════════════════════════════════════════════════════════
printf "${CYAN}Running diagnostics (ny-cli --doctor)...${RESET}\n"
if [ -n "$INSTALLED_BIN" ] && [ -x "$INSTALLED_BIN" ]; then
    run_as_user "$INSTALLED_BIN" --doctor || true
elif command -v ny-cli >/dev/null 2>&1; then
    run_as_user ny-cli --doctor || true
else
    printf "${YELLOW}⚠ ny-cli binary not in current PATH. You may need to add ~/.local/bin or $NPM_BIN to your PATH.${RESET}\n"
fi
