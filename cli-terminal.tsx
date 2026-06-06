#!/usr/bin/env bun
import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Picture, { TerminalInfoProvider } from 'ink-picture';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const API_BASE = process.env.NYCLI_API_BASE || 'http://localhost:43201';
const VERSION = '6.0.8';

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE & CLOUD SYNC CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
import { getFirebaseConfig } from './firebase-config.js';
const fbConfig = getFirebaseConfig();
const FIREBASE_PROJECT_ID = fbConfig.projectId;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_API_KEY = fbConfig.apiKey;
const NYANIME_BASE = 'https://www.nyanime.qzz.io';

// Clear screen on startup
process.stdout.write('\x1B[2J\x1B[0f');

// ═══════════════════════════════════════════════════════════════════════════════
// NYANIME COLOR SCHEME
// ═══════════════════════════════════════════════════════════════════════════════
const theme = {
  purple: '#8B5CF6',
  blue: '#0EA5E9',
  pink: '#D946EF',
  cyan: '#06B6D4',
  yellow: '#F59E0B',
  dimGray: '#6B7280',
  lightGray: '#9CA3AF',
  white: '#F9FAFB',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  green: '#22C55E',
  red: '#EF4444',
};

const GRADIENT = [theme.purple, theme.blue, theme.pink];

// ═══════════════════════════════════════════════════════════════════════════════
// ANSI TO INK TEXT PARSER
// ═══════════════════════════════════════════════════════════════════════════════
// Parses ANSI escape sequences and converts them to Ink <Text> components

interface TextSegment {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
}

