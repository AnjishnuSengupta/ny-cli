# 🌙 NY-CLI — Your Terminal Gateway to Anime

```
    ███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗
    ████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║
    ██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║
    ██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║
    ██║ ╚████║   ██║         ╚██████╗███████╗██║
    ╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝
```

A beautiful terminal-based anime streaming client inspired by [ani-cli](https://github.com/pystardust/ani-cli), powered by [nyanime.tech](https://nyanime.tech).

[![Version](https://img.shields.io/badge/version-1.0.0-purple)](https://github.com/AnjishnuSengupta/ny-cli)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Shell](https://img.shields.io/badge/shell-POSIX-blue)](https://en.wikipedia.org/wiki/POSIX)

## ✨ Features

- 🎨 **Beautiful Terminal UI** — Stunning ASCII art and colorful interface
- � **Zero Configuration** — Works out of the box, no setup required
- 🔐 **Easy Authentication** — Browser-based login via nyanime.tech
- ▶️ **Continue Watching** — Resume where you left off
- 🔍 **Search** — Find any anime instantly
- 🔥 **Trending** — See what's popular right now
- 🎲 **Random Mode** — Discover new anime randomly
- 🎬 **Multiple Players** — Support for mpv, vlc, iina
- 💾 **Local History** — Watch history saved locally

## 📦 Installation
### Quick Install (All Systems)

```bash
curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```


<details>

<summary>

### Arch Linux

</summary>

```bash
# From AUR (recommended)
yay -S ny-cli
# or
paru -S ny-cli

# Or using pacman (when available in community repo)
sudo pacman -S ny-cli
```

</details>
<details>

<summary>

### Debian / Ubuntu

</summary>

```bash
# Download and install .deb from releases
wget https://github.com/AnjishnuSengupta/ny-cli/releases/latest/download/ny-cli_1.0.0_all.deb
sudo apt install ./ny-cli_1.0.0_all.deb

# Or build from source
git clone https://github.com/AnjishnuSengupta/ny-cli.git
cd ny-cli
dpkg-buildpackage -us -uc -b
sudo apt install ../ny-cli_*.deb
```

</details>
<details>

<summary>

### Fedora / RHEL / CentOS

</summary>

```bash
# From COPR (when available)
sudo dnf copr enable AnjishnuSengupta/ny-cli
sudo dnf install ny-cli

# Or download .rpm from releases
sudo dnf install https://github.com/AnjishnuSengupta/ny-cli/releases/latest/download/ny-cli-1.0.0-1.noarch.rpm
```

</details>
<details>

<summary>

### openSUSE

</summary>

```bash
sudo zypper install https://github.com/AnjishnuSengupta/ny-cli/releases/latest/download/ny-cli-1.0.0-1.noarch.rpm
```

</details>
<details>

<summary>

### macOS (Homebrew)

</summary>

```bash
brew install AnjishnuSengupta/tap/ny-cli
```

</details>
<details>

<summary>

### Manual Install

</summary>

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/ny-cli.git
cd ny-cli

# Make it executable and install
chmod +x ny-cli
sudo install -Dm755 ny-cli /usr/local/bin/ny-cli
```

</details>

## 🔧 Dependencies

**Required:**
- `curl` — For API requests
- `sed`, `grep` — Text processing (built into most systems)

**Recommended:**
- `mpv` — Best video player (recommended)
- `fzf` — Fuzzy finder for better menus (optional but nice)

### Installing Dependencies

**Ubuntu/Debian:**
```bash
sudo apt install curl mpv fzf
```

**Fedora:**
```bash
sudo dnf install curl mpv fzf
```

**Arch Linux:**
```bash
sudo pacman -S curl mpv fzf
```

**macOS:**
```bash
brew install curl mpv fzf
```

## 🚀 Usage

### Interactive Mode

Just run:
```bash
ny-cli
```

You'll see a beautiful menu where you can:
- Search for anime
- Login/Sign up
- Continue watching (if logged in)
- Get recommendations
- Play random anime

### Command Line Options

```bash
# Search directly
ny-cli -s "one piece"
ny-cli "attack on titan"

# Continue watching
ny-cli -c

# Random anime
ny-cli -r

# Login
ny-cli -l

# Logout
ny-cli -L

# Help
ny-cli -h

# Version
ny-cli -v
```

## ⚙️ Configuration

### Environment Variables (Optional)

All settings are pre-configured. Optionally customize:

```bash
# Player (defaults to mpv)
export NYCLI_PLAYER="mpv"  # or vlc, iina

# Quality (optional)
export NYCLI_QUALITY="best"  # or 1080p, 720p, etc.

# Custom directories (optional)
export NYCLI_CONFIG_DIR="$HOME/.config/ny-cli"
export NYCLI_CACHE_DIR="$HOME/.cache/ny-cli"
export NYCLI_DATA_DIR="$HOME/.local/share/ny-cli"
```

### Login (Optional)

To enable cloud sync features, login via browser:

```bash
ny-cli -l
```

This opens nyanime.tech/signup in your browser. After signing up/logging in:
1. Go to your **Profile** page
2. Copy your **User ID** shown there
3. Paste it in the terminal when prompted

Your watch history will sync between the CLI and website!

## 🔄 Updating

### Arch Linux
```bash
yay -Syu ny-cli
```

### Debian/Ubuntu
```bash
sudo apt update && sudo apt upgrade ny-cli
```

### Fedora
```bash
sudo dnf upgrade ny-cli
```

### Manual Update
```bash
cd ny-cli && git pull && sudo install -Dm755 ny-cli /usr/local/bin/ny-cli
```

## 🖥️ Supported Platforms

- ✅ Linux (all distros)
- ✅ macOS
- ✅ WSL (Windows Subsystem for Linux)
- ✅ Termux (Android)

## 🎮 Controls

### During Playback (mpv)

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` / `→` | Seek 5s |
| `↑` / `↓` | Seek 60s |
| `f` | Fullscreen |
| `m` | Mute |
| `q` | Quit |
| `v` | Toggle subtitles |

### In Menus

| Key | Action |
|-----|--------|
| `1-9` | Select option |
| `q` | Quit |
| `Enter` | Confirm |

## 🔒 Privacy

- Credentials are stored locally in `~/.config/ny-cli/`
- Watch history syncs to Firebase only when logged in
- No tracking or analytics

## 🐛 Troubleshooting

### "Missing dependency: mpv"
Install mpv: `sudo apt install mpv` (or equivalent for your distro)

### "No stream URL found"
The anime might not have sources available. Try another anime or episode.

### Video won't play
Make sure mpv is installed and working: `mpv --version`

## 🤝 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

## 📜 License

MIT License — Use freely, just give credit!

## � Package Maintainer Guide

Want to package `ny-cli` for your distro? Here's how:

### Arch Linux (AUR)
1. The `PKGBUILD` is included in the repository
2. Test locally: `makepkg -si`
3. Submit to AUR: https://wiki.archlinux.org/title/AUR_submission_guidelines

### Debian/Ubuntu
1. Packaging files are in `debian/` directory
2. Build: `dpkg-buildpackage -us -uc -b`
3. For PPA: https://help.launchpad.net/Packaging/PPA

### Fedora (COPR)
1. RPM spec file: `ny-cli.spec`
2. Build: `rpmbuild -ba ny-cli.spec`
3. COPR: https://docs.pagure.org/copr.copr/user_documentation.html

### Homebrew
1. Create a tap repository
2. Add formula pointing to release tarball

## �🔗 Links

- 🌐 **Website:** [nyanime.tech](https://nyanime.tech)
- 📦 **Repository:** [github.com/AnjishnuSengupta/ny-cli](https://github.com/AnjishnuSengupta/ny-cli)
- 🐛 **Issues:** [Report bugs here](https://github.com/AnjishnuSengupta/ny-cli/issues)

## ⚠️ Disclaimer

This project is for educational purposes only. NY-CLI does not host any anime content. All streaming sources are from publicly available third-party providers.

---

> "In a world full of filler episodes, be the main arc." — NY-CLI 💜
