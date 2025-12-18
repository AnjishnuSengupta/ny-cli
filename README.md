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
- 🔐 **Firebase Authentication** — Sign up/login to sync across devices
- ▶️ **Continue Watching** — Resume where you left off, synced to cloud
- 🔍 **Search** — Find any anime instantly
- 📚 **Recommendations** — AI-powered suggestions based on your watch history
- 🎲 **Random Mode** — Discover new anime randomly
- 🎬 **Multiple Players** — Support for mpv, vlc, iina, and more
- 📝 **Subtitles** — Automatic subtitle fetching
- 💾 **Local History** — Works offline too

## 📦 Installation

### Quick Install (Recommended)

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/ny-cli.git
cd ny-cli

# Make it executable
chmod +x ny-cli

# Install to your PATH (optional)
sudo cp ny-cli /usr/local/bin/
```

### Manual Install

```bash
# Download directly
curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/ny-cli -o ny-cli
chmod +x ny-cli
sudo mv ny-cli /usr/local/bin/
```

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

### Environment Variables

Set these in your `~/.bashrc`, `~/.zshrc`, or shell config:

```bash
# Firebase Configuration (required for auth)
export NYCLI_FIREBASE_API_KEY="your_api_key"
export NYCLI_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
export NYCLI_FIREBASE_PROJECT_ID="your_project_id"

# API Endpoints (optional, uses defaults)
export NYCLI_API="https://nyanime.tech"
export NYCLI_ANIWATCH_API="https://api.nyanime.tech"

# Player (optional, defaults to mpv)
export NYCLI_PLAYER="mpv"  # or vlc, iina

# Quality (optional)
export NYCLI_QUALITY="best"  # or 1080p, 720p, etc.

# Custom directories (optional)
export NYCLI_CONFIG_DIR="$HOME/.config/ny-cli"
export NYCLI_CACHE_DIR="$HOME/.cache/ny-cli"
export NYCLI_DATA_DIR="$HOME/.local/share/ny-cli"
```

### Getting Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use your existing nyanime project
3. Go to Project Settings → Your Apps → Web App
4. Copy the API key, auth domain, and project ID

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
The anime might not have sources available. Try another anime or source.

### Video won't play
Make sure mpv is installed and working: `mpv --version`

### Can't login
Check your Firebase credentials are set correctly in environment variables.

## 🤝 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

## 📜 License

MIT License — Use freely, just give credit!

## 🔗 Links

- 🌐 **Website:** [nyanime.tech](https://nyanime.tech)
- 📦 **Repository:** [github.com/AnjishnuSengupta/ny-cli](https://github.com/AnjishnuSengupta/ny-cli)
- 🐛 **Issues:** [Report bugs here](https://github.com/AnjishnuSengupta/ny-cli/issues)

## ⚠️ Disclaimer

This project is for educational purposes only. NY-CLI does not host any anime content. All streaming sources are from publicly available third-party providers.

---

> "In a world full of filler episodes, be the main arc." — NY-CLI 💜

Made with ❤️ by [Anjishnu Sengupta](https://github.com/AnjishnuSengupta)