// Strip incomplete ANSI escape sequences from string
function cleanAnsiLine(line: string): string {
  return line.replace(/\x1b\[?[0-9;]*$/g, '');
}

function parseAnsiToSegments(str: string): TextSegment[] {
  // Clean up any partial escape sequences
  const cleanStr = cleanAnsiLine(str);
  
  const segments: TextSegment[] = [];
  // ANSI escape sequence pattern - including cursor hide/show sequences
  const ansiPattern = /\x1b\[\??([0-9;]*)([a-zA-Z])/g;
  
  let lastIndex = 0;
  let currentFg: string | undefined;
  let currentBg: string | undefined;
  let bold = false;
  let dim = false;
  
  let match;
  while ((match = ansiPattern.exec(str)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const text = str.slice(lastIndex, match.index);
      if (text) {
        segments.push({ text, fg: currentFg, bg: currentBg, bold, dim });
      }
    }
    
    const command = match[2];
    
    // Only process color/style sequences (m command)
    if (command === 'm') {
      const codes = match[1].split(';').map(c => parseInt(c, 10));
      
      let i = 0;
      while (i < codes.length) {
        const code = codes[i];
        
        if (isNaN(code) || code === 0) {
          // Reset
          currentFg = undefined;
          currentBg = undefined;
          bold = false;
          dim = false;
          i++;
        } else if (code === 1) {
          bold = true;
          i++;
        } else if (code === 2) {
          dim = true;
          i++;
        } else if (code >= 30 && code <= 37) {
          // Standard foreground colors
          const colors = ['#000000', '#CC0000', '#00CC00', '#CCCC00', '#0000CC', '#CC00CC', '#00CCCC', '#CCCCCC'];
          currentFg = colors[code - 30];
          i++;
        } else if (code >= 40 && code <= 47) {
          // Standard background colors
          const colors = ['#000000', '#CC0000', '#00CC00', '#CCCC00', '#0000CC', '#CC00CC', '#00CCCC', '#CCCCCC'];
          currentBg = colors[code - 40];
          i++;
        } else if (code === 38) {
          // Extended foreground color
          if (codes[i + 1] === 5 && codes.length > i + 2) {
            // 256 color mode: 38;5;N
            currentFg = ansi256ToHex(codes[i + 2] || 0);
            i += 3;
          } else if (codes[i + 1] === 2 && codes.length > i + 4) {
            // True color mode: 38;2;R;G;B
            const r = codes[i + 2] || 0;
            const g = codes[i + 3] || 0;
            const b = codes[i + 4] || 0;
            currentFg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            i += 5;
          } else {
            i++;
          }
        } else if (code === 48) {
          // Extended background color
          if (codes[i + 1] === 5 && codes.length > i + 2) {
            // 256 color mode: 48;5;N
            currentBg = ansi256ToHex(codes[i + 2] || 0);
            i += 3;
          } else if (codes[i + 1] === 2 && codes.length > i + 4) {
            // True color mode: 48;2;R;G;B
            const r = codes[i + 2] || 0;
            const g = codes[i + 3] || 0;
            const b = codes[i + 4] || 0;
            currentBg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            i += 5;
          } else {
            i++;
          }
        } else {
          i++;
        }
      }
    }
    // Skip other escape sequences (like cursor hide \x1b[?25l)
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < str.length) {
    const text = str.slice(lastIndex);
    if (text) {
      segments.push({ text, fg: currentFg, bg: currentBg, bold, dim });
    }
  }
  
  return segments;
}

// Convert ANSI 256 color number to hex
function ansi256ToHex(n: number): string {
  if (n < 16) {
    // Standard colors
    const standard = [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ];
    return standard[n] || '#ffffff';
  } else if (n < 232) {
    // 216 color cube
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } else {
    // Grayscale
    const gray = 8 + (n - 232) * 10;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
}

// Component to render ANSI text using Ink Text components
function AnsiLine({ children }: { children: string }) {
  const segments = parseAnsiToSegments(children);
  
  if (segments.length === 0) {
    return <Text> </Text>;
  }
  
  return (
    <Text>
      {segments.map((seg, i) => (
        <Text 
          key={i} 
          color={seg.fg} 
          backgroundColor={seg.bg}
          bold={seg.bold}
          dimColor={seg.dim}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE (XDG Compliant)
// ═══════════════════════════════════════════════════════════════════════════════
const CONFIG_DIR = process.env.XDG_CONFIG_HOME 
  ? path.join(process.env.XDG_CONFIG_HOME, 'ny-cli')
  : path.join(os.homedir(), '.config', 'ny-cli');
const DATA_DIR = process.env.XDG_DATA_HOME
  ? path.join(process.env.XDG_DATA_HOME, 'ny-cli')
  : path.join(os.homedir(), '.local', 'share', 'ny-cli');

const AUTH_FILE = path.join(CONFIG_DIR, 'auth');
const HISTORY_FILE = path.join(DATA_DIR, 'history');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const ANIME4K_DIR = path.join(DATA_DIR, 'anime4k');

// Ensure directories exist
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ANIME4K_DIR, { recursive: true });
} catch {}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
interface Settings {
  anime4k: boolean;
  anime4kMode: 'A' | 'B' | 'C' | 'A+A' | 'B+B' | 'C+A';
}

const defaultSettings: Settings = {
  anime4k: false,
  anime4kMode: 'A',
};

function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch {}
  return defaultSettings;
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {}
}

// Check if Anime4K shaders are installed
function isAnime4kInstalled(): boolean {
  try {
    const shaderPath = path.join(ANIME4K_DIR, 'Anime4K_Clamp_Highlights.glsl');
    return fs.existsSync(shaderPath);
  } catch {
    return false;
  }
}

// Get Anime4K shader glsl-shaders string based on mode
function getAnime4kShaders(mode: string): string {
  const shaders = {
    'A': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'B': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'C': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'A+A': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'B+B': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Restore_CNN_Soft_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'C+A': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
  };
  const modeShaders = shaders[mode as keyof typeof shaders] || shaders['A'];
  return modeShaders.map(s => path.join(ANIME4K_DIR, s)).join(':');
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function isLoggedIn(): boolean {
  try {
    return fs.existsSync(AUTH_FILE) && fs.statSync(AUTH_FILE).size > 0;
  } catch {
    return false;
  }
}

function getUsername(): string {
  try {
    if (!isLoggedIn()) return '';
    const content = fs.readFileSync(AUTH_FILE, 'utf8');
    return content.split('\n')[0] || '';
  } catch {
    return '';
  }
}

function getToken(): string {
  try {
    if (!isLoggedIn()) return '';
    const content = fs.readFileSync(AUTH_FILE, 'utf8');
    return content.split('\n')[1] || '';
  } catch {
    return '';
  }
}

function getIdToken(): string {
  try {
    if (!isLoggedIn()) return '';
    const content = fs.readFileSync(AUTH_FILE, 'utf8');
    return content.split('\n')[2] || '';
  } catch {
    return '';
  }
}

function getRefreshToken(): string {
  try {
    if (!isLoggedIn()) return '';
    const content = fs.readFileSync(AUTH_FILE, 'utf8');
    return content.split('\n')[3] || '';
  } catch {
    return '';
  }
}

function saveAuth(username: string, token: string, idToken?: string, refreshToken?: string): void {
  try {
    const existingId = getIdToken();
    const existingRefresh = getRefreshToken();
    const finalIdToken = idToken || existingId;
    const finalRefreshToken = refreshToken || existingRefresh;
    fs.writeFileSync(AUTH_FILE, `${username}\n${token}\n${finalIdToken}\n${finalRefreshToken}`, { mode: 0o600 });
  } catch {}
}

function logout(): void {
  try {
    fs.unlinkSync(AUTH_FILE);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
interface HistoryEntry {
  id: string;
  title: string;
  episode: number;
  timestamp: number;
  category: 'sub' | 'dub';
  watchTime?: number;    // seconds watched
  duration?: number;     // total duration in seconds
  totalEpisodes?: number; // total episodes for this anime
}

const WATCH_PROGRESS_FILE = path.join(DATA_DIR, 'progress');

function getHistory(): HistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const content = fs.readFileSync(HISTORY_FILE, 'utf8');
    return content.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      const [rawId, title, ep, ts, cat, watchTime, duration, totalEps] = parts;
      // Migrate bare numeric IDs → anilist:: format for backward compat
      const id = rawId && /^\d+$/.test(rawId.trim()) ? `anilist::${rawId.trim()}` : rawId;
      return {
        id,
        title,
        episode: parseInt(ep) || 1,
        timestamp: parseInt(ts) || Date.now(),
        category: (cat === 'dub' ? 'dub' : 'sub') as 'sub' | 'dub',
        watchTime: parseInt(watchTime) || 0,
        duration: parseInt(duration) || 0,
        totalEpisodes: parseInt(totalEps) || 0,
      };
    }).slice(0, 20);
  } catch {
    return [];
  }
}


function saveToHistory(entry: HistoryEntry): void {
  try {
    const history = getHistory().filter(h => h.id !== entry.id);
    const newHistory = [entry, ...history].slice(0, 50);
    const content = newHistory.map(h => 
      `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
    ).join('\n');
    fs.writeFileSync(HISTORY_FILE, content);
    // Sync to cloud in background
    syncToCloud(entry).catch(() => {});
  } catch {}
}

// Save/load watch progress for specific episode
function saveWatchProgress(animeId: string, episode: number, watchTime: number, duration: number): void {
  try {
    const key = `${animeId}:${episode}`;
    let progress: Record<string, { watchTime: number; duration: number }> = {};
    
    if (fs.existsSync(WATCH_PROGRESS_FILE)) {
      try {
        progress = JSON.parse(fs.readFileSync(WATCH_PROGRESS_FILE, 'utf8'));
      } catch {}
    }
    
    progress[key] = { watchTime, duration };
    fs.writeFileSync(WATCH_PROGRESS_FILE, JSON.stringify(progress));
  } catch {}
}

function getWatchProgress(animeId: string, episode: number): { watchTime: number; duration: number } | null {
  try {
    if (!fs.existsSync(WATCH_PROGRESS_FILE)) return null;
    const progress = JSON.parse(fs.readFileSync(WATCH_PROGRESS_FILE, 'utf8'));
    return progress[`${animeId}:${episode}`] || null;
  } catch {
    return null;
  }
}

function getWatchPercentage(watchTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, (watchTime / duration) * 100);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE CLOUD SYNC
// ═══════════════════════════════════════════════════════════════════════════════
async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function verifyFirebaseUser(firebaseUid: string): Promise<{ valid: boolean; username?: string; photoUrl?: string }> {
  try {
    const response = await fetch(`${FIRESTORE_BASE}/users/${firebaseUid}?key=${FIREBASE_API_KEY}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) return { valid: false };
    
    const data = await response.json();
    if (data.fields) {
      const username = data.fields.username?.stringValue || 
                       data.fields.displayName?.stringValue || 
                       data.fields.email?.stringValue?.split('@')[0] ||
                       'User';
      const photoUrl = data.fields.photoURL?.stringValue ||
                       data.fields.photoUrl?.stringValue ||
                       data.fields.avatarUrl?.stringValue ||
                       data.fields.profilePicture?.stringValue;
      return { valid: true, username, photoUrl };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

async function fetchCloudHistory(): Promise<HistoryEntry[]> {
  const token = getToken();
  if (!token || !(await isOnline())) return [];
  
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-UID': token,
      },
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.success || !data.history) return [];
    
    return data.history.map((item: any) => ({
      id: item.animeSlug || item.id,
      title: item.animeTitle || item.title,
      episode: item.episodeNum || item.episode || 1,
      timestamp: item.timestamp || Date.now(),
      category: item.category === 'dub' ? 'dub' : 'sub',
      watchTime: item.watchTime || 0,
      duration: item.duration || 0,
      totalEpisodes: item.totalEpisodes || 0,
    }));
  } catch {
    return [];
  }
}

async function syncToCloud(entry: HistoryEntry): Promise<boolean> {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-UID': token,
      },
      body: JSON.stringify({
        animeSlug: entry.id,
        animeTitle: entry.title,
        episodeNum: entry.episode,
        category: entry.category,
        watchTime: entry.watchTime || 0,
        duration: entry.duration || 0,
        totalEpisodes: entry.totalEpisodes || 0,
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

async function mergeCloudHistory(): Promise<{ added: number; message: string }> {
  const token = getToken();
  if (!token) return { added: 0, message: 'Not logged in' };
  
  if (!(await isOnline())) {
    return { added: 0, message: 'Offline - using local history' };
  }
  
  try {
    const cloudHistory = await fetchCloudHistory();
    if (cloudHistory.length === 0) {
      return { added: 0, message: 'Cloud sync complete' };
    }
    
    const localHistory = getHistory();
    const localIds = new Set(localHistory.map(h => h.id));
    
    const newEntries = cloudHistory.filter(h => !localIds.has(h.id));
    
    if (newEntries.length > 0) {
      // Merge cloud entries into local
      const merged = [...localHistory];
      for (const entry of newEntries) {
        merged.push(entry);
      }
      // Sort by timestamp descending and limit
      merged.sort((a, b) => b.timestamp - a.timestamp);
      const content = merged.slice(0, 50).map(h => 
        `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
      ).join('\n');
      fs.writeFileSync(HISTORY_FILE, content);
    }
    
    return { added: newEntries.length, message: `Synced ${newEntries.length} items from cloud` };
  } catch (error) {
    return { added: 0, message: 'Cloud sync failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════
function blendHex(a: string, b: string, t: number): string {
  const parse = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, blue].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function gradientColor(index: number, total: number): string {
  if (total <= 1) return GRADIENT[0];
  const t = index / (total - 1);
  const scaled = t * (GRADIENT.length - 1);
  const idx = Math.min(Math.floor(scaled), GRADIENT.length - 2);
  const local = scaled - idx;
  return blendHex(GRADIENT[idx], GRADIENT[idx + 1], local);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASCII BANNER
// ═══════════════════════════════════════════════════════════════════════════════
const BANNER = [
  '███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗',
  '████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║',
  '██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║',
  '██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║',
  '██║ ╚████║   ██║         ╚██████╗███████╗██║',
  '╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝',
];

function Banner({ phase }: { phase: number }) {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      {BANNER.map((line, i) => (
        <Text key={i} color={gradientColor((i * 8 + phase) % 45, 45)} bold>
          {line}
        </Text>
      ))}
      <Text color={theme.dimGray} dimColor>
        ⟨ Your Gateway to Anime Streaming ⟩
      </Text>
      <Text color={theme.dimGray} dimColor>
        v{VERSION} • nyanime.qzz.io
      </Text>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPINNER
// ═══════════════════════════════════════════════════════════════════════════════
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner({ color = theme.purple, text = '' }: { color?: string; text?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color={color} bold>{SPINNER_FRAMES[frame]}</Text>
      {text && <Text color={theme.lightGray}> {text}</Text>}
    </Text>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// Pulsing text animation
function PulsingText({ children, color = theme.purple }: { children: string; color?: string }) {
  const [bright, setBright] = useState(true);
  
  useEffect(() => {
    const timer = setInterval(() => setBright(b => !b), 500);
    return () => clearInterval(timer);
  }, []);
  
  return <Text color={color} bold={bright} dimColor={!bright}>{children}</Text>;
}

// Typing effect animation
function TypeWriter({ text, speed = 50, color = theme.lightGray, onComplete }: { 
  text: string; 
  speed?: number; 
  color?: string;
  onComplete?: () => void;
}) {
  const [displayText, setDisplayText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  
  useEffect(() => {
    let index = 0;
    setDisplayText('');
    
    const typeTimer = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeTimer);
        onComplete?.();
      }
    }, speed);
    
    const cursorTimer = setInterval(() => setCursorVisible(v => !v), 400);
    
    return () => {
      clearInterval(typeTimer);
      clearInterval(cursorTimer);
    };
  }, [text, speed]);
  
  return (
    <Text color={color}>
      {displayText}
      <Text color={theme.cyan}>{cursorVisible && displayText.length < text.length ? '▊' : ''}</Text>
    </Text>
  );
}

// Animated progress bar
function ProgressBar({ progress, width = 20, color = theme.purple }: { 
  progress: number; 
  width?: number;
  color?: string;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimatedProgress(p => {
        if (p < progress) return Math.min(progress, p + 2);
        if (p > progress) return Math.max(progress, p - 2);
        return p;
      });
    }, 30);
    return () => clearInterval(timer);
  }, [progress]);
  
  const filled = Math.round((animatedProgress / 100) * width);
  const empty = width - filled;
  
  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color={theme.dimGray}>{'░'.repeat(empty)}</Text>
      <Text color={theme.lightGray}> {Math.round(animatedProgress)}%</Text>
    </Text>
  );
}

// Rainbow shimmer text
function ShimmerText({ text, speed = 100 }: { text: string; speed?: number }) {
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setOffset(o => (o + 1) % text.length), speed);
    return () => clearInterval(timer);
  }, [text.length, speed]);
  
  return (
    <Text>
      {text.split('').map((char, i) => (
        <Text key={i} color={gradientColor((i + offset) % text.length, text.length)}>
          {char}
        </Text>
      ))}
    </Text>
  );
}

// Bouncing dots loader
function BouncingDots({ color = theme.purple }: { color?: string }) {
  const [phase, setPhase] = useState(0);
  const dots = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'];
  
  useEffect(() => {
    const timer = setInterval(() => setPhase(p => (p + 1) % dots.length), 100);
    return () => clearInterval(timer);
  }, []);
  
  return (
    <Text color={color} bold>
      {dots[phase]} {dots[(phase + 2) % dots.length]} {dots[(phase + 4) % dots.length]}
    </Text>
  );
}

// Fade in/out box border
function AnimatedBorder({ children, color = theme.purple }: { children: React.ReactNode; color?: string }) {
  const [borderColor, setBorderColor] = useState(color);
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setPhase(p => (p + 1) % 30);
    }, 100);
    return () => clearInterval(timer);
  }, [color]);
  
  useEffect(() => {
    const brightness = Math.sin(phase * 0.2) * 0.3 + 0.7;
    setBorderColor(blendHex(color, theme.dimGray, 1 - brightness));
  }, [phase, color]);
  
  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
      {children}
    </Box>
  );
}

// Wave text animation (color wave moving through text)
function WaveText({ text, colors = GRADIENT, speed = 100 }: { text: string; colors?: string[]; speed?: number }) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setPhase(p => (p + 1) % 100), speed);
    return () => clearInterval(timer);
  }, [speed]);
  
  const chars = text.split('');
  return (
    <Text>
      {chars.map((char, i) => {
        const colorIdx = (i + phase) % colors.length;
        return <Text key={i} color={colors[colorIdx]} bold>{char}</Text>;
      })}
    </Text>
  );
}

// Fade in animation for components
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  
  useEffect(() => {
    const delayTimer = setTimeout(() => {
      setVisible(true);
      let step = 0;
      const fadeTimer = setInterval(() => {
        step++;
        setOpacity(Math.min(1, step * 0.2));
        if (step >= 5) clearInterval(fadeTimer);
      }, 50);
    }, delay);
    return () => clearTimeout(delayTimer);
  }, [delay]);
  
  if (!visible) return null;
  return <Text dimColor={opacity < 1}>{children}</Text>;
}

// Scrolling marquee text animation - scrolls from left to right and fades out
function ScrollingWelcome({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const termWidth = process.stdout.columns || 80;
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState(false);
  
  const centerPos = Math.floor((termWidth - text.length) / 2);
  const maxPos = centerPos + 30;
  
  useEffect(() => {
    const timer = setInterval(() => {
      setPosition(p => {
        const newPos = p + 1; // Slower: move 1 char at a time
        if (newPos > maxPos) {
          clearInterval(timer);
          setDone(true);
          return maxPos;
        }
        return newPos;
      });
    }, 60); // Slower: 60ms per step
    return () => clearInterval(timer);
  }, [maxPos]);
  
  // Handle completion via useEffect, not in render
  useEffect(() => {
    if (done && onComplete) {
      const timeout = setTimeout(onComplete, 100);
      return () => clearTimeout(timeout);
    }
  }, [done, onComplete]);
  
  if (done) return null;
  
  const padding = Math.max(0, position);
  const isFading = position > centerPos;
  
  return (
    <Box>
      <Text>{' '.repeat(padding)}</Text>
      <Text dimColor={isFading}>
        {text.split('').map((char, i) => {
          const colorIdx = (i + Math.floor(position / 3)) % GRADIENT.length;
          return (
            <Text key={i} color={GRADIENT[colorIdx]} bold>
              {char}
            </Text>
          );
        })}
      </Text>
    </Box>
  );
}

// Goodbye message that scrolls and fades
function GoodbyeMessage({ onComplete }: { onComplete?: () => void }) {
  const messages = [
    '~ Sayounara! ~',
    '🌸 Mata ne! 🌸',
    '👋 Jaa ne! 👋'
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  return <ScrollingWelcome text={message} onComplete={onComplete} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIME ARTWORK DISPLAY (using ink-picture)
// ═══════════════════════════════════════════════════════════════════════════════
// Image URL cache to avoid re-fetching
const imageUrlCache = new Map<string, string>();

// Get image URL for anime title
async function getAnimeImageUrl(title: string): Promise<string | null> {
  const cacheKey = title.toLowerCase().trim();
  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey) || null;
  }
  
  try {
    // Try Jikan API (MyAnimeList)
    const searchQuery = encodeURIComponent(title.split(' ').slice(0, 3).join(' '));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${searchQuery}&order_by=members&sort=desc&limit=1&sfw=true`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      const anime = data?.data?.[0];
      const imageUrl = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url;
      if (imageUrl) {
        imageUrlCache.set(cacheKey, imageUrl);
        return imageUrl;
      }
    }
  } catch {
    // Failed silently
  }
  
  return null;
}

// Artwork display component using Chafa
function AnimeArtwork({ title, imageUrl, width = 25, height = 12 }: { title: string; imageUrl?: string; width?: number; height?: number }) {
  const [loading, setLoading] = useState(!imageUrl);
  const [error, setError] = useState(false);
  const [imgPath, setImgPath] = useState<string | null>(null);
  const prevImgRef = React.useRef<string | null>(null);
  
  useEffect(() => {
    let active = true;

    async function loadArtwork(url: string) {
      try {
        setLoading(true);
        // Download image to temp file
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `ny-cli-art-${Date.now()}.jpg`);
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Fetch failed');
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(buffer));
        
        if (active) {
          setImgPath(tmpFile);
          setError(false);
        }
        if (active) setLoading(false);
      } catch (err) {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }

    if (imageUrl) {
      prevImgRef.current = imageUrl;
      loadArtwork(imageUrl);
      return () => { active = false; };
    }
    
    if (!title) {
      setImgPath(null);
      setLoading(false);
      return;
    }
    
    if (!prevImgRef.current) {
      setLoading(true);
    }
    
    const timer = setTimeout(() => {
      getAnimeImageUrl(title).then((url) => {
        if (url && active) {
          prevImgRef.current = url;
          loadArtwork(url);
        } else if (active) {
          setLoading(false);
          setError(true);
        }
      }).catch(() => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      });
    }, 300);
    
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [title, imageUrl]);
  
  if (!title && !imageUrl && !imgPath) {
    return (
      <Box width={width} height={height} borderStyle="round" borderColor={theme.dimGray} justifyContent="center" alignItems="center">
        <Text color={theme.dimGray}>No Art</Text>
      </Box>
    );
  }
  
  if (loading && !imgPath) {
    return (
      <Box width={width} height={height} borderStyle="round" borderColor={theme.purple} justifyContent="center" alignItems="center" flexDirection="column">
        <BouncingDots color={theme.purple} />
        <Text color={theme.dimGray} dimColor>Loading...</Text>
      </Box>
    );
  }
  
  if ((!imgPath && !loading) || error) {
    return (
      <Box width={width} height={height} borderStyle="round" borderColor={theme.dimGray} justifyContent="center" alignItems="center">
        <Text color={theme.dimGray}>[!] No art</Text>
      </Box>
    );
  }
  
  return (
    <Box width={width} height={height} borderStyle="round" borderColor={theme.purple}>
      <Box width={Math.max(1, width - 2)} height={Math.max(1, height - 2)} overflow="hidden">
        <Picture src={imgPath!} width={Math.max(1, width - 2)} height={Math.max(1, height - 2)} />
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELECT INPUT WITH RIPPLE ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════
interface SelectItem {
  id?: string;
  episodeId?: string;
  number?: number;
  label: string;
  badge?: string;
  value?: string;
  icon?: string;
  imageUrl?: string; // For artwork display
}

interface SelectInputProps {
  items: SelectItem[];
  onSelect: (item: SelectItem, index: number) => void;
  onBack?: () => void;
  title?: string;
  color?: string;
  showBorder?: boolean;
  showArtwork?: boolean; // Enable artwork display
  showNumbers?: boolean; // Show quick-select numbers (default: true)
  enableSearch?: boolean; // Enable search/filter for large lists
  onAction?: (action: string, item: SelectItem) => void;
}

function SelectList({ items, onSelect, onBack, title, color = theme.purple, showBorder = true, showArtwork = false, showNumbers = true, enableSearch = false, onAction }: SelectInputProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rippleIndex, setRippleIndex] = useState(-1);
  const [ripplePhase, setRipplePhase] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Filter items by search query
  const filteredItems = enableSearch && searchQuery
    ? items.filter(item => {
        const num = item.number?.toString() || '';
        const label = item.label.toLowerCase();
        const query = searchQuery.toLowerCase();
        return num.startsWith(query) || label.includes(query);
      })
    : items;

  const maxVisible = Math.min(10, filteredItems.length);
  const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible));
  const visibleItems = filteredItems.slice(startIdx, startIdx + maxVisible);

  // Get current selected item for artwork
  const selectedItem = filteredItems[selectedIndex];

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (rippleIndex >= 0) {
      const timer = setInterval(() => {
        setRipplePhase((p) => {
          if (p >= 5) {
            clearInterval(timer);
            setRippleIndex(-1);
            return 0;
          }
          return p + 1;
        });
      }, 60);
      return () => clearInterval(timer);
    }
  }, [rippleIndex]);

  useInput((input, key) => {
    // Handle search mode toggle
    if (enableSearch && input === '/' && !isSearching) {
      setIsSearching(true);
      return;
    }
    
    // In search mode, handle text input
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery('');
      } else if (key.return) {
        setIsSearching(false);
      } else if (key.backspace || key.delete) {
        setSearchQuery(q => q.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery(q => q + input);
      }
      return;
    }
    
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(filteredItems.length - 1, i + 1));
    } else if (key.return) {
      if (filteredItems.length > 0) {
        setRippleIndex(selectedIndex);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[selectedIndex], selectedIndex);
        }, 300);
      }
    } else if (input === 'q') {
      process.exit(0);
    } else if (key.escape || input === 'b' || key.leftArrow) {
      if (searchQuery) {
        setSearchQuery('');
      } else if (onBack) {
        onBack();
      }
    } else if (onAction && (input === 'd' || input === 'a')) {
      if (filteredItems.length > 0) {
        onAction(input, filteredItems[selectedIndex]);
      }
    } else if (enableSearch && /^[0-9]$/.test(input)) {
      // Quick jump: type episode number directly
      setSearchQuery(q => q + input);
    } else if (showNumbers && /^[1-9]$/.test(input) && !enableSearch) {
      const num = parseInt(input, 10) - 1 + startIdx;
      if (num < filteredItems.length) {
        setSelectedIndex(num);
        setRippleIndex(num);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[num], num);
        }, 300);
      }
    }
  });

  const rippleChars = ['○', '◎', '●', '◉', '◎', '○'];
  const getRippleChar = (phase: number) => rippleChars[Math.min(phase, rippleChars.length - 1)];
  const termWidth = process.stdout.columns || 80;
  const maxLabelLen = Math.max(30, termWidth - 25);

  const content = (
    <Box flexDirection="column">
      {title && <Text color={color} bold>{title}</Text>}
      {title && (
        <Text color={theme.dimGray} dimColor>
          ↑↓: navigate │ Enter: select │ b: back{enableSearch ? ' │ Type number to jump' : ''}{onAction ? ' │ d: dl │ a: dl all' : ''} │ q: quit
        </Text>
      )}
      {/* Search input for large lists */}
      {enableSearch && (
        <Box marginTop={1}>
          <Text color={theme.cyan}>[S] </Text>
          <Text color={searchQuery ? theme.white : theme.dimGray}>
            {searchQuery || 'Type episode number...'}
          </Text>
          {searchQuery && (
            <Text color={theme.dimGray}> ({filteredItems.length} matches)</Text>
          )}
        </Box>
      )}
      <Box marginTop={title ? 1 : 0} flexDirection="column">
        {visibleItems.map((item, idx) => {
          const actualIdx = startIdx + idx;
          const isSelected = actualIdx === selectedIndex;
          const isRippling = actualIdx === rippleIndex;

          const rippleColor = isRippling
            ? blendHex(theme.purple, theme.pink, ripplePhase / 5)
            : color;

          const indicator = isRippling
            ? getRippleChar(ripplePhase)
            : isSelected
              ? '▸'
              : ' ';

          const displayNum = idx + 1;
          const icon = item.icon ? `${item.icon} ` : '';
          const badgeStr = item.badge ? ` (${item.badge})` : '';
          const fullText = `${icon}${item.label}${badgeStr}`;
          const labelText = fullText.length > maxLabelLen ? fullText.slice(0, maxLabelLen - 3) + '...' : fullText;
          const numPrefix = showNumbers ? `${String(displayNum).padStart(2, ' ')}) ` : '';

          return (
            <Box key={actualIdx}>
              <Text color={isRippling ? rippleColor : isSelected ? color : theme.dimGray}>
                {indicator}
              </Text>
              {showNumbers && (
                <Text color={theme.dimGray}>{numPrefix}</Text>
              )}
              {!showNumbers && <Text> </Text>}
              <Text color={isSelected ? theme.white : theme.lightGray} bold={isSelected}>
                {labelText}
              </Text>
            </Box>
          );
        })}
      </Box>
      {items.length > maxVisible && (
        <Box marginTop={1}>
          <Text color={theme.dimGray} dimColor>
            ──── {selectedIndex + 1}/{items.length} ────
          </Text>
        </Box>
      )}
    </Box>
  );

  // With artwork layout
  if (showArtwork) {
    const artworkWidth = 30;  // Reasonable size
    const artworkHeight = 15;
    
    return (
      <Box flexDirection="row">
        {/* Artwork panel on the left */}
        <Box flexDirection="column" marginRight={2} width={artworkWidth}>
          <AnimeArtwork 
            title={selectedItem?.label || ''} 
            imageUrl={selectedItem?.imageUrl}
            width={artworkWidth} 
            height={artworkHeight} 
          />
          {/* Show selected anime title under artwork */}
          {selectedItem && (
            <Box marginTop={1}>
              <Text color={theme.cyan} wrap="truncate-end">
                {selectedItem.label.slice(0, artworkWidth - 2)}
              </Text>
            </Box>
          )}
        </Box>
        
        {/* Selection list on the right */}
        {showBorder ? (
          <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} paddingY={1} flexGrow={1}>
            {content}
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            {content}
          </Box>
        )}
      </Box>
    );
  }

  if (showBorder) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} paddingY={1}>
        {content}
      </Box>
    );
  }

  return content;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT INPUT
