#!/usr/bin/env node
/**
 * NY-CLI Fallback Terminal UI
 * A stylish terminal UI for users without Bun installed
 * Uses ANSI escape codes for colors and navigation
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';

const API_BASE = process.env.NYCLI_API_BASE || 'http://127.0.0.1:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// NYANIME COLOR SCHEME (ANSI 256 color approximations)
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Nyanime colors using 256-color mode
  purple: '\x1b[38;5;135m',       // #8B5CF6
  blue: '\x1b[38;5;39m',          // #0EA5E9
  pink: '\x1b[38;5;207m',         // #D946EF
  white: '\x1b[38;5;255m',
  gray: '\x1b[38;5;245m',
  dimGray: '\x1b[38;5;240m',
  success: '\x1b[38;5;41m',       // #22C55E
  warning: '\x1b[38;5;214m',      // #F59E0B
  error: '\x1b[38;5;196m',        // #EF4444
  
  // Background
  bgDark: '\x1b[48;5;234m',
  bgDarker: '\x1b[48;5;233m',
  
  // Clear
  clearLine: '\x1b[2K',
  cursorUp: (n) => `\x1b[${n}A`,
  cursorDown: (n) => `\x1b[${n}B`,
  saveCursor: '\x1b[s',
  restoreCursor: '\x1b[u',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASCII BANNER WITH GRADIENT
// ═══════════════════════════════════════════════════════════════════════════════
const BANNER = `
${C.purple}${C.bold}  ███╗   ██╗${C.blue}██╗   ██╗${C.pink}       ██████╗${C.purple}██╗     ${C.blue}██╗
${C.purple}  ████╗  ██║${C.blue}╚██╗ ██╔╝${C.pink}      ██╔════╝${C.purple}██║     ${C.blue}██║
${C.purple}  ██╔██╗ ██║${C.blue} ╚████╔╝ ${C.pink}█████╗██║     ${C.purple}██║     ${C.blue}██║
${C.purple}  ██║╚██╗██║${C.blue}  ╚██╔╝  ${C.pink}╚════╝██║     ${C.purple}██║     ${C.blue}██║
${C.purple}  ██║ ╚████║${C.blue}   ██║   ${C.pink}      ╚██████╗${C.purple}███████╗${C.blue}██║
${C.purple}  ╚═╝  ╚═══╝${C.blue}   ╚═╝   ${C.pink}       ╚═════╝${C.purple}╚══════╝${C.blue}╚═╝${C.reset}
${C.gray}────────────── Stream Anime in Style ──────────────${C.reset}
`;

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function clearScreen() {
  stdout.write('\x1b[2J\x1b[H');
}

function printBanner() {
  stdout.write(BANNER);
}

function printDivider() {
  stdout.write(`${C.dimGray}${'─'.repeat(50)}${C.reset}\n`);
}

function printStatus(message, type = 'info') {
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
  const colors = { info: C.blue, success: C.success, warning: C.warning, error: C.error };
  stdout.write(`${colors[type]}${icons[type]}${C.reset} ${message}\n`);
}

async function spinner(promise, message) {
  let frame = 0;
  const interval = setInterval(() => {
    stdout.write(`\r${C.purple}${SPINNER[frame]}${C.reset} ${message}`);
    frame = (frame + 1) % SPINNER.length;
  }, 80);
  
  try {
    const result = await promise;
    clearInterval(interval);
    stdout.write(`\r${C.clearLine}`);
    return result;
  } catch (err) {
    clearInterval(interval);
    stdout.write(`\r${C.clearLine}`);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIVE SELECT WITH ARROW KEYS
// ═══════════════════════════════════════════════════════════════════════════════
async function interactiveSelect(items, title) {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    const maxVisible = Math.min(12, items.length);
    
    const render = () => {
      // Clear and redraw
      stdout.write(C.cursorUp(maxVisible + 3));
      
      stdout.write(`${C.pink}${C.bold}${title}${C.reset}\n`);
      stdout.write(`${C.dimGray}↑↓: navigate │ Enter: select │ q: quit${C.reset}\n`);
      
      const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), items.length - maxVisible));
      
      for (let i = 0; i < maxVisible; i++) {
        const idx = startIdx + i;
        if (idx >= items.length) {
          stdout.write(`${C.clearLine}\n`);
          continue;
        }
        
        const item = items[idx];
        const isSelected = idx === selectedIndex;
        const indicator = isSelected ? `${C.purple}▸${C.reset}` : ' ';
        const numColor = isSelected ? C.white : C.dimGray;
        const labelColor = isSelected ? `${C.white}${C.bold}` : C.gray;
        const badgeColor = C.blue;
        
        const num = String(idx + 1).padStart(3, ' ');
        const badge = item.badge ? ` ${badgeColor}(${item.badge})${C.reset}` : '';
        
        stdout.write(`${C.clearLine} ${indicator} ${numColor}${num}.${C.reset} ${labelColor}${item.label}${C.reset}${badge}\n`);
      }
      
      if (items.length > maxVisible) {
        stdout.write(`${C.dimGray}──── ${selectedIndex + 1}/${items.length} ────${C.reset}\n`);
      } else {
        stdout.write('\n');
      }
    };
    
    // Initial render space
    stdout.write('\n'.repeat(maxVisible + 3));
    render();
    
    // Enable raw mode for arrow key detection
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    const onKey = (key) => {
      // Handle arrow keys and special keys
      if (key === '\x1b[A' || key === 'k') { // Up
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      } else if (key === '\x1b[B' || key === 'j') { // Down
        selectedIndex = Math.min(items.length - 1, selectedIndex + 1);
        render();
      } else if (key === '\r' || key === '\n') { // Enter
        stdin.setRawMode(false);
        stdin.removeListener('data', onKey);
        stdout.write(`${C.success}✓${C.reset} Selected: ${items[selectedIndex].label}\n`);
        resolve(items[selectedIndex]);
      } else if (key === 'q' || key === '\x03') { // q or Ctrl+C
        stdin.setRawMode(false);
        stdout.write('\n');
        process.exit(0);
      }
    };
    
    stdin.on('data', onKey);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const body = await res.json();
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body.data;
}

function pickPlayableSource(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;

  const score = (url) => {
    const v = String(url || '').toLowerCase();
    if (!v.startsWith('http')) return -1;
    if (v.includes('.m3u8')) return 100;
    if (v.includes('/media') || v.includes('/videos/')) return 90;
    if (v.includes('.mp4') || v.includes('.webm')) return 80;
    return 20;
  };

  const ranked = [...list]
    .map((item) => ({ item, s: score(item?.url) }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s);

  return ranked.length ? ranked[0].item : list.find((s) => String(s?.url).startsWith('http')) || null;
}

function getPlayerCommand() {
  const candidates = ['mpv', 'vlc', 'iina'];
  for (const cmd of candidates) {
    try {
      const child = spawn('sh', ['-lc', `command -v ${cmd}`], { stdio: 'ignore' });
      if (child.pid) {
        child.kill();
        return cmd;
      }
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  clearScreen();
  printBanner();
  
  const rl = createInterface({ input: stdin, output: stdout });
  
  try {
    // Search
    let query = process.argv.slice(2).join(' ').trim();
    if (!query) {
      stdout.write(`${C.purple}❯${C.reset} `);
      query = await rl.question(`${C.white}Search anime: ${C.reset}`);
    }
    if (!query.trim()) {
      printStatus('Empty search query', 'error');
      process.exit(1);
    }
    
    // Fetch results
    const searchPromise = getJson(`/api/aniwatch?action=search&q=${encodeURIComponent(query)}&page=1`);
    const search = await spinner(searchPromise, `Searching "${query}"...`);
    const animes = (search?.animes || []).slice(0, 20);
    
    if (!animes.length) {
      printStatus('No anime found', 'warning');
      process.exit(1);
    }
    
    printStatus(`Found ${animes.length} anime`, 'success');
    stdout.write('\n');
    
    // Select anime
    rl.close();
    const animeItems = animes.map((a) => ({
      id: a.id,
      label: a.name || 'Untitled',
      badge: `sub ${a.episodes?.sub || 0} / dub ${a.episodes?.dub || 0}`,
    }));
    
    const selectedAnime = await interactiveSelect(animeItems, '🎬 Select Anime');
    
    // Fetch episodes
    const infoPromise = getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(selectedAnime.id)}`);
    const info = await spinner(infoPromise, `Loading "${selectedAnime.label}"...`);
    const episodes = (info?.episodes?.sub || []).slice(0, 100);
    
    if (!episodes.length) {
      printStatus('No episodes found', 'warning');
      process.exit(1);
    }
    
    printStatus(`${episodes.length} episodes available`, 'success');
    stdout.write('\n');
    
    // Select episode
    const episodeItems = episodes.map((e) => ({
      episodeId: e.episodeId,
      number: e.number,
      label: e.title || `Episode ${e.number}`,
    }));
    
    const selectedEpisode = await interactiveSelect(episodeItems, '📋 Select Episode');
    
    // Resolve stream
    const sourcesPromise = getJson(
      `/api/aniwatch?action=sources&episodeId=${encodeURIComponent(selectedEpisode.episodeId)}&category=sub`
    );
    const sourcesData = await spinner(sourcesPromise, `Resolving stream...`);
    const source = pickPlayableSource(sourcesData?.sources);
    
    if (!source?.url) {
      printStatus('No playable source found', 'error');
      process.exit(1);
    }
    
    const headers = Buffer.from(JSON.stringify(sourcesData?.headers || {})).toString('base64');
    const streamUrl = `${API_BASE}/api/stream?url=${encodeURIComponent(source.url)}&h=${encodeURIComponent(headers)}`;
    
    // Play
    const player = getPlayerCommand();
    if (!player) {
      printStatus(`No player found. Stream URL: ${streamUrl}`, 'warning');
      process.exit(1);
    }
    
    printStatus(`Starting ${player}...`, 'success');
    const title = `${selectedAnime.label} - Episode ${selectedEpisode.number}`;
    
    let args = [];
    if (player === 'mpv') {
      args = ['--ytdl=no', `--force-media-title=${title}`, streamUrl];
    } else if (player === 'vlc') {
      args = ['--meta-title', title, '--play-and-exit', streamUrl];
    } else {
      args = [streamUrl];
    }
    
    stdout.write(C.showCursor);
    const child = spawn(player, args, { stdio: 'inherit' });
    child.on('exit', () => {
      printStatus('Playback finished', 'info');
      process.exit(0);
    });
    
  } catch (err) {
    printStatus(`Error: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Clean up cursor on exit
process.on('exit', () => stdout.write(C.showCursor));
process.on('SIGINT', () => {
  stdout.write(C.showCursor);
  process.exit(0);
});

main();