// ═══════════════════════════════════════════════════════════════════════════════
interface TextInputProps {
  label?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  color?: string;
}

function InputBox({ label, onSubmit, onCancel, placeholder = '', color = theme.purple }: TextInputProps) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      {label && <Text color={theme.pink} bold>{label}</Text>}
      <Box marginTop={1} borderStyle="round" borderColor={color} paddingX={1}>
        <Text color={color}>❯ </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => v.trim() && onSubmit(v.trim())}
          placeholder={placeholder}
        />
      </Box>
      <Text color={theme.dimGray} dimColor>
        Enter: confirm │ Escape: cancel
      </Text>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS BAR
// ═══════════════════════════════════════════════════════════════════════════════
interface StatusProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  loading?: boolean;
}

function StatusBar({ message, type = 'info', loading = false }: StatusProps) {
  const [pulsePhase, setPulsePhase] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setPulsePhase(p => (p + 1) % 20), 150);
    return () => clearInterval(timer);
  }, []);
  
  const colors: Record<string, string> = {
    info: theme.blue,
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
  };
  const icons: Record<string, string> = {
    info: '[i]',
    success: '[+]',
    warning: '[!]',
    error: '[x]',
  };
  
  // Animated border color
  const baseBorderColor = type === 'success' ? theme.success : 
                          type === 'error' ? theme.error :
                          type === 'warning' ? theme.warning : theme.dimGray;
  const brightness = Math.sin(pulsePhase * 0.3) * 0.2 + 0.8;
  const borderColor = blendHex(baseBorderColor, theme.dimGray, 1 - brightness);

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      {loading ? (
        <Spinner color={colors[type]} text={message} />
      ) : (
        <Text>
          <Text color={colors[type]} bold>{icons[type]}</Text>
          <Text color={theme.lightGray}> {message}</Text>
        </Text>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
async function getJson(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  const body = JSON.parse(text);
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALLANIME CLIENT-SIDE STREAM RESOLVER
// Mirrors ani-cli logic: called locally (no CF block) to get real m3u8/mp4 URLs
// ═══════════════════════════════════════════════════════════════════════════════

const ALLANIME_API   = 'https://api.allanime.day/api';
const ALLANIME_BASE  = 'allanime.day';
const ALLANIME_REFR  = 'https://youtu-chan.com';
const ALLANIME_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const ALLANIME_EP_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';

// Cache: title → AllAnime _id
const aaIdCache = new Map<string, string>();

async function aaFetch(body: object): Promise<any> {
  const res = await fetch(ALLANIME_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ALLANIME_UA,
      'Referer': ALLANIME_REFR,
      'Origin': ALLANIME_REFR,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`AllAnime HTTP ${res.status}`);
  return res.json();
}

async function aaFetchGET(params: URLSearchParams): Promise<any> {
  const url = `${ALLANIME_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': ALLANIME_UA,
      'Referer': ALLANIME_REFR,
      'Origin': ALLANIME_REFR,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`AllAnime HTTP ${res.status}`);
  return res.json();
}

// Search AllAnime and return best matching _id for the given title
async function aaSearchId(title: string, malId?: number): Promise<string | null> {
  const cacheKey = `${malId || ''}_${title}`;
  if (aaIdCache.has(cacheKey)) return aaIdCache.get(cacheKey)!;

  const searchGql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
  try {
    const data = await aaFetch({
      variables: { search: { allowAdult: false, allowUnknown: false, query: title }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'ALL' },
      query: searchGql,
    });
    const edges: Array<{ _id: string; name: string; availableEpisodes: any }> = data?.data?.shows?.edges || [];
    if (!edges.length) return null;

    // Pick best match: prefer one with most episodes (for series vs. specials)
    let best = edges[0];
    for (const e of edges) {
      const eEps = (e.availableEpisodes?.sub || 0) + (e.availableEpisodes?.dub || 0);
      const bEps = (best.availableEpisodes?.sub || 0) + (best.availableEpisodes?.dub || 0);
      if (eEps > bEps) best = e;
    }
    aaIdCache.set(cacheKey, best._id);
    return best._id;
  } catch {
    return null;
  }
}

// Port of ani-cli's hex substitution cipher for "--" encoded provider URLs
function aaDecodeProviderHex(raw: string): string {
  if (!raw.startsWith('--')) return raw;
  const hexMap: Record<string, string> = {
    '79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J','73':'K','74':'L','75':'M','76':'N','77':'O',
    '68':'P','69':'Q','6a':'R','6b':'S','6c':'T','6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z',
    '59':'a','5a':'b','5b':'c','5c':'d','5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n','57':'o',
    '48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x','41':'y','42':'z',
    '08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7','00':'8','01':'9',
    '15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#','63':'[','65':']','78':'@',
    '19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+','14':',','03':';','05':'=','1d':'%',
  };
  const hexStr = raw.slice(2); // strip leading '--'
  let result = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    const byte = hexStr.slice(i, i + 2).toLowerCase();
    if (byte === '--') { result += '\n'; continue; }
    result += hexMap[byte] || '';
  }
  return result.replace('/clock', '/clock.json');
}

// Decrypt AllAnime "tobeparsed" AES-256-CTR payload
function aaDecrypt(tobeparsed: string): string {
  const { createDecipheriv, createHash } = require('node:crypto');
  const key = createHash('sha256').update('Xot36i3lK3:v1').digest();
  const buf = Buffer.from(tobeparsed, 'base64');
  // bytes 1-12 are the IV, then 00000002 suffix
  const ivBytes = buf.slice(1, 13);
  const iv = Buffer.concat([ivBytes, Buffer.from([0, 0, 0, 2])]);
  const ciphertext = buf.slice(13, buf.length - 16);
  const decipher = createDecipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Process raw AllAnime API response — decrypt if needed
function aaProcessResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const tobeparsed = parsed?.data?.episode?.sourceUrls
      ? null // already parsed JSON
      : null;
    if (tobeparsed) return aaDecrypt(tobeparsed);
    return raw;
  } catch {
    return raw;
  }
}

// Fetch the clock.json from AllAnime's CDN to get the actual m3u8 URL
async function aaResolveCdnUrl(cdnPath: string): Promise<string | null> {
  try {
    const url = `https://${ALLANIME_BASE}${cdnPath}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': ALLANIME_UA, 'Referer': ALLANIME_REFR },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Extract links array: {"links":[{"link":"https://...","resolutionStr":"1080p"},...]}
    try {
      const json = JSON.parse(text);
      const links: Array<{ link: string; resolutionStr?: string; hls?: boolean }> = json?.links || [];
      if (!links.length) return null;
      // Prefer highest resolution m3u8
      links.sort((a, b) => {
        const aRes = parseInt(a.resolutionStr || '0') || 0;
        const bRes = parseInt(b.resolutionStr || '0') || 0;
        return bRes - aRes;
      });
      return links[0]?.link || null;
    } catch {
      // Try regex for hls url
      const match = text.match(/"link"\s*:\s*"([^"]+)"/);
      return match ? match[1] : null;
    }
  } catch {
    return null;
  }
}

// Resolve a Mp4Upload page to its direct mp4 URL
async function aaResolveMp4Upload(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': ALLANIME_UA, 'Referer': ALLANIME_REFR },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    const match = text.match(/src:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

interface AllAnimeSource {
  url: string;
  quality: string;
  type: 'hls' | 'mp4';
  referer: string;
}

// Main resolver: title + episode number → direct stream URL
export async function resolveAllAnimeStream(
  title: string,
  epNo: number,
  mode: 'sub' | 'dub' = 'sub',
  malId?: number
): Promise<AllAnimeSource | null> {
  try {
    // 1. Get AllAnime show ID
    const showId = await aaSearchId(title, malId);
    if (!showId) return null;

    // 2. Fetch episode source URLs (try persisted query first, then POST fallback)
    let epData: any;
    try {
      const params = new URLSearchParams();
      params.set('variables', JSON.stringify({ showId, translationType: mode, episodeString: String(epNo) }));
      params.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: ALLANIME_EP_HASH } }));
      epData = await aaFetchGET(params);
    } catch {
      const epGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;
      epData = await aaFetch({
        variables: { showId, translationType: mode, episodeString: String(epNo) },
        query: epGql,
      });
    }

    // 3. Check for tobeparsed encryption
    const rawStr = JSON.stringify(epData);
    let sourceUrls: Array<{ sourceUrl: string; sourceName: string }> = [];

    if (rawStr.includes('"tobeparsed"')) {
      // Extract and decrypt
      const tobeparsedMatch = rawStr.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
      if (!tobeparsedMatch) return null;
      try {
        const decrypted = aaDecrypt(tobeparsedMatch[1]);
        // Parse sourceUrls from decrypted JSON fragments
        const urlMatches = decrypted.matchAll(/"sourceUrl"\s*:\s*"([^"]+)".*?"sourceName"\s*:\s*"([^"]+)"/g);
        for (const m of urlMatches) {
          sourceUrls.push({ sourceUrl: m[1].replace(/\\/g, ''), sourceName: m[2] });
        }
      } catch { return null; }
    } else {
      sourceUrls = epData?.data?.episode?.sourceUrls || [];
    }

    if (!sourceUrls.length) return null;

    // 4. Try providers in order: wixmp (CDN m3u8), mp4upload, sharepoint
    // Provider name patterns from ani-cli:
    //   "Default" → wixmp CDN  (m3u8, best)
    //   "Yt-mp4"  → youtube    (mp4)
    //   "S-mp4"   → sharepoint (mp4)
    //   "Mp4"     → mp4upload  (mp4)
    const providerOrder = ['Default', 'Luf-mp4', 'Yt-mp4', 'S-mp4', 'Mp4', 'Ok', 'Ac', 'Sak', 'Kir'];

    for (const providerName of providerOrder) {
      const entry = sourceUrls.find(s => s.sourceName === providerName);
      if (!entry) continue;

      let providerUrl = entry.sourceUrl;
      // Decode "--" hex encoded URLs
      if (providerUrl.startsWith('--')) {
        providerUrl = aaDecodeProviderHex(providerUrl);
      }
      // Unescape slashes
      providerUrl = providerUrl.replace(/\\\//g, '/');

      if (providerName === 'Default') {
        // wixmp: path like "/apivtwo/clock?id=..." → fetch clock.json
        const m3u8 = await aaResolveCdnUrl(providerUrl);
        if (m3u8) return { url: m3u8, quality: 'Auto (m3u8)', type: 'hls', referer: ALLANIME_REFR };
      } else if (providerName === 'Mp4') {
        // mp4upload: full page URL → extract src
        if (providerUrl.startsWith('http')) {
          const mp4 = await aaResolveMp4Upload(providerUrl);
          if (mp4) return { url: mp4, quality: 'mp4upload', type: 'mp4', referer: 'https://www.mp4upload.com/' };
        }
      } else if (providerName === 'S-mp4' || providerName === 'Yt-mp4') {
        // Direct mp4 links
        if (providerUrl.startsWith('http')) {
          return { url: providerUrl, quality: providerName, type: 'mp4', referer: ALLANIME_REFR };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function pickPlayableSource(sources: any[]) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;

  const score = (url: string, type?: string) => {
    if (type === 'embed') return 10; // always lowest — opened in browser
    const v = String(url || '').toLowerCase();
    if (!v.startsWith('http')) return -1;
    if (v.includes('.m3u8')) return 100;
    if (v.includes('/media') || v.includes('/videos/')) return 90;
    if (v.includes('.mp4') || v.includes('.webm')) return 80;
    return 20;
  };

  const ranked = [...list]
    .map((item) => ({ item, s: score(item?.url, item?.type) }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s);

  return ranked.length ? ranked[0].item : list.find((s) => String(s?.url).startsWith('http')) || null;
}

function isEmbedSource(source: any): boolean {
  if (!source) return false;
  if (source.type === 'embed') return true;
  const url = String(source.url || '').toLowerCase();
  return url.includes('megaplay.buzz') || url.includes('anikoto.live') || url.includes('/stream/mal/');
}

function getPlayerCommand(): string | null {
  const candidates = ['mpv', 'vlc', 'iina'];
  for (const cmd of candidates) {
    try {
      const result = spawnSync('which', [cmd], { encoding: 'utf8' });
      if (result.status === 0 && result.stdout.trim()) {
        return cmd;
      }
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
interface SettingsScreenProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onBack: () => void;
}

function SettingsScreen({ settings, onUpdate, onBack }: SettingsScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  
  const anime4kInstalled = isAnime4kInstalled();
  const modes = ['A', 'B', 'C', 'A+A', 'B+B', 'C+A'] as const;
  
  const menuItems = [
    { key: 'anime4k', label: 'Anime4K Upscaling', type: 'toggle' },
    { key: 'anime4kMode', label: 'Anime4K Mode', type: 'select' },
    { key: 'download', label: 'Download Anime4K Shaders', type: 'action' },
    { key: 'back', label: '← Back', type: 'action' },
  ];
  
  const downloadAnime4k = async () => {
    setDownloading(true);
    setDownloadStatus('Downloading Anime4K shaders...');
    
    try {
      const targetDir = ANIME4K_DIR;
      
      // Download from GitHub releases
      const version = 'v4.0.1';
      const url = `https://github.com/bloc97/Anime4K/releases/download/${version}/Anime4K_v4.0.zip`;
      const zipPath = path.join(targetDir, 'Anime4K.zip');
      
      setDownloadStatus('Downloading shaders...');
      execSync(`curl -sL "${url}" -o "${zipPath}"`, { stdio: 'pipe' });
      
      setDownloadStatus('Extracting shaders...');
      execSync(`cd "${targetDir}" && unzip -o Anime4K.zip && mv Anime4K_v4.0/* . 2>/dev/null || true`, { stdio: 'pipe' });
      
      // Cleanup
      execSync(`rm -f "${zipPath}" && rm -rf "${targetDir}/Anime4K_v4.0"`, { stdio: 'pipe' });
      
      setDownloadStatus('✓ Anime4K shaders installed successfully!');
      setTimeout(() => setDownloadStatus(''), 3000);
    } catch (err: any) {
      setDownloadStatus(`✗ Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };
  
  useInput((input, key) => {
    if (key.escape || (input === 'b' && selectedIndex !== 0)) {
      onBack();
      return;
    }
    if (input === 'q') {
      process.exit(0);
    }
    
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(menuItems.length - 1, i + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      
      if (item.key === 'anime4k') {
        if (anime4kInstalled) {
          onUpdate({ ...settings, anime4k: !settings.anime4k });
        }
      } else if (item.key === 'anime4kMode') {
        const currentIdx = modes.indexOf(settings.anime4kMode);
        const nextIdx = (currentIdx + 1) % modes.length;
        onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
      } else if (item.key === 'download') {
        if (!downloading) {
          downloadAnime4k();
        }
      } else if (item.key === 'back') {
        onBack();
      }
    } else if (key.leftArrow && menuItems[selectedIndex].key === 'anime4kMode') {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : modes.length - 1;
      onUpdate({ ...settings, anime4kMode: modes[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === 'anime4kMode') {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const nextIdx = (currentIdx + 1) % modes.length;
      onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
    }
  });
  
  return (
    <Box flexDirection="column" width={60}>
      <Box borderStyle="round" borderColor={theme.cyan} paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.cyan} bold>[⚙] Settings</Text>
        <Text color={theme.dimGray}>{'─'.repeat(50)}</Text>
        <Text> </Text>
        
        {/* Anime4K Toggle */}
        <Box>
          <Text color={selectedIndex === 0 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 0 ? '▸ ' : '  '}
            Anime4K Upscaling:{' '}
          </Text>
          {anime4kInstalled ? (
            <Text color={settings.anime4k ? theme.green : theme.red}>
              {settings.anime4k ? '[ON]' : '[OFF]'}
            </Text>
          ) : (
            <Text color={theme.dimGray}>[Not Installed]</Text>
          )}
        </Box>
        
        {/* Anime4K Mode */}
        <Box>
          <Text color={selectedIndex === 1 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 1 ? '▸ ' : '  '}
            Anime4K Mode:{' '}
          </Text>
          <Text color={selectedIndex === 1 ? theme.cyan : theme.lightGray}>
            {'◀ '}{settings.anime4kMode}{' ▶'}
          </Text>
        </Box>
        
        <Text> </Text>
        
        {/* Download Action */}
        <Box>
          <Text color={selectedIndex === 2 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 2 ? '▸ ' : '  '}
            {anime4kInstalled ? '↻ Re-download' : '↓ Download'} Anime4K Shaders
          </Text>
        </Box>
        
        {/* Back */}
        <Box>
          <Text color={selectedIndex === 3 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 3 ? '▸ ' : '  '}
            ← Back
          </Text>
        </Box>
        
        {downloadStatus && (
          <>
            <Text> </Text>
            <Text color={downloadStatus.startsWith('✓') ? theme.green : downloadStatus.startsWith('✗') ? theme.red : theme.cyan}>
              {downloadStatus}
            </Text>
          </>
        )}
      </Box>
      
      <Box marginTop={1}>
        <Text color={theme.dimGray}>
          {anime4kInstalled 
            ? 'Anime4K shaders enhance video quality for older anime' 
            : 'Download shaders first to enable upscaling'}
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color={theme.dimGray}>
          Mode A: Best for 1080p | Mode B: Soft edges | Mode C: Denoise
        </Text>
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
type Screen = 
  | 'main-menu'
  | 'search'
  | 'anime-select'
  | 'audio-select'
  | 'episode-select'
  | 'continue'
  | 'profile'
  | 'login'
  | 'login-token'
  | 'login-waiting'
  | 'settings'
  | 'auto-advance'
  | 'downloading'
  | 'help';

const initialQuery = process.argv.slice(2).join(' ').trim();

export interface DownloadTask {
  id: string;
  anilistId?: string;
  animeTitle: string;
  episodeNumber: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  message?: string;
}

function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(initialQuery ? 'search' : 'main-menu');
  const [animes, setAnimes] = useState<any[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<any>(null);
  const [animeInfo, setAnimeInfo] = useState<any>(null);
  const [audioType, setAudioType] = useState<'sub' | 'dub'>('sub');
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [autoAdvanceData, setAutoAdvanceData] = useState<any>(null);
  const [appSettings, setAppSettings] = useState<Settings>(loadSettings());
  const [history, setHistory] = useState<HistoryEntry[]>(getHistory());
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>([]);
  const [status, setStatus] = useState<StatusProps>({
    message: 'Welcome to NY-CLI!',
    type: 'info',
    loading: false,
  });
  const [bannerPhase, setBannerPhase] = useState(0);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [username, setUsername] = useState(getUsername());
  const [pendingUsername, setPendingUsername] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [autoPlayEpisode, setAutoPlayEpisode] = useState<{ episodeId: string; number: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(!initialQuery);
  const [isExiting, setIsExiting] = useState(false);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);

  // Banner animation
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerPhase((p) => (p + 1) % 50);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  // Auto-search if query provided via CLI
  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, []);

  // Load user avatar when viewing profile (for already logged in users)
  useEffect(() => {
    if (screen === 'profile' && loggedIn && !userPhotoUrl) {
      const token = getToken();
      if (token) {
        verifyFirebaseUser(token).then(result => {
          if (result.photoUrl) {
            setUserPhotoUrl(result.photoUrl);
          }
        }).catch(() => {});
      }
    }
  }, [screen, loggedIn, userPhotoUrl]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU ITEMS
  // ═══════════════════════════════════════════════════════════════════════════
  const loggedInMenuItems: SelectItem[] = [
    { value: 'profile', label: 'Profile', icon: '[P]' },
    { value: 'continue', label: 'Continue Watching', icon: '[>]' },
    { value: 'search', label: 'Search', icon: '[S]' },
    { value: 'random', label: 'Random Anime', icon: '[🎲]' },
    { value: 'settings', label: 'Settings', icon: '[⚙]' },
    { value: 'help', label: 'Help', icon: '[?]' },
    { value: 'exit', label: 'Exit', icon: '[X]' },
  ];

  const loggedOutMenuItems: SelectItem[] = [
    { value: 'search', label: 'Search', icon: '[S]' },
    { value: 'random', label: 'Random Anime', icon: '[🎲]' },
    { value: 'settings', label: 'Settings', icon: '[⚙]' },
    { value: 'login', label: 'Login', icon: '[L]' },
    { value: 'help', label: 'Help', icon: '[?]' },
    { value: 'exit', label: 'Exit', icon: '[X]' },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleMenuSelect = useCallback((item: SelectItem) => {
    const action = item.value;
    if (action === 'exit') {
      setIsExiting(true);
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    } else if (action === 'search') {
      setScreen('search');
      setStatus({ message: 'Enter anime name to search', type: 'info', loading: false });
    } else if (action === 'random') {
      handleRandomAnime();
    } else if (action === 'continue') {
      handleContinue();
    } else if (action === 'login') {
      handleStartLogin();
    } else if (action === 'profile') {
      setScreen('login-token');
    } else if (screen === 'login-token' || screen === 'login-waiting') {
      setScreen('main-menu');
    } else if (action === 'settings') {
      setScreen('settings');
    } else if (action === 'help') {
      setScreen('help');
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setStatus({ message: `Searching "${query}"...`, type: 'info', loading: true });

    try {
      const data = await getJson(`/api/aniwatch?action=search&q=${encodeURIComponent(query)}&page=1`);
      const results = (data?.animes || []).slice(0, 20);

      if (!results.length) {
        setStatus({ message: 'No anime found. Try different keywords.', type: 'warning', loading: false });
        return;
      }

      setAnimes(results);
      setScreen('anime-select');
      setStatus({ message: `Found ${results.length} anime`, type: 'success', loading: false });
    } catch (err: any) {
      setStatus({ message: `Search failed: ${err.message}`, type: 'error', loading: false });
    }
  }, []);

  const handleRandomAnime = useCallback(async () => {
    setStatus({ message: 'Finding random anime...', type: 'info', loading: true });

    try {
      const data = await getJson('/api/aniwatch?action=random');
      const randomAnime = data?.randomAnime;

      if (!randomAnime) {
        setStatus({ message: 'Could not find random anime', type: 'warning', loading: false });
        return;
      }

      // Get anime info and play first episode
      setStatus({ message: `Playing ${randomAnime.name}...`, type: 'info', loading: true });
      
      const info = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(randomAnime.id)}`);
      const eps = info?.episodes?.sub || info?.episodes?.dub || [];
      
      if (eps.length === 0) {
        setStatus({ message: 'No episodes found', type: 'warning', loading: false });
        return;
      }

      // Set state and play first episode
      setSelectedAnime({ 
        id: randomAnime.id, 
        value: randomAnime.id, 
        label: randomAnime.name, 
        poster: randomAnime.poster 
      });
      setAnimeInfo(info);
      setAudioType(info?.episodes?.sub?.length ? 'sub' : 'dub');
      setEpisodes(eps);
      
      // Play first episode
      const firstEp = eps[0];
      setAutoPlayEpisode({ episodeId: firstEp.episodeId, number: 1 });
      setScreen('episode-select');
      setStatus({ message: `Starting ${randomAnime.name} Episode 1...`, type: 'success', loading: true });
    } catch (err: any) {
      setStatus({ message: `Failed: ${err.message}`, type: 'error', loading: false });
    }
  }, []);

  const handleContinue = useCallback(() => {
    const hist = getHistory();
    setHistory(hist);
    if (hist.length === 0) {
      setStatus({ message: 'No watch history yet', type: 'info', loading: false });
      return;
    }
    setScreen('continue');
    setStatus({ message: `${hist.length} anime in history`, type: 'success', loading: false });
  }, []);

  const handleStartLogin = useCallback(() => {
    setStatus({ message: 'Opening browser for login...', type: 'info', loading: true });
    setScreen('login-waiting');
    
    // Start local server
    const server = http.createServer((req: any, res: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/callback') {
        setStatus({ message: 'Received callback connection...', type: 'info', loading: true });
        let body = '';
        req.on('data', (chunk: any) => body += chunk.toString());
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.token && data.username) {
              setStatus({ message: 'Callback verified, logging in...', type: 'info', loading: true });
              setPendingUsername(data.username);
              handleLoginToken(data.token, data.username, data.idToken, data.refreshToken);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(400);
              res.end();
            }
          } catch (e) {
            res.writeHead(400);
            res.end();
          } finally {
            server.close();
            // Go back to profile or home if logged in, handleLoginToken will do it but let's wait a bit
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(4000, () => {
      import('open').then((open) => {
        open.default(`${API_BASE}/api/auth/login?port=4000`).catch(() => {});
      }).catch(err => {
        setStatus({ message: 'Failed to open browser: ' + err.message, type: 'error', loading: false });
      });
    });
    
    // Auto-close after 5 minutes
    setTimeout(() => {
      server.close();
      if (!isLoggedIn()) {
        setStatus({ message: 'Login timed out', type: 'error', loading: false });
        setScreen('main-menu');
      }
    }, 5 * 60 * 1000);
  }, []);

  const handleLoginToken = useCallback(async (firebaseUid: string, providedUsername?: string, idToken?: string, refreshToken?: string) => {
    if (!firebaseUid.trim()) {
      setStatus({ message: 'User ID cannot be empty', type: 'error', loading: false });
      return;
    }

    setStatus({ message: 'Verifying account...', type: 'info', loading: true });

    try {
      const result = await verifyFirebaseUser(firebaseUid.trim());
      
      if (result.valid) {
        const finalUsername = result.username || providedUsername || pendingUsername;
        saveAuth(finalUsername, firebaseUid.trim(), idToken, refreshToken);
        setLoggedIn(true);
        setUsername(finalUsername);
        setStatus({ message: `Welcome, ${finalUsername}!`, type: 'success', loading: false });
        
        // Load profile picture if available
        if (result.photoUrl) {
          setUserPhotoUrl(result.photoUrl);
        }
        
        // Sync cloud history in background
        setSyncMessage('Syncing with cloud...');
        mergeCloudHistory().then(({ message }) => {
          setSyncMessage(message);
          setHistory(getHistory()); // Refresh history
          setTimeout(() => setSyncMessage(''), 3000);
        });
        
        setScreen('main-menu');
      } else {
        // Still allow login but warn about verification
        const fallbackUser = providedUsername || pendingUsername;
        saveAuth(fallbackUser, firebaseUid.trim());
        setLoggedIn(true);
        setUsername(fallbackUser);
        setScreen('main-menu');
        setStatus({ message: `Logged in as ${fallbackUser} (unverified)`, type: 'warning', loading: false });
      }
    } catch (err) {
      // Network error - login anyway with local storage
      const fallbackUser = providedUsername || pendingUsername;
      saveAuth(fallbackUser, firebaseUid.trim());
      setLoggedIn(true);
      setUsername(fallbackUser);
      setScreen('main-menu');
      setStatus({ message: 'Logged in (offline mode)', type: 'warning', loading: false });
    }
  }, [pendingUsername]);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
    setUsername('');
    setPendingUsername('');
    setUserPhotoUrl(null);
    setScreen('main-menu');
    setStatus({ message: 'Logged out. See you soon!', type: 'info', loading: false });
  }, []);

  const goBack = useCallback(() => {
    if (screen === 'episode-select') {
      setScreen('audio-select');
      setStatus({ message: 'Select audio type', type: 'info', loading: false });
    } else if (screen === 'audio-select') {
      setScreen('anime-select');
      setStatus({ message: `Found ${animes.length} anime`, type: 'success', loading: false });
    } else if (screen === 'login-token') {
      setScreen('login');
      setPendingUsername('');
      setStatus({ message: 'Enter your NyAnime username', type: 'info', loading: false });
    } else if (['anime-select', 'continue', 'search', 'profile', 'login', 'settings', 'help', 'downloading'].includes(screen)) {
      setScreen('main-menu');
      setStatus({ message: 'Welcome to NY-CLI!', type: 'info', loading: false });
    }
  }, [screen, animes.length]);

  const handleEpisodeAction = useCallback((action: string, item: SelectItem) => {
    if (action === 'd' || action === 'a') {
      const itemsToDownload = action === 'a' ? episodes.map(e => ({
        ...e,
        label: `Episode ${e.number}`,
        value: `ep-${e.number}`,
        episodeId: e.episodeId
      })) : [item];

      const anilistId = animeInfo?.id?.replace('anilist::', '') || '';

      const newTasks: DownloadTask[] = itemsToDownload.map((ep: any) => ({
        id: ep.episodeId,
        anilistId,
        animeTitle: selectedAnime?.label || animeInfo?.name || 'Anime',
        episodeNumber: ep.number || ep.epNo || 1,
        status: 'pending',
        progress: 0,
        message: 'Waiting...'
      }));

      setDownloadQueue(prev => [...prev, ...newTasks]);
      setScreen('downloading');
    }
  }, [episodes, selectedAnime, animeInfo]);

  const handleAnimeSelect = useCallback(async (item: SelectItem) => {
    setStatus({ message: `Loading "${item.label}"...`, type: 'info', loading: true });

    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id!)}`);
      
      const subCount = data?.episodes?.sub?.length || 0;
      const dubCount = data?.episodes?.dub?.length || 0;

      if (subCount === 0 && dubCount === 0) {
        setStatus({ message: 'No episodes found', type: 'warning', loading: false });
        return;
      }

      setSelectedAnime(item);
      setAnimeInfo(data);
      setScreen('audio-select');
      setStatus({ message: `Sub: ${subCount} eps │ Dub: ${dubCount} eps`, type: 'success', loading: false });
    } catch (err: any) {
      setStatus({ message: `Failed to load: ${err.message}`, type: 'error', loading: false });
    }
  }, []);

  const handleAudioSelect = useCallback((item: SelectItem) => {
    const type = item.value as 'sub' | 'dub';
    setAudioType(type);
    
    const eps = animeInfo?.episodes?.[type] || [];
    if (!eps.length) {
      setStatus({ message: `No ${type === 'sub' ? 'subbed' : 'dubbed'} episodes`, type: 'warning', loading: false });
      return;
    }

    setEpisodes(eps);
    setScreen('episode-select');
    setStatus({ message: `${eps.length} ${type === 'sub' ? 'subbed' : 'dubbed'} episodes`, type: 'success', loading: false });
  }, [animeInfo]);

  const handleHistorySelect = useCallback(async (item: SelectItem) => {
    // Load the anime and continue from last episode
    setStatus({ message: `Loading "${item.label}"...`, type: 'info', loading: true });
    
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id!)}`);
      setSelectedAnime(item);
      setAnimeInfo(data);
      
      // Use the saved category
      const histEntry = history.find(h => h.id === item.id);
      const type = histEntry?.category || 'sub';
      setAudioType(type);
      
      const eps = data?.episodes?.[type] || [];
      setEpisodes(eps);
      
      // Check watch progress - if 90%+ watched, prompt user
      let targetEpisode = histEntry?.episode || 1;
      const progress = getWatchProgress(item.id!, targetEpisode);
      const watchPercentage = progress ? getWatchPercentage(progress.watchTime, progress.duration) : 0;
      
      if (watchPercentage >= 90 && targetEpisode < eps.length) {
        const nextEp = eps.find((e: any) => e.number === targetEpisode + 1);
        const currEp = eps.find((e: any) => e.number === targetEpisode);
        if (nextEp && currEp) {
          setAutoAdvanceData({
            currentEpisode: currEp,
            nextEpisode: nextEp,
            percentage: watchPercentage
          });
          setScreen('auto-advance');
          setStatus({ message: `Episode ${targetEpisode} is almost complete.`, type: 'info', loading: false });
          return;
        }
      }
      
      // Otherwise go to episode select screen
      setScreen('episode-select');
      if (watchPercentage > 0 && watchPercentage < 97) {
        setStatus({ message: `Continue Episode ${targetEpisode} from ${formatTime(progress?.watchTime || 0)}`, type: 'success', loading: false });
      } else {
        setStatus({ message: `${eps.length} episodes available`, type: 'success', loading: false });
      }
    } catch (err: any) {
      setStatus({ message: `Failed: ${err.message}`, type: 'error', loading: false });
    }
  }, [history]);

  const handleEpisodeSelect = useCallback(async (item: SelectItem, startPosition?: number) => {
    setStatus({ message: `Getting stream for Episode ${item.number}...`, type: 'info', loading: true });

    try {
      const animeTitle = selectedAnime?.label || animeInfo?.name || '';
      const animeJName = animeInfo?.jname || '';
      const totalEps = episodes.length || 0;
      const epNo = item.number || 1;
      const mode = audioType === 'dub' ? 'dub' : 'sub';

      // Extract malId from episodeId: "ep::malId::epNo"
      const epIdParts = String(item.episodeId || '').split('::');
      const malId = epIdParts[0] === 'ep' ? Number(epIdParts[1]) : undefined;
      const anilistId = animeInfo?.id?.replace('anilist::', '') || '';

      // ── Resolve All Sources Concurrently for Max Speed ──────────────────
      setStatus({ message: `Resolving fastest available stream...`, type: 'info', loading: true });

      const [aaResult, torrentResult, embedResult] = await Promise.allSettled([
        resolveAllAnimeStream(animeTitle, epNo, mode, malId),
        getJson(`/api/torrent?title=${encodeURIComponent(animeTitle)}&ep=${epNo}`),
        getJson(`/api/aniwatch?action=sources&episodeId=${encodeURIComponent(item.episodeId!)}&category=${mode}&audio=${mode}&title=${encodeURIComponent(animeTitle)}&title_ro=${encodeURIComponent(animeJName)}&episodeNo=${epNo}&totalEpisodes=${totalEps}&anilistId=${anilistId}`)
      ]);

      const aaStream = aaResult.status === 'fulfilled' ? aaResult.value : null;
      const torrentData = torrentResult.status === 'fulfilled' ? torrentResult.value : null;
      const sourcesData = embedResult.status === 'fulfilled' ? embedResult.value : null;

      let isTorrent = false;
      let magnetLink = '';
      let source: any = null;
      let streamHeaders: Record<string, string> = {};
      let isLocalStream = false;
      let allEmbedSources: any[] = [];

      // Priority 1: AllAnime (Fastest Direct Stream)
      if (aaStream) {
        source = { url: aaStream.url, quality: aaStream.quality, type: aaStream.type };
        streamHeaders = { Referer: aaStream.referer, Origin: new URL(aaStream.referer).origin };
        isLocalStream = true;
        setStatus({ message: `Found Direct Stream: ${aaStream.quality}`, type: 'success', loading: true });
      } 
      // Priority 2: Torrents (Guaranteed Local Stream)
      else if (torrentData?.magnet) {
        magnetLink = torrentData.magnet;
        isTorrent = true;
        setStatus({ message: `Found Torrent, buffering...`, type: 'success', loading: true });
      } 
      // Priority 3: Embeds (Browser Fallback)
      else if (sourcesData) {
        allEmbedSources = sourcesData.sources || [];
        source = pickPlayableSource(allEmbedSources);
        streamHeaders = sourcesData.headers || {};
        setStatus({ message: `Using Embed Fallback`, type: 'success', loading: true });
      }

      if (!isTorrent && !source?.url) {
        setStatus({ message: 'No playable source found', type: 'error', loading: false });
        return;
      }


      // Get previous watch progress if not starting from a specific position
      const prevProgress = !startPosition ? getWatchProgress(selectedAnime?.id || '', item.number || 1) : null;
      const resumeTime = startPosition || prevProgress?.watchTime || 0;

      const directUrl = source.url;
      
      // Fallback to proxy URL if direct fails
      const proxyHeaders = Buffer.from(JSON.stringify(streamHeaders)).toString('base64');
      const proxyUrl = `${API_BASE}/api/stream?url=${encodeURIComponent(directUrl)}&h=${encodeURIComponent(proxyHeaders)}`;

      const epAnimeTitle = selectedAnime?.label || animeInfo?.name || animeInfo?.title || '';
      const title = `${epAnimeTitle || 'Anime'} - Episode ${item.number} (${mode.toUpperCase()})`;
      const animeId = selectedAnime?.id || '';
      const episodeNum = item.number || 1;


      // ── Torrent Stream: open in webtorrent-cli + mpv ───────────────────────
      if (isTorrent && magnetLink) {
        setStatus({ message: `Opening Torrent in MPV...`, type: 'success', loading: false });
        const wtCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
        const args = ['-y', 'webtorrent-cli', magnetLink, '--mpv'];
        
        spawn(wtCmd, args, { stdio: 'ignore', detached: true }).unref();

        if (animeId && epAnimeTitle) {
          saveToHistory({ id: animeId, title: epAnimeTitle, episode: episodeNum, timestamp: Date.now(), category: audioType, totalEpisodes: totalEps });
        }
        return;
      }

      // ── Embed sources (MegaPlay / Anikoto): open in browser ─────────────
      if (!isTorrent && isEmbedSource(source)) {
        // Collect all embed URLs to try (MegaPlay first, then Anikoto)
        const embedUrls: Array<{url: string, name: string}> = [];
        for (const s of allEmbedSources) {
          if (s?.url && isEmbedSource(s)) {
            const name = s.quality || (String(s.url).includes('megaplay') ? 'MegaPlay' : 'Anikoto');
            if (!embedUrls.find(e => e.url === s.url)) {
              embedUrls.push({ url: s.url, name });
            }
          }
        }
        if (!embedUrls.find(e => e.url === directUrl)) {
          embedUrls.unshift({ url: directUrl, name: source.quality || 'Embed' });
        }

        const browserCmds = ['xdg-open', 'open', 'firefox', 'chromium', 'google-chrome'];
        let browserCmd: string | null = null;
        for (const cmd of browserCmds) {
          try {
            const which = spawnSync('which', [cmd], { encoding: 'utf8' });
            if (which.status === 0) { browserCmd = cmd; break; }
          } catch {}
        }

        if (browserCmd) {
          // Open the first (MegaPlay) URL
          spawn(browserCmd, [embedUrls[0].url], { stdio: 'ignore', detached: true }).unref();
          const altMsg = embedUrls.length > 1
            ? ` │ Alt: press b→episode to try ${embedUrls[1].name}`
            : '';
          setStatus({
            message: `Opened ${embedUrls[0].name} in browser. If 404, try re-selecting the episode for ${embedUrls.length > 1 ? embedUrls[1].name : 'another source'}.${altMsg}`,
            type: 'success',
            loading: false
          });
        } else {
          const urlList = embedUrls.map(e => `${e.name}: ${e.url}`).join(' | ');
          setStatus({ message: `Copy to browser → ${urlList}`, type: 'info', loading: false });
        }

        // Save progress marker (no time tracking for embeds)
        if (animeId && epAnimeTitle) {
          saveToHistory({ id: animeId, title: epAnimeTitle, episode: episodeNum, timestamp: Date.now(), category: audioType, totalEpisodes: totalEps });
        }
        return;
      }

      // ── Direct stream: open in media player ─────────────────────────────
      const player = getPlayerCommand();
      if (!player) {
        setStatus({ message: 'No player found. Install mpv or vlc.', type: 'warning', loading: false });
        return;
      }

      const sourceReferer = (source as any).headers?.Referer
        || streamHeaders.Referer
        || streamHeaders.referer
        || 'https://megaplay.buzz';
      const sourceOrigin = (source as any).headers?.Origin
        || streamHeaders.Origin
        || streamHeaders.origin
        || new URL(sourceReferer).origin;
      
      const ipcPath = `/tmp/nycli-mpv-${process.pid}.sock`;
      
      let args: string[] = [];
      if (player === 'mpv') {
        args = [
          '--ytdl=no',
          `--force-media-title=${title}`,
          `--input-ipc-server=${ipcPath}`,
        ];
        args.push(`--http-header-fields=Referer: ${sourceReferer},Origin: ${sourceOrigin}`);
        args.push(`--referrer=${sourceReferer}`);
        const settings = loadSettings();
        if (settings.anime4k && isAnime4kInstalled()) {
          const shaderPath = getAnime4kShaders(settings.anime4kMode);
          args.push(`--glsl-shaders=${shaderPath}`);
          args.push('--profile=gpu-hq');
        }
        if (resumeTime > 5) {
          args.push(`--start=${Math.floor(resumeTime)}`);
          setStatus({ message: `Resuming from ${formatTime(resumeTime)}...`, type: 'success', loading: false });
        } else {
          setStatus({ message: `Opening ${player}...`, type: 'success', loading: false });
        }
        args.push(directUrl);
      } else if (player === 'vlc') {
        args = ['--meta-title', title, '--play-and-exit'];
        args.push(`--http-referrer=${sourceReferer}`);
        if (resumeTime > 5) args.push(`--start-time=${Math.floor(resumeTime)}`);
        args.push(directUrl);
        setStatus({ message: `Opening ${player}...`, type: 'success', loading: false });
      } else {
        args = [proxyUrl];
        setStatus({ message: `Opening ${player}...`, type: 'success', loading: false });
      }

      const child = spawn(player, args, { stdio: 'ignore', detached: false });
      
      // Track watch progress in background for mpv
      if (player === 'mpv') {
        let lastPosition = 0;
        let duration = 0;
        
        const trackProgress = async () => {
          try {
            // Wait for mpv to start
            await new Promise(r => setTimeout(r, 2000));
            
            const net = require('node:net');
            const client = new net.Socket();
            
            client.connect(ipcPath, () => {
              // Get duration and position periodically
              const poll = setInterval(() => {
                try {
                  client.write('{"command": ["get_property", "time-pos"]}\n');
                  client.write('{"command": ["get_property", "duration"]}\n');
                } catch {
                  clearInterval(poll);
                }
              }, 5000);
              
              client.on('close', () => {
                clearInterval(poll);
                // Save final progress - only if we have valid data
                if (lastPosition > 0 && animeId && epAnimeTitle) {
                  saveWatchProgress(animeId, episodeNum, lastPosition, duration);
                  saveToHistory({
                    id: animeId,
                    title: epAnimeTitle,
                    episode: episodeNum,
                    timestamp: Date.now(),
                    category: audioType,
                    watchTime: lastPosition,
                    duration: duration,
                    totalEpisodes: totalEps,
                  });
                  setHistory(getHistory());
                }
              });
            });
            
            client.on('data', (data: Buffer) => {
              const lines = data.toString().split('\n').filter(Boolean);
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.data !== undefined && json.data !== null) {
                    if (typeof json.data === 'number') {
                      if (json.data > 60 && json.data < 7200) {
                        // Likely duration (1 min to 2 hours)
                        if (duration === 0 || Math.abs(json.data - duration) < 10) {
                          duration = json.data;
                        }
                      }
                      // Position is usually the one that changes frequently
                      if (duration > 0 && json.data < duration) {
                        lastPosition = json.data;
                      } else if (duration === 0) {
                        lastPosition = json.data;
                      }
                    }
                  }
                } catch {}
              }
            });
            
            client.on('error', () => {});
          } catch {}
        };
        
        trackProgress();
      }
      
      child.on('exit', () => {
        // Cleanup socket
        try { require('fs').unlinkSync(ipcPath); } catch {}
      });

      setStatus({ message: 'Player launched! Select another episode or press b to go back.', type: 'info', loading: false });
      
      // Save initial history entry - only if we have valid data
      if (animeId && animeTitle) {
        saveToHistory({
          id: animeId,
          title: animeTitle,
          episode: episodeNum,
          timestamp: Date.now(),
          category: audioType,
          totalEpisodes: totalEps,
        });
        setHistory(getHistory());
      }
      
    } catch (err: any) {
      setStatus({ message: `Stream error: ${err.message}`, type: 'error', loading: false });
    }
  }, [selectedAnime, animeInfo, audioType, episodes.length]);

  // Auto-play effect for 97%+ watched episodes
  useEffect(() => {
    if (autoPlayEpisode && screen === 'episode-select') {
      const timer = setTimeout(() => {
        handleEpisodeSelect({
          id: selectedAnime?.id,
          label: `Episode ${autoPlayEpisode.number}`,
          value: `ep-${autoPlayEpisode.number}`,
          episodeId: autoPlayEpisode.episodeId,
          number: autoPlayEpisode.number,
        }, 0);
        setAutoPlayEpisode(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPlayEpisode, screen, selectedAnime, handleEpisodeSelect]);

  useEffect(() => {
    if (downloadQueue.some(t => t.status === 'downloading')) return;
    
    const nextTaskIndex = downloadQueue.findIndex(t => t.status === 'pending');
    if (nextTaskIndex === -1) return;

    const task = downloadQueue[nextTaskIndex];
    
    setDownloadQueue(prev => {
      const q = [...prev];
      q[nextTaskIndex].status = 'downloading';
      q[nextTaskIndex].message = 'Resolving stream...';
      return q;
    });

    const startDownload = async () => {
      try {
        const epIdParts = String(task.id || '').split('::');
        const malId = epIdParts[0] === 'ep' ? Number(epIdParts[1]) : undefined;

        const safeTitle = task.animeTitle.replace(/[^a-zA-Z0-9]/g, '_');
        const outDir = path.join(os.homedir(), 'Downloads', 'ny-cli', safeTitle);
        
        const anilistQuery = task.anilistId ? `&anilistId=${task.anilistId}` : '';
        
        // Fetch All Sources Concurrently for Max Speed
        const [aaResult, torrentResult, embedResult] = await Promise.allSettled([
          resolveAllAnimeStream(task.animeTitle, task.episodeNumber, audioType, malId),
          getJson(`/api/torrent?title=${encodeURIComponent(task.animeTitle)}&ep=${task.episodeNumber}`),
          getJson(`/api/aniwatch?action=sources&episodeId=${encodeURIComponent(task.id)}&category=${audioType}&audio=${audioType}&title=${encodeURIComponent(task.animeTitle)}&episodeNo=${task.episodeNumber}${anilistQuery}`)
        ]);

        const aaStream = aaResult.status === 'fulfilled' ? aaResult.value : null;
        const torrentData = torrentResult.status === 'fulfilled' ? torrentResult.value : null;
        const embedData = embedResult.status === 'fulfilled' ? embedResult.value : null;

        // Try Torrent first for downloading (most robust)
        let isTorrent = false;
        let magnetLink = '';
        if (torrentData?.magnet) {
          magnetLink = torrentData.magnet;
          isTorrent = true;
        }

        if (isTorrent && magnetLink) {
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
          
          setDownloadQueue(prev => {
             const q = [...prev];
             q[nextTaskIndex].message = 'Downloading Torrent...';
             return q;
          });

          const wtCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
          const args = ['-y', 'webtorrent-cli', 'download', magnetLink, '-o', outDir];

          const wtProcess = spawn(wtCmd, args);

          wtProcess.stdout.on('data', (data: any) => {
             const output = data.toString();
             const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
             if (progressMatch) {
                const progress = Math.min(100, Math.floor(parseFloat(progressMatch[1])));
                let msg = 'Downloading Torrent...';
                const speedMatch = output.match(/([0-9.]+ [KMG]B\/s)/);
                if (speedMatch) msg = `Speed: ${speedMatch[1]}`;

                setDownloadQueue(prev => {
                  const q = [...prev];
                  q[nextTaskIndex].progress = progress;
                  q[nextTaskIndex].message = msg;
                  return q;
                });
             }
          });

          wtProcess.on('close', (code) => {
             setDownloadQueue(prev => {
                const q = [...prev];
                q[nextTaskIndex].status = code === 0 ? 'completed' : 'error';
                q[nextTaskIndex].message = code === 0 ? 'Completed' : 'WebTorrent Error';
                if (code === 0) q[nextTaskIndex].progress = 100;
                return q;
             });
          });
          return;
        }

        // Fallback: Direct stream with FFMpeg (AllAnime > Embeds)
        let streamUrl = '';
        let streamHeaders: any = {};

        if (aaStream?.url) {
          streamUrl = aaStream.url;
        } else if (embedData?.success && embedData.sources?.length > 0) {
          const defaultSource = embedData.sources.find((s: any) => s.isM3U8) || embedData.sources[0];
          streamUrl = defaultSource.url;
          if (embedData.headers) streamHeaders = embedData.headers;
        }

        if (!streamUrl) {
          throw new Error('No stream found');
        }

        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const filename = path.join(outDir, `${safeTitle}_Ep${task.episodeNumber}.mp4`);
        
        setDownloadQueue(prev => {
           const q = [...prev];
           q[nextTaskIndex].message = 'Downloading Embed...';
           return q;
        });

        const args = ['-y'];
        if (streamHeaders && streamHeaders.Referer) {
          args.push('-headers', `Referer: ${streamHeaders.Referer}\r\n`);
        }
        args.push(
          '-i', streamUrl,
          '-c', 'copy',
          '-bsf:a', 'aac_adtstoasc',
          '-progress', 'pipe:1',
          '-nostats',
          filename
        );

        const ffmpeg = spawn('ffmpeg', args);

        let durationUs = 0;

        ffmpeg.stderr.on('data', (data: any) => {
           const output = data.toString();
           if (!durationUs) {
              const durMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
              if (durMatch) {
                 const h = parseInt(durMatch[1]);
                 const m = parseInt(durMatch[2]);
                 const s = parseInt(durMatch[3]);
                 durationUs = (h * 3600 + m * 60 + s) * 1000000;
              }
           }
        });

        ffmpeg.stdout.on('data', (data: any) => {
          const output = data.toString();
          const timeMatch = output.match(/out_time_us=(\d+)/);
          if (timeMatch && durationUs > 0) {
            const timeUs = parseInt(timeMatch[1]);
            const progress = Math.min(100, Math.max(0, Math.floor((timeUs / durationUs) * 100)));
            setDownloadQueue(prev => {
              const q = [...prev];
              q[nextTaskIndex].progress = progress;
              return q;
            });
          }
        });

        ffmpeg.on('close', (code) => {
           setDownloadQueue(prev => {
              const q = [...prev];
              q[nextTaskIndex].status = code === 0 ? 'completed' : 'error';
              q[nextTaskIndex].message = code === 0 ? 'Completed' : 'FFmpeg Error';
              if (code === 0) q[nextTaskIndex].progress = 100;
              return q;
           });
        });

      } catch (err: any) {
        setDownloadQueue(prev => {
          const q = [...prev];
          q[nextTaskIndex].status = 'error';
          q[nextTaskIndex].message = err.message;
          return q;
        });
      }
    };

    startDownload();

  }, [downloadQueue, audioType]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTED DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const animeItems: SelectItem[] = animes.map((a) => ({
    id: a.id,
    label: a.name || a.title || 'Untitled',
    badge: a.episodes ? `sub ${a.episodes.sub || 0} / dub ${a.episodes.dub || 0}` : undefined,
    imageUrl: a.poster || undefined,
  }));

  const audioOptions: SelectItem[] = [
    { 
      value: 'sub', 
      label: 'Japanese (Subbed)', 
      badge: `${animeInfo?.episodes?.sub?.length || 0} episodes` 
    },
    { 
      value: 'dub', 
      label: 'English (Dubbed)', 
      badge: `${animeInfo?.episodes?.dub?.length || 0} episodes` 
    },
  ].filter(opt => {
    const count = opt.value === 'sub' 
      ? animeInfo?.episodes?.sub?.length 
      : animeInfo?.episodes?.dub?.length;
    return count > 0;
  });

  const episodeItems: SelectItem[] = episodes
    .map((e, idx) => ({
      episodeId: e.episodeId,
      // Use original index + 1 as episode number if number is missing/0
      number: e.number || idx + 1,
      title: e.title,
    }))
    // Remove duplicates by episode number (keep first occurrence)
    .filter((ep, idx, arr) => arr.findIndex(e => e.number === ep.number) === idx)
    // Sort by episode number ascending
    .sort((a, b) => a.number - b.number)
    // Format labels
    .map(e => ({
      episodeId: e.episodeId,
      number: e.number,
      label: `Episode ${e.number}${e.title && !e.title.includes('Episode') ? `: ${e.title}` : ''}`,
    }));

  const historyItems: SelectItem[] = history
    // Filter out corrupted entries with undefined/missing title or id
    .filter((h) => {
      if (!h || !h.id || !h.title) return false;
      if (String(h.id).includes('undefined') || String(h.title).includes('undefined')) return false;
      if (h.title.trim() === '' || h.id.trim() === '') return false;
      return true;
    })
    .map((h) => {
      const progress = getWatchProgress(h.id, h.episode);
      const percentage = progress ? Math.round(getWatchPercentage(progress.watchTime, progress.duration)) : 0;
      const almostDone = percentage >= 97;
      const progressStr = percentage > 0 
        ? almostDone 
          ? ' - Almost done!' 
          : ` • ${percentage}%` 
        : '';
      return {
        id: h.id,
        value: h.id,
        label: h.title,
        badge: `Ep ${h.episode} • ${h.category.toUpperCase()}${progressStr}`,
        icon: almostDone ? '[*]' : undefined,
      };
    });

  const profileMenuItems: SelectItem[] = [
    { value: 'sync', label: 'Sync History', icon: '[~]' },
    { value: 'logout', label: 'Logout', icon: '[X]' },
    { value: 'back', label: 'Back to Menu', icon: '[<]' },
  ];

  const handleProfileAction = useCallback(async (item: SelectItem) => {
    if (item.value === 'logout') {
      handleLogout();
    } else if (item.value === 'sync') {
      setStatus({ message: 'Syncing with cloud...', type: 'info', loading: true });
      const result = await mergeCloudHistory();
      setHistory(getHistory());
      setStatus({ message: result.message, type: result.added > 0 ? 'success' : 'info', loading: false });
    } else {
      goBack();
    }
  }, [handleLogout, goBack]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // Exit animation
  if (isExiting) {
    return (
      <Box flexDirection="column" padding={1} alignItems="center">
        <Banner phase={bannerPhase} />
        <Box marginTop={2} justifyContent="center">
          <GoodbyeMessage onComplete={() => process.exit(0)} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} alignItems="center">
      <Banner phase={bannerPhase} />

      {/* Scrolling welcome message */}
      {showWelcome && screen === 'main-menu' && (
        <Box marginBottom={1} justifyContent="center" width="100%">
          <ScrollingWelcome 
            text="~ Youkoso! Welcome to NyAnime CLI! ~" 
            onComplete={() => setShowWelcome(false)} 
          />
        </Box>
      )}

      {/* Main Menu */}
      {screen === 'main-menu' && !showWelcome && (
        <Box flexDirection="column" width={55} alignItems="center">
          {loggedIn ? (
            <Box marginBottom={1} borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={0} width={55}>
              <Text color={theme.cyan}>Okaeri, </Text>
              <ShimmerText text={username} speed={150} />
              <Text color={theme.cyan}>!</Text>
            </Box>
          ) : (
            <Box marginBottom={1} borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={0} width={55}>
              <WaveText text="Irasshaimase! Sign in for all features" colors={[theme.purple, theme.blue, theme.pink, theme.cyan]} speed={150} />
            </Box>
          )}
          <SelectList
            items={loggedIn ? loggedInMenuItems : loggedOutMenuItems}
            onSelect={handleMenuSelect}
            color={theme.cyan}
            showBorder={true}
          />
        </Box>
      )}

      {/* Search Screen */}
      {screen === 'search' && (
        <InputBox
          label="[S] Search Anime"
          onSubmit={handleSearch}
          onCancel={goBack}
          placeholder="Type anime name..."
          color={theme.purple}
        />
      )}

      {/* Anime Selection */}
      {screen === 'anime-select' && (
        <SelectList
          items={animeItems}
          onSelect={handleAnimeSelect}
          onBack={goBack}
          title="[>] Select Anime"
          color={theme.purple}
          showArtwork={true}
        />
      )}

      {/* Continue Watching */}
      {screen === 'continue' && (
        <SelectList
          items={historyItems}
          onSelect={handleHistorySelect}
          onBack={goBack}
          title="[>] Continue Watching"
          color={theme.success}
          showArtwork={true}
        />
      )}

      {/* Audio Selection */}
      {screen === 'audio-select' && (
        <Box flexDirection="column">
          <Text color={theme.pink} bold>📺 {selectedAnime?.label || 'Anime'}</Text>
          <Box marginTop={1}>
            <SelectList
              items={audioOptions}
              onSelect={handleAudioSelect}
              onBack={goBack}
              title="🔊 Select Audio Type"
              color={theme.cyan}
            />
          </Box>
        </Box>
      )}

      {/* Episode Selection */}
      {screen === 'episode-select' && (
        <Box flexDirection="column">
          <Text color={theme.pink} bold>
            📺 {selectedAnime?.label || 'Anime'} <Text color={theme.cyan}>({audioType.toUpperCase()})</Text>
          </Text>
          <Box marginTop={1}>
            <SelectList
              items={episodeItems}
              onSelect={handleEpisodeSelect}
              onAction={handleEpisodeAction}
              onBack={goBack}
              title={`📋 Select Episode (${episodeItems.length} total)`}
              color={theme.blue}
              showNumbers={false}
              enableSearch={episodeItems.length > 20}
            />
          </Box>
        </Box>
      )}


      {/* Downloading Queue */}
      {screen === 'downloading' && (
        <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="round" borderColor={theme.cyan} width={70}>
          <Text color={theme.pink} bold>📥 Downloads</Text>
          <Text color={theme.dimGray}>{'─'.repeat(60)}</Text>
          {downloadQueue.length === 0 ? (
            <Text color={theme.lightGray}>Queue is empty.</Text>
          ) : (
            downloadQueue.map((t, idx) => {
              const pBar = '█'.repeat(Math.floor(t.progress / 5)) + '░'.repeat(20 - Math.floor(t.progress / 5));
              let statusColor = theme.lightGray;
              let icon = '⏳';
              if (t.status === 'downloading') { statusColor = theme.cyan; icon = '⬇️ '; }
              else if (t.status === 'completed') { statusColor = theme.green; icon = '✅'; }
              else if (t.status === 'error') { statusColor = theme.red; icon = '❌'; }
              
              return (
                <Box key={idx} flexDirection="column" marginBottom={1}>
                  <Text color={statusColor} bold>
                    {icon} {t.animeTitle} - Ep {t.episodeNumber} <Text dimColor>({t.progress}%)</Text>
                  </Text>
                  <Text color={theme.purple}>{pBar} <Text dimColor>{t.message}</Text></Text>
                </Box>
              );
            })
          )}
          <Text color={theme.dimGray}>{'─'.repeat(60)}</Text>
          <Text color={theme.dimGray}>Press 'b' to go back</Text>
        </Box>
      )}

      {/* Auto Advance Prompt */}
      {screen === 'auto-advance' && autoAdvanceData && (
        <Box flexDirection="column">
          <Text color={theme.pink} bold>
            📺 {selectedAnime?.label || 'Anime'} <Text color={theme.cyan}>({audioType.toUpperCase()})</Text>
          </Text>
          <Box marginTop={1}>
            <SelectList
              items={[
                { label: `Resume Episode ${autoAdvanceData.currentEpisode.number} (${autoAdvanceData.percentage}%)`, value: 'resume', episodeId: autoAdvanceData.currentEpisode.episodeId, number: autoAdvanceData.currentEpisode.number },
                { label: `Start Next Episode ${autoAdvanceData.nextEpisode.number}`, value: 'next', episodeId: autoAdvanceData.nextEpisode.episodeId, number: autoAdvanceData.nextEpisode.number }
              ]}
              onSelect={(item) => handleEpisodeSelect(item)}
              onBack={goBack}
              title={`⏭️ Continue Watching?`}
              color={theme.cyan}
              showNumbers={true}
              enableSearch={false}
            />
          </Box>
        </Box>
      )}

      {/* Login - Waiting Step */}
      {screen === 'login-waiting' && (
        <Box flexDirection="column" width={55}>
          <Box borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={1} flexDirection="column">
            <Text color={theme.purple} bold>[L] Login to NyAnime</Text>
            <Text color={theme.dimGray}>{'─'.repeat(45)}</Text>
            <Text color={theme.lightGray}>1. Check your browser</Text>
            <Text color={theme.lightGray}>2. Sign in or Authorize ny-cli</Text>
            <Text color={theme.lightGray}>3. Return to terminal when done</Text>
            <Text color={theme.dimGray}>{'─'.repeat(45)}</Text>
            <Text color={theme.cyan}>Waiting for authorization...</Text>
          </Box>
        </Box>
      )}

      {/* Profile */}
      {screen === 'profile' && (
        <Box flexDirection="row" gap={2}>
          {/* Avatar - Use ink-picture component */}
          {userPhotoUrl ? (
            <Box width={18} height={14}>
              <AnimeArtwork title="" imageUrl={userPhotoUrl} width={18} height={14} />
            </Box>
          ) : (
            <Box borderStyle="round" borderColor={theme.purple} width={16} height={12} justifyContent="center" alignItems="center">
              <Text color={theme.dimGray}>[No Photo]</Text>
            </Box>
          )}
          
          {/* Profile Info */}
          <Box flexDirection="column" width={50}>
            <Box borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={1} flexDirection="column">
              <Text color={theme.purple} bold>[P] {username}</Text>
              <Text color={theme.dimGray}>{'─'.repeat(35)}</Text>
              <Text color={theme.lightGray}>UID: <Text color={theme.cyan}>{getToken().substring(0, 12)}...</Text></Text>
              {syncMessage ? <Text color={theme.cyan}>{syncMessage}</Text> : null}
            </Box>
            <Box marginTop={1}>
              <SelectList
                items={profileMenuItems}
                onSelect={handleProfileAction}
                color={theme.purple}
                showBorder={true}
              />
            </Box>
          </Box>
        </Box>
      )}

      {/* Settings */}
      {screen === 'settings' && (
        <SettingsScreen 
          settings={appSettings} 
          onUpdate={(newSettings) => {
            setAppSettings(newSettings);
            saveSettings(newSettings);
          }}
          onBack={goBack}
        />
      )}

      {/* Help */}
      {screen === 'help' && (
        <Box flexDirection="column" width={55}>
          <Box borderStyle="round" borderColor={theme.blue} paddingX={2} paddingY={1} flexDirection="column">
            <Text color={theme.blue} bold>[?] NY-CLI Help</Text>
            <Text color={theme.dimGray}>{'─'.repeat(45)}</Text>
            <Text> </Text>
            <Text color={theme.cyan}>USAGE:</Text>
            <Text color={theme.lightGray}>  ny-cli              Interactive mode</Text>
            <Text color={theme.lightGray}>  ny-cli "one piece"  Quick search</Text>
            <Text> </Text>
            <Text color={theme.cyan}>NAVIGATION:</Text>
            <Text color={theme.lightGray}>  Up/Down or j/k  Navigate</Text>
            <Text color={theme.lightGray}>  Enter           Select</Text>
            <Text color={theme.lightGray}>  b or Left       Go back</Text>
            <Text color={theme.lightGray}>  1-9             Quick select</Text>
            <Text color={theme.lightGray}>  q               Quit</Text>
            <Text> </Text>
            <Text color={theme.cyan}>CLOUD SYNC:</Text>
            <Text color={theme.lightGray}>  Login with your nyanime.qzz.io account</Text>
            <Text color={theme.lightGray}>  to sync watch history across devices</Text>
            <Text> </Text>
            <Text color={theme.cyan}>PLAYER (mpv):</Text>
            <Text color={theme.lightGray}>  Space  Play/Pause  |  f  Fullscreen</Text>
            <Text color={theme.lightGray}>  Left/Right   Seek  |  q  Quit</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.dimGray}>Press b or Left to go back</Text>
          </Box>
          {/* Handle back for help screen */}
          <HelpBackHandler onBack={goBack} />
        </Box>
      )}

      <Box marginTop={1}>
        <StatusBar {...status} />
      </Box>
    </Box>
  );
}

// Simple component to handle back navigation in help screen
function HelpBackHandler({ onBack }: { onBack: () => void }) {
  useInput((input, key) => {
    if (key.escape || input === 'b' || key.leftArrow || input === 'q') {
      if (input === 'q') process.exit(0);
      onBack();
    }
  });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER WITH PROPER CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

// Clear screen on startup
process.stdout.write('\x1bc');

const instance = render(
  <TerminalInfoProvider>
    <App />
  </TerminalInfoProvider>
);

process.on('exit', () => {
  instance.clear();
});

process.on('SIGINT', () => {
  instance.clear();
  process.exit(0);
});

process.on('SIGTERM', () => {
  instance.clear();
  process.exit(0);
});
