#!/usr/bin/env bun
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Picture, { TerminalInfoProvider } from 'ink-picture';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  configDir as CONFIG_DIR,
  dataDir as DATA_DIR,
  authFile as AUTH_FILE,
  historyFile as HISTORY_FILE,
  settingsFile as SETTINGS_FILE,
  anime4kDir as ANIME4K_DIR,
  ensureSecureAuthFile,
} from './paths.mjs';
import { loadConfig } from './config.mjs';
import { getMpvSkipArgs } from './skip.mjs';

// Module-level quit bus: bridges OS signals → React state
export const quitBus = new EventEmitter();

const defaultPort = process.env.NY_PORT || '43201';
const API_BASE = process.env.NYCLI_API_BASE || `http://localhost:${defaultPort}`;
declare const __CLI_VERSION__: string | undefined;

let VERSION = 'unknown';
try {
  if (typeof __CLI_VERSION__ !== 'undefined') {
    VERSION = __CLI_VERSION__;
  } else {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json');
    if (fs.existsSync(pkgPath)) {
      VERSION = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    }
  }
} catch {}

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
// LOCAL STORAGE (XDG Compliant via paths.mjs)
// ═══════════════════════════════════════════════════════════════════════════════
ensureSecureAuthFile();

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
interface Settings {
  anime4k: boolean;
  anime4kMode: 'A' | 'B' | 'C' | 'A+A' | 'B+B' | 'C+A';
  player: 'auto' | 'mpv' | 'vlc';
  skipMode: 'off' | 'chapters' | 'auto';
}

const defaultSettings: Settings = {
  anime4k: false,
  anime4kMode: 'A',
  player: 'auto',
  skipMode: 'off',
};

function loadSettings(): Settings {
  try {
    const config = loadConfig();
    const player = (config.player && ['auto', 'mpv', 'vlc'].includes(config.player)) ? (config.player as 'auto' | 'mpv' | 'vlc') : 'auto';
    const skipMode = (config.skipMode && ['off', 'chapters', 'auto'].includes(config.skipMode)) ? (config.skipMode as 'off' | 'chapters' | 'auto') : 'off';
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...defaultSettings, player, skipMode, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
    return { ...defaultSettings, player, skipMode };
  } catch {}
  return defaultSettings;
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
    try { fs.chmodSync(SETTINGS_FILE, 0o600); } catch {}
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
    fs.writeFileSync(HISTORY_FILE, content, { mode: 0o600 });
    try { fs.chmodSync(HISTORY_FILE, 0o600); } catch {}
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
    fs.writeFileSync(WATCH_PROGRESS_FILE, JSON.stringify(progress), { mode: 0o600 });
    try { fs.chmodSync(WATCH_PROGRESS_FILE, 0o600); } catch {}
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

const MY_LIST_FILE = path.join(DATA_DIR, 'my-list.json');

function getMyList(): { id: string; title: string; poster?: string }[] {
  try {
    if (!fs.existsSync(MY_LIST_FILE)) return [];
    return JSON.parse(fs.readFileSync(MY_LIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function addToMyList(item: { id: string; title: string; poster?: string }): void {
  try {
    const list = getMyList().filter(i => i.id !== item.id);
    list.unshift(item);
    fs.writeFileSync(MY_LIST_FILE, JSON.stringify(list), { mode: 0o600 });
    try { fs.chmodSync(MY_LIST_FILE, 0o600); } catch {}
  } catch {}
}

function removeFromMyList(id: string): void {
  try {
    const list = getMyList().filter(i => i.id !== id);
    fs.writeFileSync(MY_LIST_FILE, JSON.stringify(list), { mode: 0o600 });
    try { fs.chmodSync(MY_LIST_FILE, 0o600); } catch {}
  } catch {}
}

function isInMyList(id: string): boolean {
  if (!id) return false;
  return getMyList().some(i => i.id === id);
}

function renderScore(score: number | null | undefined): { glyphs: string; bar: string; text: string } {
  if (score === null || score === undefined || isNaN(score)) {
    return { glyphs: '🌑🌑🌑🌑🌑', bar: '[          ]', text: 'N/A' };
  }
  const s = Math.max(0, Math.min(100, Math.round(score)));
  let glyphs = '';
  for (let i = 0; i < 5; i++) {
    const rem = Math.max(0, Math.min(20, s - i * 20));
    if (rem < 2.5) glyphs += '🌑';
    else if (rem < 7.5) glyphs += '🌒';
    else if (rem < 12.5) glyphs += '🌓';
    else if (rem < 17.5) glyphs += '🌔';
    else glyphs += '🌕';
  }
  const filled = Math.round((s / 100) * 10);
  const bar = `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
  const text = `${s}/100`;
  return { glyphs, bar, text };
}

function formatTimeUntilAiring(seconds: number): string {
  if (seconds <= 0) return 'airing now';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function wrapText(str: string, maxLen: number): string[] {
  if (!str) return [];
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxLen) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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
      fs.writeFileSync(HISTORY_FILE, content, { mode: 0o600 });
      try { fs.chmodSync(HISTORY_FILE, 0o600); } catch {}
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

const EXIT_FRAMES = ['◜ ', ' ◝', ' ◞', '◟ ', '◜ '];
function ExitAnimation({ onDone }: { onDone: () => void }) {
  const [frame, setFrame] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  
  useInput(() => {
    // any key press cuts it short
    onDoneRef.current();
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => {
        if (f + 1 >= EXIT_FRAMES.length) {
          clearInterval(timer);
          setTimeout(() => onDoneRef.current(), 100);
        }
        return Math.min(f + 1, EXIT_FRAMES.length - 1);
      });
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return <Text color={theme.purple}>{EXIT_FRAMES[frame]} Goodbye!</Text>;
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
  
  useInput(() => {
    setDone(true);
    if (onComplete) onComplete();
  });

  // Handle completion via useEffect, not in render
  useEffect(() => {
    if (done && onComplete) {
      const timeout = setTimeout(onComplete, 50);
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
  onPageNext?: () => void;
  onPagePrev?: () => void;
  onSortToggle?: () => void;
  customKeyHint?: string;
}

function SelectList({
  items,
  onSelect,
  onBack,
  title,
  color = theme.purple,
  showBorder = true,
  showArtwork = false,
  showNumbers = true,
  enableSearch = false,
  onAction,
  onPageNext,
  onPagePrev,
  onSortToggle,
  customKeyHint,
}: SelectInputProps) {
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rippleIndex, setRippleIndex] = useState(-1);
  const [ripplePhase, setRipplePhase] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Filter items by search query
  const filteredItems = enableSearch && searchQuery
    ? items.filter(item => {
        const num = item.number?.toString() || '';
        const itemLabel = typeof item.label === 'string' ? item.label : String(item.label ?? '');
        const label = itemLabel.toLowerCase();
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
      quitBus.emit('quit');
    } else if (key.escape || input === 'b' || key.leftArrow) {
      if (searchQuery) {
        setSearchQuery('');
      } else if (onBack) {
        onBack();
      }
    } else if (onPageNext && input === 'n' && !isSearching) {
      onPageNext();
    } else if (onPagePrev && input === 'p' && !isSearching) {
      onPagePrev();
    } else if (onSortToggle && input === 's' && !isSearching) {
      onSortToggle();
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
  const maxLabelLen = Math.max(15, termWidth - 25);

  const content = (
    <Box flexDirection="column">
      {title && <Text color={color} bold>{title}</Text>}
      {title && (
        <Text color={theme.dimGray} dimColor>
          {customKeyHint || `↑↓: navigate │ Enter: select │ ${(onPageNext || onPagePrev) ? 'n/p: page │ ' : ''}${onSortToggle ? 's: sort │ ' : ''}b: back${enableSearch ? ' │ Type number to jump' : ''}${onAction ? ' │ d: dl │ a: dl all' : ''} │ q: quit`}
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
          const itemLabel = typeof item.label === 'string' ? item.label : String(item.label ?? '');
          const fullText = `${icon}${itemLabel}${badgeStr}`;
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
    const isNarrow = termSize.cols < 70;
    const artworkWidth = isNarrow ? Math.min(26, Math.max(16, termSize.cols - 6)) : 30;
    const artworkHeight = isNarrow ? 8 : 15;
    
    const titleText = typeof selectedItem?.label === 'string'
      ? selectedItem.label
      : String(selectedItem?.label ?? '');

    return (
      <Box flexDirection={isNarrow ? 'column' : 'row'}>
        {/* Artwork panel on the left (or top on narrow) */}
        <Box flexDirection="column" marginRight={isNarrow ? 0 : 2} marginBottom={isNarrow ? 1 : 0} width={artworkWidth} flexShrink={0}>
          <AnimeArtwork 
            title={titleText} 
            imageUrl={selectedItem?.imageUrl}
            width={artworkWidth} 
            height={artworkHeight} 
          />
          {/* Show selected anime title under artwork */}
          {selectedItem && (
            <Box marginTop={1}>
              <Text color={theme.cyan} wrap="truncate-end">
                {titleText.slice(0, Math.max(10, artworkWidth - 2))}
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      const snippet = text.slice(0, 100).replace(/\s+/g, ' ').trim();
      throw new Error(`Non-JSON response (HTTP ${res.status}): ${snippet || '(empty response)'}`);
    }
    if (!res.ok || !body?.success) {
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return body.data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after 15s: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
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

function resolvePlayerCommand(settings: Settings): string {
  if (settings.player && settings.player !== 'auto') return settings.player;
  return getPlayerCommand() || 'mpv'; // fall through to mpv as last resort
}

// Build player-specific arguments for streaming
function buildPlayerArgs(
  player: string,
  url: string,
  headers?: Record<string, string>,
  title?: string,
  subtitle?: string,
  options?: {
    audioType?: 'sub' | 'dub';
    skipArgs?: string[];
  }
): string[] {
  if (player === 'vlc') {
    const args = [url];
    if (headers?.Referer) {
      args.push(`--http-referrer=${headers.Referer}`);
    }
    if (headers?.['User-Agent']) {
      args.push(`--http-user-agent=${headers['User-Agent']}`);
    }
    if (title) {
      args.push(`--meta-title=${title}`);
    }
    if (subtitle) {
      args.push(`--sub-file=${subtitle}`);
    }
    if (options?.audioType === 'sub') {
      args.push('--sub-language=en,eng', '--audio-language=ja,jpn');
    } else if (options?.audioType === 'dub') {
      args.push('--audio-language=en,eng');
    }
    args.push('--play-and-exit');
    return args;
  }
  // Default: mpv / iina
  const args = [url];
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => {
      args.push(`--http-header-fields-append=${k}: ${v}`);
    });
  }
  if (title) {
    args.push(`--title=${title}`);
    args.push(`--force-media-title=${title}`);
  }
  if (subtitle) {
    args.push(`--sub-file=${subtitle}`);
  }
  if (options?.audioType === 'sub') {
    args.push('--alang=jpn,ja,Japanese');
    args.push('--slang=eng,en,English');
  } else if (options?.audioType === 'dub') {
    args.push('--alang=eng,en,English');
  }
  if (options?.skipArgs && options.skipArgs.length > 0) {
    args.push(...options.skipArgs);
  }
  return args;
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
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });

  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  
  const anime4kInstalled = isAnime4kInstalled();
  const modes = ['A', 'B', 'C', 'A+A', 'B+B', 'C+A'] as const;
  const players = ['auto', 'mpv', 'vlc'] as const;
  const skipModes = ['off', 'chapters', 'auto'] as const;
  
  const menuItems = [
    { key: 'player', label: 'Video Player', type: 'select' },
    { key: 'skipMode', label: 'AniSkip Mode', type: 'select' },
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
      quitBus.emit('quit');
    }
    
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(menuItems.length - 1, i + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      
      if (item.key === 'player') {
        const currentIdx = players.indexOf(settings.player || 'auto');
        const nextIdx = (currentIdx + 1) % players.length;
        onUpdate({ ...settings, player: players[nextIdx] });
      } else if (item.key === 'skipMode') {
        const currentIdx = skipModes.indexOf(settings.skipMode || 'off');
        const nextIdx = (currentIdx + 1) % skipModes.length;
        onUpdate({ ...settings, skipMode: skipModes[nextIdx] });
      } else if (item.key === 'anime4k') {
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
    } else if (key.leftArrow && menuItems[selectedIndex].key === 'player') {
      const currentIdx = players.indexOf(settings.player || 'auto');
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : players.length - 1;
      onUpdate({ ...settings, player: players[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === 'player') {
      const currentIdx = players.indexOf(settings.player || 'auto');
      const nextIdx = (currentIdx + 1) % players.length;
      onUpdate({ ...settings, player: players[nextIdx] });
    } else if (key.leftArrow && menuItems[selectedIndex].key === 'skipMode') {
      const currentIdx = skipModes.indexOf(settings.skipMode || 'off');
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : skipModes.length - 1;
      onUpdate({ ...settings, skipMode: skipModes[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === 'skipMode') {
      const currentIdx = skipModes.indexOf(settings.skipMode || 'off');
      const nextIdx = (currentIdx + 1) % skipModes.length;
      onUpdate({ ...settings, skipMode: skipModes[nextIdx] });
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
    <Box flexDirection="column" width={Math.min(60, termSize.cols - 4)}>
      <Box borderStyle="round" borderColor={theme.cyan} paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.cyan} bold>[⚙] Settings</Text>
        <Text color={theme.dimGray}>{'─'.repeat(50)}</Text>
        <Text> </Text>
        
        {/* Video Player */}
        <Box>
          <Text color={selectedIndex === 0 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 0 ? '▸ ' : '  '}
            Video Player:{' '}
          </Text>
          <Text color={selectedIndex === 0 ? theme.cyan : theme.lightGray}>
            {'◀ '}{(settings.player || 'auto').toUpperCase()}{' ▶'}
          </Text>
        </Box>

        {/* AniSkip Mode */}
        <Box>
          <Text color={selectedIndex === 1 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 1 ? '▸ ' : '  '}
            AniSkip Mode:{' '}
          </Text>
          <Text color={selectedIndex === 1 ? theme.cyan : theme.lightGray}>
            {'◀ '}{(settings.skipMode || 'off').toUpperCase()}{' ▶'}
          </Text>
        </Box>
        
        {/* Anime4K Toggle */}
        <Box>
          <Text color={selectedIndex === 2 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 2 ? '▸ ' : '  '}
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
          <Text color={selectedIndex === 3 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 3 ? '▸ ' : '  '}
            Anime4K Mode:{' '}
          </Text>
          <Text color={selectedIndex === 3 ? theme.cyan : theme.lightGray}>
            {'◀ '}{settings.anime4kMode}{' ▶'}
          </Text>
        </Box>
        
        <Text> </Text>
        
        {/* Download Action */}
        <Box>
          <Text color={selectedIndex === 4 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 4 ? '▸ ' : '  '}
            {anime4kInstalled ? '↻ Re-download' : '↓ Download'} Anime4K Shaders
          </Text>
        </Box>
        
        {/* Back */}
        <Box>
          <Text color={selectedIndex === 5 ? theme.cyan : theme.lightGray}>
            {selectedIndex === 5 ? '▸ ' : '  '}
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
// ANIME DETAILS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AnimeDetailsView({
  animeInfo,
  history,
  onWatch,
  onDownload,
  onPlayTrailer,
  onToggleMyList,
  isInList,
  onBack,
  termSize,
}: {
  animeInfo: any;
  history: HistoryEntry[];
  onWatch: () => void;
  onDownload: () => void;
  onPlayTrailer: () => void;
  onToggleMyList: () => void;
  isInList: boolean;
  onBack: () => void;
  termSize: { cols: number; rows: number };
}) {
  const isNarrow = termSize.cols < 70;
  const [synopsisScroll, setSynopsisScroll] = useState(0);
  const [focusArea, setFocusArea] = useState<'actions' | 'synopsis'>('actions');
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);

  const histEntry = history.find(h => h.id === animeInfo?.id);
  const watchLabel = histEntry?.episode ? `▶ Continue from Episode ${histEntry.episode}` : '▶ Watch';

  const actionItems: { value: string; label: string; icon: string }[] = [
    { value: 'watch', label: watchLabel, icon: '[▶]' },
    { value: 'mylist', label: isInList ? '★ Remove from My List' : '☆ Add to My List', icon: isInList ? '[★]' : '[☆]' },
    { value: 'download', label: 'Download Episodes', icon: '[⬇]' },
  ];

  if (animeInfo?.trailer?.id || animeInfo?.trailer?.url) {
    actionItems.push({ value: 'trailer', label: 'Play Trailer', icon: '[🎬]' });
  }
  actionItems.push({ value: 'back', label: 'Back', icon: '[↩]' });

  // Moon phase score calculation
  const scoreData = renderScore(animeInfo?.averageScore);

  // Facts Line
  const formatStr = animeInfo?.format || 'TV';
  const isAiring = animeInfo?.status === 'RELEASING' || Boolean(animeInfo?.nextAiringEpisode);
  const statusStr = isAiring ? 'Airing' : (animeInfo?.status === 'FINISHED' ? 'Finished' : (animeInfo?.status || 'Unknown'));
  const seasonYearStr = `${animeInfo?.season ? animeInfo.season.charAt(0) + animeInfo.season.slice(1).toLowerCase() : ''} ${animeInfo?.year || ''}`.trim();
  const studiosStr = animeInfo?.studios?.length ? animeInfo.studios.slice(0, 2).join(', ') : '';

  const releasedCount = animeInfo?.episodes?.sub?.length || (animeInfo?.nextAiringEpisode ? animeInfo.nextAiringEpisode.episode - 1 : 0);
  const totalCount = animeInfo?.stats?.episodes?.sub || animeInfo?.totalEpisodes || null;
  const epFactsStr = isAiring
    ? `${releasedCount} released of ${totalCount || '?'}${animeInfo?.nextAiringEpisode ? ` (Ep ${animeInfo.nextAiringEpisode.episode} ${formatTimeUntilAiring(animeInfo.nextAiringEpisode.timeUntilAiring)})` : ''}`
    : `${releasedCount || totalCount || '?'} Episodes`;

  const factsParts = [
    formatStr,
    statusStr,
    seasonYearStr,
    studiosStr ? `Studio: ${studiosStr}` : null,
    epFactsStr,
  ].filter(Boolean);

  const contentWidth = Math.min(120, termSize.cols - 2);
  const artworkWidth = isNarrow ? Math.min(26, Math.max(16, termSize.cols - 6)) : 28;
  const artworkHeight = isNarrow ? 8 : 13;
  const artworkGap = isNarrow ? 0 : 3;
  const infoWidth = isNarrow ? contentWidth : Math.max(30, contentWidth - artworkWidth - artworkGap);

  // Synopsis wrapping
  const synopsisWidth = Math.max(20, infoWidth - 4);
  const rawSynopsis = animeInfo?.synopsis || animeInfo?.description || 'No synopsis available.';
  const synopsisLines = wrapText(rawSynopsis, synopsisWidth);
  const maxVisibleSynopsis = isNarrow ? 3 : 5;
  const visibleSynopsisLines = synopsisLines.slice(synopsisScroll, synopsisScroll + maxVisibleSynopsis);

  const handleActionSelect = (item: { value: string; label: string }) => {
    if (item.value === 'watch') onWatch();
    else if (item.value === 'download') onDownload();
    else if (item.value === 'trailer') onPlayTrailer();
    else if (item.value === 'mylist') onToggleMyList();
    else if (item.value === 'back') onBack();
  };

  // Keyboard navigation for synopsis scrolling & focus toggle
  useInput((input, key) => {
    if (key.escape || input === 'b') {
      onBack();
      return;
    }
    if (input === 'q') {
      quitBus.emit('quit');
      return;
    }
    if (key.tab) {
      setFocusArea(f => f === 'actions' ? 'synopsis' : 'actions');
      return;
    }

    if (input && /^[1-9]$/.test(input)) {
      const idx = parseInt(input, 10) - 1;
      if (idx >= 0 && idx < actionItems.length) {
        handleActionSelect(actionItems[idx]);
        return;
      }
    }

    if (focusArea === 'synopsis') {
      if (key.upArrow || input === 'k') {
        setSynopsisScroll(s => Math.max(0, s - 1));
      } else if (key.downArrow || input === 'j') {
        setSynopsisScroll(s => Math.min(Math.max(0, synopsisLines.length - maxVisibleSynopsis), s + 1));
      }
    } else {
      if (key.upArrow || input === 'k') {
        setSelectedActionIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow || input === 'j') {
        setSelectedActionIndex(i => Math.min(actionItems.length - 1, i + 1));
      } else if (key.return) {
        if (actionItems[selectedActionIndex]) {
          handleActionSelect(actionItems[selectedActionIndex]);
        }
      }
    }

    // Also support [ and ] or PageUp/PageDown for scrolling synopsis anytime
    if (input === '[' || key.pageUp) {
      setSynopsisScroll(s => Math.max(0, s - 2));
    } else if (input === ']' || key.pageDown) {
      setSynopsisScroll(s => Math.min(Math.max(0, synopsisLines.length - maxVisibleSynopsis), s + 2));
    }
  });

  return (
    <Box flexDirection="column" width={contentWidth}>
      <Box flexDirection={isNarrow ? 'column' : 'row'} width={contentWidth}>
        {/* Cover Artwork */}
        <Box
          flexDirection="column"
          marginRight={artworkGap}
          marginBottom={isNarrow ? 1 : 0}
          width={artworkWidth}
          flexShrink={0}
          alignItems="center"
        >
          <AnimeArtwork
            title={animeInfo?.name || ''}
            imageUrl={animeInfo?.poster}
            width={artworkWidth}
            height={artworkHeight}
          />
        </Box>

        {/* Info Column */}
        <Box flexDirection="column" width={infoWidth} flexShrink={0}>
          {/* Titles */}
          <Text bold color={theme.pink} wrap="wrap">{animeInfo?.titles?.english || animeInfo?.name || 'Untitled'}</Text>
          {animeInfo?.titles?.romaji && animeInfo.titles.romaji !== animeInfo?.titles?.english && (
            <Text color={theme.cyan} dimColor wrap="wrap">{animeInfo.titles.romaji}</Text>
          )}
          {animeInfo?.titles?.native && (
            <Text color={theme.dimGray} wrap="wrap">{animeInfo.titles.native}</Text>
          )}

          {/* Facts Line */}
          <Box marginTop={1}>
            <Text color={theme.yellow} bold wrap="wrap">
              {factsParts.join(' • ')}
            </Text>
          </Box>

          {/* Score line: moon glyphs + plain text bar + score */}
          <Box marginTop={1}>
            <Text color={theme.cyan}>Score: </Text>
            <Text color={theme.yellow}>{scoreData.glyphs} </Text>
            <Text color={theme.dimGray}>{scoreData.bar} </Text>
            <Text color={theme.white} bold>{scoreData.text}</Text>
          </Box>

          {/* Genres Line */}
          <Box marginTop={1}>
            <Text color={theme.cyan}>Genres: </Text>
            <Text color={theme.lightGray} wrap="wrap">
              {animeInfo?.genres?.length ? animeInfo.genres.join(' • ') : 'N/A'}
            </Text>
          </Box>

          {/* Synopsis */}
          <Box
            flexDirection="column"
            marginTop={1}
            borderStyle="round"
            borderColor={focusArea === 'synopsis' ? theme.yellow : theme.dimGray}
            paddingX={1}
            width={infoWidth}
          >
            <Box justifyContent="space-between">
              <Text bold color={theme.purple}>Synopsis</Text>
              <Text color={theme.dimGray} dimColor>
                {focusArea === 'synopsis' ? '↑↓ to scroll │ Tab to actions' : 'Tab or [/] to scroll'}
              </Text>
            </Box>
            {visibleSynopsisLines.map((line, idx) => (
              <Text key={idx} color={theme.white}>{line}</Text>
            ))}
          </Box>

          {/* Actions */}
          <Box
            marginTop={1}
            flexDirection="column"
            borderStyle="round"
            borderColor={focusArea === 'actions' ? theme.cyan : theme.dimGray}
            paddingX={1}
            width={infoWidth}
          >
            <Box justifyContent="space-between">
              <Text bold color={theme.cyan}>Actions</Text>
              <Text color={theme.dimGray} dimColor>
                {focusArea === 'actions' ? '↑↓ to select │ Enter to confirm │ Tab for synopsis' : 'Tab to focus actions'}
              </Text>
            </Box>
            {actionItems.map((item, idx) => {
              const isSelected = focusArea === 'actions' && idx === selectedActionIndex;
              return (
                <Box key={item.value}>
                  <Text color={isSelected ? theme.yellow : theme.dimGray}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={theme.dimGray}>{idx + 1}. </Text>
                  <Text color={isSelected ? theme.white : theme.lightGray} bold={isSelected}>
                    {item.icon} {item.label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>
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
  | 'browse-category'
  | 'browse-genre'
  | 'browse-season'
  | 'browse-results'
  | 'anime-select'
  | 'anime-details'
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
  | 'help'
  | 'playing';

const rawArgs = process.argv.slice(2);
const initialQuery = rawArgs.join(' ').trim();

export interface DownloadTask {
  id?: string;
  anilistId?: string;
  malId?: number;
  animeTitle: string;
  episodeNumber: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  message?: string;
  titles?: {
    english?: string;
    romaji?: string;
    native?: string;
  };
  year?: number | string;
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

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
  const [isDownloadMode, setIsDownloadMode] = useState<boolean>(false);

  // Browse state
  const [browseCategory, setBrowseCategory] = useState<string>('trending');
  const [browseCategoryTitle, setBrowseCategoryTitle] = useState<string>('Trending Now');
  const [browseGenre, setBrowseGenre] = useState<string>('Action');
  const [browseSeason, setBrowseSeason] = useState<string>('SPRING');
  const [browseYear, setBrowseYear] = useState<number>(2026);
  const [browseSort, setBrowseSort] = useState<'popularity' | 'score' | 'trending' | 'title'>('popularity');
  const [browsePage, setBrowsePage] = useState<number>(1);
  const [browseHasNext, setBrowseHasNext] = useState<boolean>(false);
  const [browseSource, setBrowseSource] = useState<string>('');
  const [browseAnimes, setBrowseAnimes] = useState<any[]>([]);
  const [genresList, setGenresList] = useState<string[]>([]);
  const [browseReturnScreen, setBrowseReturnScreen] = useState<Screen>('main-menu');

  const [playingEpisode, setPlayingEpisode] = useState<any>(null);
  const [playingPaused, setPlayingPaused] = useState(false);
  const [playingProviders, setPlayingProviders] = useState<{name: string, type: 'torrent'|'direct'|'embed'|'hls'|'mp4', url?: string, magnet?: string, headers?: any, subtitle?: string, candidate?: any}[]>([]);
  const [playingProviderIndex, setPlayingProviderIndex] = useState(0);
  const [playingAttempts, setPlayingAttempts] = useState<any[]>([]);

  // Expose these for the PlayingScreen
  const togglePause = () => {
    if (os.platform() === 'win32') return;
    const cmd = resolvePlayerCommand(appSettings);
    if (cmd === 'vlc') {
      setStatus({ message: 'Pause via hotkey is mpv-only (VLC uses its own controls)', type: 'info', loading: false });
      return;
    }
    if (playingPaused) {
      spawnSync('killall', ['-CONT', cmd]);
      setPlayingPaused(false);
    } else {
      spawnSync('killall', ['-STOP', cmd]);
      setPlayingPaused(true);
    }
  };

  const tryNextCandidate = (
    currentIndex: number,
    providerList: any[],
    resolveAttempts: any[],
    reason: string,
    playContext?: any
  ) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < providerList.length) {
      const nextProvider = providerList[nextIndex];
      setPlayingProviderIndex(nextIndex);
      setStatus({
        message: `${providerList[currentIndex]?.name || 'Candidate'} failed (${reason}). Trying ${nextProvider.name}...`,
        type: 'warning',
        loading: true,
      });
      playProvider(nextProvider, nextIndex, providerList, resolveAttempts, playContext);
    } else {
      const attemptSummary = resolveAttempts?.length
        ? resolveAttempts.map((a: any) => `${a.provider}: ${a.error || (a.success ? 'ok' : 'failed')}`).join('; ')
        : reason;
      setStatus({
        message: `All candidates failed. Attempts: ${attemptSummary}`,
        type: 'error',
        loading: false,
      });
    }
  };

  const playProvider = async (
    provider: any,
    providerIndex: number = 0,
    providerList: any[] = playingProviders,
    resolveAttempts: any[] = playingAttempts,
    playContext?: {
      malId?: number;
      epNo?: number;
      animeTitle?: string;
      mode?: 'sub' | 'dub';
    }
  ) => {
    const cmd = resolvePlayerCommand(appSettings);
    
    if (provider.type === 'torrent') {
      setStatus({ message: `Starting ${provider.name}...`, type: 'success', loading: false });
      const wtCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
      const playerFlag = cmd === 'vlc' ? '--vlc' : '--mpv';
      const proc = spawn(wtCmd, ['-y', 'webtorrent-cli', provider.magnet!, playerFlag], { stdio: 'ignore', detached: true });
      proc.on('error', (err: any) => {
        setStatus({ message: `Failed to launch webtorrent: ${err.message}`, type: 'error', loading: false });
      });
      proc.unref();
    } else if (provider.type === 'embed') {
      setStatus({ message: `Opening ${provider.name} in browser...`, type: 'info', loading: false });
      try {
        const platform = process.platform;
        let bCmd = 'xdg-open';
        let bArgs = [provider.url];
        if (platform === 'darwin') {
          bCmd = 'open';
        } else if (platform === 'win32') {
          bCmd = 'cmd';
          bArgs = ['/c', 'start', '', provider.url];
        }
        const bChild = spawn(bCmd, bArgs, { stdio: 'ignore', detached: true });
        bChild.on('error', (err) => {
          setStatus({ message: `Failed to open browser: ${err.message}`, type: 'error', loading: false });
        });
        bChild.unref();
      } catch (err: any) {
        setStatus({ message: `Failed to open browser: ${err.message}`, type: 'error', loading: false });
      }
    } else {
      setStatus({ message: `Starting ${provider.name} in ${cmd.toUpperCase()}...`, type: 'success', loading: false });
      const epNo = playContext?.epNo ?? playingEpisode?.number ?? 1;
      const malId = playContext?.malId ?? (animeInfo?.malId || undefined);
      const animeTitle = playContext?.animeTitle || selectedAnime?.label || animeInfo?.name || animeInfo?.titles?.english || 'Anime';
      const streamMode = playContext?.mode || (audioType === 'dub' ? 'dub' : 'sub');
      const playerTitle = `${animeTitle}, Episode ${epNo}`;

      let skipArgs: string[] = [];
      if (cmd === 'mpv' && appSettings.skipMode && appSettings.skipMode !== 'off' && malId) {
        try {
          skipArgs = await getMpvSkipArgs(malId, epNo, appSettings.skipMode);
        } catch {}
      }

      const args = buildPlayerArgs(cmd, provider.url, provider.headers, playerTitle, provider.subtitle, {
        audioType: streamMode,
        skipArgs,
      });
      const proc = spawn(cmd, args, { stdio: 'ignore' });

      let fiveSecPassed = false;
      const timer = setTimeout(() => {
        fiveSecPassed = true;
      }, 5000);

      proc.on('error', (err: any) => {
        clearTimeout(timer);
        tryNextCandidate(providerIndex, providerList, resolveAttempts, `Launch error: ${err.message}`, playContext);
      });

      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (!fiveSecPassed && code !== 0 && code !== null) {
          tryNextCandidate(providerIndex, providerList, resolveAttempts, `Player exited with code ${code}`, playContext);
        }
      });

      proc.unref();
    }
  };



  // Listen for quit requests from SIGINT/SIGTERM via quitBus
  useEffect(() => {
    const onQuitRequested = () => setIsExiting(true);
    quitBus.on('quit', onQuitRequested);
    return () => { quitBus.off('quit', onQuitRequested); };
  }, []);

  // Banner animation
  useEffect(() => {
    if (isExiting) return;
    const timer = setInterval(() => {
      setBannerPhase((p) => (p + 1) % 50);
    }, 120);
    return () => clearInterval(timer);
  }, [isExiting]);

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
    { value: 'browse', label: 'Browse', icon: '[B]' },
    { value: 'downloads', label: downloadQueue.length > 0 ? `Downloads (${downloadQueue.length})` : 'Downloads', icon: '[📥]' },
    { value: 'random', label: 'Random Anime', icon: '[🎲]' },
    { value: 'settings', label: 'Settings', icon: '[⚙]' },
    { value: 'help', label: 'Help', icon: '[?]' },
    { value: 'exit', label: 'Exit', icon: '[X]' },
  ];

  const loggedOutMenuItems: SelectItem[] = [
    { value: 'search', label: 'Search', icon: '[S]' },
    { value: 'browse', label: 'Browse', icon: '[B]' },
    { value: 'downloads', label: downloadQueue.length > 0 ? `Downloads (${downloadQueue.length})` : 'Downloads', icon: '[📥]' },
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
    } else if (action === 'search') {
      setScreen('search');
      setStatus({ message: 'Enter anime name to search', type: 'info', loading: false });
    } else if (action === 'browse') {
      setScreen('browse-category');
      setStatus({ message: 'Browse anime categories', type: 'info', loading: false });
    } else if (action === 'downloads') {
      setScreen('downloading');
      setStatus({ message: 'Downloads Queue', type: 'info', loading: false });
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
  }, [downloadQueue.length, screen]);

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
    
    const loginState = crypto.randomBytes(16).toString('hex');
    let server: any = null;
    let timeoutId: any = null;

    const cleanupServer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        try { server.close(); } catch {}
        server = null;
      }
    };

    const loginHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>NyAnime CLI Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.js"></script>
  <link rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.css"/>
  <style>
    body { background: #1a1b26; color: #a9b1d6; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
    .box { background: #24283b; padding: 2.5rem 2rem; border-radius: 16px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid rgba(187,154,247,0.2); }
    h1 { color: #bb9af7; margin: 0 0 0.5rem 0; font-size: 1.8rem; letter-spacing: -0.5px; }
    p { color: #a9b1d6; margin-bottom: 1.5rem; font-size: 0.95rem; line-height: 1.4; }
    .ok { display: none; color: #9ece6a; font-weight: bold; margin-top: 1.5rem; font-size: 1.1rem; }
    #loader { color: #7aa2f7; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>NyAnime CLI</h1>
    <p>Sign in to authorize Ny-CLI and sync your watch history.</p>
    <div id="ui"></div>
    <div id="loader">Loading sign-in...</div>
    <div id="ok" class="ok">✓ Successfully authorized! You may return to your terminal.</div>
  </div>
  <script>
    firebase.initializeApp({
      apiKey: "AIzaSyAfwO_c-_BbkiI0NcipTvGIya_R1EYyyTI",
      authDomain: "nyanime-tech.firebaseapp.com",
      projectId: "nyanime-tech",
      storageBucket: "nyanime-tech.firebasestorage.app",
      messagingSenderId: "677407184955",
      appId: "1:677407184955:web:b3cc5095e838c9017e241e"
    });
    const auth = firebase.auth();
    let sent = false;
    function notify(u) {
      if (sent) return;
      sent = true;
      document.getElementById('ui').style.display = 'none';
      document.getElementById('loader').style.display = 'none';
      document.getElementById('ok').style.display = 'block';
      u.getIdToken().then(idToken => {
        const payload = JSON.stringify({
          token: u.uid,
          idToken: idToken,
          refreshToken: u.refreshToken,
          username: u.displayName || u.email || 'AnimeFan',
          state: ${JSON.stringify(loginState)}
        });
        fetch('/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        }).catch(() => {
          fetch('http://localhost:8080/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          }).catch(console.error);
        });
      });
    }
    auth.onAuthStateChanged(u => {
      if (u) {
        notify(u);
      } else {
        document.getElementById('loader').style.display = 'none';
        new firebaseui.auth.AuthUI(auth).start('#ui', {
          callbacks: {
            signInSuccessWithAuthResult: function(r) {
              notify(r.user);
              return false;
            }
          },
          signInFlow: 'popup',
          signInOptions: [
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            firebase.auth.GoogleAuthProvider.PROVIDER_ID
          ]
        });
      }
    });
  </script>
</body>
</html>`;

    server = http.createServer((req: any, res: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const reqUrl = req.url || '/';
      const urlPath = reqUrl.split('?')[0];

      if (req.method === 'GET' && (urlPath === '/' || urlPath === '/cli-login' || urlPath === '/api/auth/login')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(loginHtml);
        return;
      }

      if (req.method === 'POST' && (urlPath === '/callback' || urlPath === '/api/auth/callback')) {
        setStatus({ message: 'Received callback connection...', type: 'info', loading: true });
        let body = '';
        req.on('data', (chunk: any) => body += chunk.toString());
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.token && data.username && (!loginState || !data.state || data.state === loginState)) {
              setStatus({ message: 'Callback verified, logging in...', type: 'info', loading: true });
              setPendingUsername(data.username);
              handleLoginToken(data.token, data.username, data.idToken, data.refreshToken);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
              cleanupServer();
              return;
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'invalid_token_or_state' }));
            }
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_json' }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    const openBrowser = (url: string) => {
      try {
        const platform = process.platform;
        let cmd = 'xdg-open';
        let args = [url];
        if (platform === 'darwin') {
          cmd = 'open';
        } else if (platform === 'win32') {
          cmd = 'cmd';
          args = ['/c', 'start', '', url];
        }
        const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
        child.on('error', (err) => {
          setStatus({ message: 'Failed to open browser: ' + err.message, type: 'error', loading: false });
        });
        child.unref();
      } catch (err: any) {
        setStatus({ message: 'Failed to open browser: ' + (err?.message || String(err)), type: 'error', loading: false });
      }
    };

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        try {
          const fallbackServer = http.createServer(server.listeners('request')[0] as any);
          server.close();
          server = fallbackServer;
          fallbackServer.on('error', (fallbackErr: any) => {
            setStatus({ message: 'Login server error: ' + fallbackErr.message, type: 'error', loading: false });
            cleanupServer();
          });
          fallbackServer.listen(4000, () => {
            openBrowser('http://localhost:8080/');
          });
        } catch (fallbackErr: any) {
          setStatus({ message: 'Login server error: ' + fallbackErr.message, type: 'error', loading: false });
          cleanupServer();
        }
      } else {
        setStatus({ message: 'Login server error: ' + err.message, type: 'error', loading: false });
        cleanupServer();
      }
    });

    server.listen(8080, () => {
      openBrowser('http://localhost:8080/');
    });

    // Auto-close after 5 minutes
    timeoutId = setTimeout(() => {
      cleanupServer();
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
      if (isDownloadMode) {
        setIsDownloadMode(false);
        setScreen('anime-details');
        setStatus({ message: selectedAnime?.label || animeInfo?.name || 'Anime Details', type: 'info', loading: false });
      } else {
        setScreen('audio-select');
        setStatus({ message: 'Select audio type', type: 'info', loading: false });
      }
    } else if (screen === 'audio-select') {
      setScreen('anime-details');
      setStatus({ message: selectedAnime?.label || animeInfo?.name || 'Anime Details', type: 'info', loading: false });
    } else if (screen === 'anime-details') {
      if (browseReturnScreen === 'browse-results') {
        setScreen('browse-results');
        setStatus({ message: `Browse: ${browseCategory === 'genre' ? browseGenre : browseCategoryTitle} (Page ${browsePage})`, type: 'info', loading: false });
      } else if (browseReturnScreen === 'browse-category') {
        setScreen('browse-category');
        setStatus({ message: 'Browse anime categories', type: 'info', loading: false });
      } else {
        setScreen('anime-select');
        setStatus({ message: `Found ${animes.length} anime`, type: 'success', loading: false });
      }
    } else if (screen === 'browse-results') {
      if (browseCategory === 'genre') {
        setScreen('browse-genre');
        setStatus({ message: 'Select a genre', type: 'info', loading: false });
      } else if (browseCategory === 'season') {
        setScreen('browse-season');
        setStatus({ message: 'Select season and year', type: 'info', loading: false });
      } else {
        setScreen('browse-category');
        setStatus({ message: 'Browse anime categories', type: 'info', loading: false });
      }
    } else if (screen === 'browse-genre' || screen === 'browse-season') {
      setScreen('browse-category');
      setStatus({ message: 'Browse anime categories', type: 'info', loading: false });
    } else if (screen === 'browse-category') {
      setScreen('main-menu');
      setStatus({ message: 'Welcome to NY-CLI!', type: 'info', loading: false });
    } else if (screen === 'login-token') {
      setScreen('login');
      setPendingUsername('');
      setStatus({ message: 'Enter your NyAnime username', type: 'info', loading: false });
    } else if (['anime-select', 'continue', 'search', 'profile', 'login', 'settings', 'help', 'downloading'].includes(screen)) {
      setScreen('main-menu');
      setStatus({ message: 'Welcome to NY-CLI!', type: 'info', loading: false });
    }
  }, [screen, browseReturnScreen, browseCategory, browseGenre, browseCategoryTitle, browsePage, animes.length, selectedAnime, animeInfo]);

  const handleEpisodeAction = useCallback((action: string, item: SelectItem) => {
    if (action === 'd' || action === 'a') {
      const itemsToDownload = action === 'a' ? episodes.map((e, idx) => ({
        ...e,
        label: `Episode ${e.number || idx + 1}`,
        value: `ep-${e.number || idx + 1}`,
        episodeId: e.episodeId || e.id,
        number: e.number || idx + 1,
      })) : [item];

      const anilistId = animeInfo?.anilistId || (String(animeInfo?.id || '').startsWith('anilist::') ? String(animeInfo.id).replace('anilist::', '') : '');
      const malId = animeInfo?.malId;
      const titles = animeInfo?.titles || {
        english: animeInfo?.name || selectedAnime?.label,
        romaji: animeInfo?.jname || selectedAnime?.label,
        native: ''
      };
      const year = animeInfo?.year;

      const newTasks: DownloadTask[] = itemsToDownload.map((ep: any) => ({
        id: ep.episodeId || ep.id,
        anilistId,
        malId,
        titles,
        year,
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
    setBrowseReturnScreen(screen);

    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id!)}`);
      
      const eps = data?.episodes?.sub?.length ? data.episodes.sub : (data?.episodes?.dub || []);
      const totalCount = eps.length || data?.totalEpisodes || data?.stats?.episodes?.sub || 0;

      if (totalCount === 0 && (!data?.status || data.status === 'FINISHED') && !data?.name) {
        setStatus({ message: 'No episodes found', type: 'warning', loading: false });
        return;
      }

      setSelectedAnime(item);
      setAnimeInfo(data);
      setScreen('anime-details');
      setStatus({ message: `${item.label} Details`, type: 'info', loading: false });
    } catch (err: any) {
      setStatus({ message: `Failed to load: ${err.message}`, type: 'error', loading: false });
    }
  }, [screen]);

  const handleWatchFromDetails = useCallback(() => {
    setIsDownloadMode(false);
    const histEntry = history.find(h => h.id === animeInfo?.id);
    if (histEntry) {
      const type = histEntry.category || 'sub';
      setAudioType(type);
      const eps = animeInfo?.episodes?.[type] || animeInfo?.episodes?.sub || [];
      setEpisodes(eps);

      let targetEpisode = histEntry.episode || 1;
      const progress = getWatchProgress(animeInfo.id, targetEpisode);
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

      setScreen('episode-select');
      setStatus({ message: `Continue Episode ${targetEpisode}`, type: 'success', loading: false });
    } else {
      setScreen('audio-select');
      setStatus({ message: 'Select audio type', type: 'info', loading: false });
    }
  }, [animeInfo, history]);

  const handleDownloadFromDetails = useCallback(() => {
    const hasDub = Boolean(animeInfo?.episodes?.dub?.length);
    if (hasDub) {
      setIsDownloadMode(true);
      setScreen('audio-select');
      setStatus({ message: 'Select audio type to download', type: 'info', loading: false });
    } else {
      const type = 'sub';
      setAudioType(type);
      let eps = animeInfo?.episodes?.[type]?.length 
        ? animeInfo.episodes[type] 
        : (animeInfo?.episodes?.sub?.length 
          ? animeInfo.episodes.sub 
          : (animeInfo?.episodes?.dub?.length ? animeInfo.episodes.dub : []));

      if (!eps || !eps.length) {
        const count = animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || 1;
        eps = Array.from({ length: Math.max(1, count) }, (_, idx) => ({
          id: `ep::fallback::${animeInfo?.id || 'unknown'}::${idx + 1}`,
          number: idx + 1,
          title: count === 1 ? (animeInfo?.name || 'Full Feature') : `Episode ${idx + 1}`,
          isFiller: false,
        }));
      }

      setEpisodes(eps);
      setIsDownloadMode(true);
      setScreen('episode-select');
      setStatus({ message: 'Select episode to download (Enter / [d] for single, [a] for all)', type: 'info', loading: false });
    }
  }, [animeInfo]);

  const handlePlayTrailer = useCallback(() => {
    const trailer = animeInfo?.trailer;
    let trailerUrl = trailer?.url;
    if (!trailerUrl && trailer?.id) {
      if (!trailer.site || trailer.site.toLowerCase() === 'youtube') {
        trailerUrl = `https://www.youtube.com/watch?v=${trailer.id}`;
      } else {
        trailerUrl = trailer.id;
      }
    }
    if (!trailerUrl) {
      setStatus({ message: 'No trailer available', type: 'warning', loading: false });
      return;
    }
    const cmd = resolvePlayerCommand(appSettings);
    const title = `NY-CLI Trailer: ${animeInfo?.titles?.english || animeInfo?.name || selectedAnime?.label || 'Trailer'}`;
    const args = cmd === 'mpv' ? [`--title=${title}`, trailerUrl] : [trailerUrl];
    setStatus({ message: `Opening trailer in ${cmd.toUpperCase()}...`, type: 'info', loading: false });
    try {
      const proc = spawn(cmd, args, { stdio: 'ignore', detached: true });
      proc.on('error', (err: any) => {
        setStatus({ message: `Failed to launch player: ${err.message}`, type: 'error', loading: false });
      });
      proc.unref();
      setStatus({ message: `Playing trailer in ${cmd.toUpperCase()}`, type: 'success', loading: false });
    } catch (err: any) {
      setStatus({ message: `Failed to launch player: ${err.message}`, type: 'error', loading: false });
    }
  }, [animeInfo, selectedAnime, appSettings]);

  const handleToggleMyList = useCallback(() => {
    if (!animeInfo?.id) return;
    if (isInMyList(animeInfo.id)) {
      removeFromMyList(animeInfo.id);
      setStatus({ message: `Removed "${animeInfo.titles?.english || animeInfo.name || selectedAnime?.label}" from My List`, type: 'info', loading: false });
    } else {
      addToMyList({
        id: animeInfo.id,
        name: animeInfo.titles?.english || animeInfo.name || selectedAnime?.label || 'Anime',
        poster: animeInfo.poster || selectedAnime?.imageUrl,
        format: animeInfo.format,
        year: animeInfo.year,
        addedAt: Date.now(),
      });
      setStatus({ message: `Added "${animeInfo.titles?.english || animeInfo.name || selectedAnime?.label}" to My List`, type: 'success', loading: false });
    }
  }, [animeInfo, selectedAnime]);

  const fetchBrowseResults = useCallback(async (cat: string, opts: { page?: number; genre?: string; season?: string; year?: number; sort?: string } = {}) => {
    const p = opts.page ?? 1;
    const g = opts.genre ?? browseGenre;
    const s = opts.season ?? browseSeason;
    const y = opts.year ?? browseYear;
    const srt = opts.sort ?? browseSort;

    setStatus({ message: `Fetching ${cat === 'genre' ? g : (cat === 'season' ? `${s} ${y}` : cat)} (page ${p})...`, type: 'info', loading: true });

    try {
      let url = `/api/aniwatch?action=browse&category=${encodeURIComponent(cat)}&page=${p}`;
      if (cat === 'genre') {
        url += `&genre=${encodeURIComponent(g)}&sort=${encodeURIComponent(srt)}`;
      } else if (cat === 'season') {
        url += `&season=${encodeURIComponent(s)}&year=${encodeURIComponent(y)}`;
      }
      const data = await getJson(url);
      const items = data?.animes || [];

      if (!items.length) {
        setStatus({ message: `No anime found for ${cat} (page ${p})`, type: 'warning', loading: false });
        return;
      }

      setBrowseAnimes(items);
      setBrowseCategory(cat);
      setBrowsePage(data?.currentPage || p);
      setBrowseHasNext(!!data?.hasNextPage);
      setBrowseSource(data?.provider || 'unknown');
      setScreen('browse-results');
      setStatus({ 
        message: `${cat === 'genre' ? `${g} (${srt})` : (cat === 'season' ? `${s} ${y}` : cat)} • Page ${p} [Source: ${data?.provider || 'unknown'}]`, 
        type: 'success', 
        loading: false 
      });
    } catch (err: any) {
      setStatus({ message: `Browse failed: ${err.message}`, type: 'error', loading: false });
    }
  }, [browseGenre, browseSeason, browseYear, browseSort]);

  const handleBrowsePageNext = useCallback(async () => {
    const nextPage = browsePage + 1;
    await fetchBrowseResults(browseCategory, { page: nextPage, genre: browseGenre, season: browseSeason, year: browseYear, sort: browseSort });
  }, [browsePage, browseCategory, browseGenre, browseSeason, browseYear, browseSort, fetchBrowseResults]);

  const handleBrowsePagePrev = useCallback(async () => {
    if (browsePage <= 1) return;
    const prevPage = browsePage - 1;
    await fetchBrowseResults(browseCategory, { page: prevPage, genre: browseGenre, season: browseSeason, year: browseYear, sort: browseSort });
  }, [browsePage, browseCategory, browseGenre, browseSeason, browseYear, browseSort, fetchBrowseResults]);

  const handleBrowseSortToggle = useCallback(async () => {
    if (browseCategory !== 'genre') return;
    const sorts: ('popularity' | 'score' | 'trending' | 'title')[] = ['popularity', 'score', 'trending', 'title'];
    const currentIdx = sorts.indexOf(browseSort);
    const nextSort = sorts[(currentIdx + 1) % sorts.length];
    setBrowseSort(nextSort);
    await fetchBrowseResults('genre', { page: 1, genre: browseGenre, sort: nextSort });
  }, [browseCategory, browseSort, browseGenre, fetchBrowseResults]);

  const handleSurpriseMe = useCallback(async () => {
    setStatus({ message: 'Finding surprise anime...', type: 'info', loading: true });
    try {
      const randomPage = Math.floor(Math.random() * 3) + 1;
      const cat = Math.random() > 0.5 ? 'top-rated' : 'trending';
      const data = await getJson(`/api/aniwatch?action=browse&category=${cat}&page=${randomPage}`);
      const items = data?.animes || [];
      if (items.length > 0) {
        const pick = items[Math.floor(Math.random() * items.length)];
        setStatus({ message: `Surprise: "${pick.name}"!`, type: 'success', loading: false });
        setBrowseReturnScreen('browse-category');
        handleAnimeSelect({
          id: pick.id,
          label: pick.name,
          imageUrl: pick.poster,
        });
      } else {
        setStatus({ message: 'Could not find surprise anime', type: 'warning', loading: false });
      }
    } catch (err: any) {
      setStatus({ message: `Surprise failed: ${err.message}`, type: 'error', loading: false });
    }
  }, [handleAnimeSelect]);

  const handleBrowseCategorySelect = useCallback(async (item: SelectItem) => {
    const cat = item.value || 'trending';
    setBrowseCategory(cat);
    setBrowseCategoryTitle(item.label);

    if (cat === 'surprise') {
      handleSurpriseMe();
    } else if (cat === 'genre') {
      setStatus({ message: 'Loading genres...', type: 'info', loading: true });
      try {
        const data = await getJson('/api/aniwatch?action=genres');
        const list: string[] = data?.genres || [];
        setGenresList(list);
        setBrowseSource(data?.provider || 'unknown');
        setScreen('browse-genre');
        setStatus({ message: `Select a genre (${data?.provider || 'unknown'})`, type: 'info', loading: false });
      } catch (err: any) {
        setStatus({ message: `Failed to load genres: ${err.message}`, type: 'error', loading: false });
      }
    } else if (cat === 'season') {
      setScreen('browse-season');
      setStatus({ message: 'Select season and year', type: 'info', loading: false });
    } else {
      setBrowsePage(1);
      await fetchBrowseResults(cat, { page: 1 });
    }
  }, [fetchBrowseResults, handleSurpriseMe]);

  const handleBrowseGenreSelect = useCallback(async (item: SelectItem) => {
    const selectedGenre = item.value || item.label;
    setBrowseGenre(selectedGenre);
    setBrowseSort('popularity');
    setBrowsePage(1);
    await fetchBrowseResults('genre', { genre: selectedGenre, sort: 'popularity', page: 1 });
  }, [fetchBrowseResults]);

  const handleBrowseSeasonSelect = useCallback(async (item: SelectItem) => {
    const [s, yStr] = (item.value || 'SPRING-2026').split('-');
    const y = parseInt(yStr, 10) || 2026;
    setBrowseSeason(s);
    setBrowseYear(y);
    setBrowsePage(1);
    await fetchBrowseResults('season', { season: s, year: y, page: 1 });
  }, [fetchBrowseResults]);

  const handleAudioSelect = useCallback((item: SelectItem) => {
    const type = item.value as 'sub' | 'dub';
    setAudioType(type);
    
    let eps = animeInfo?.episodes?.[type]?.length 
      ? animeInfo.episodes[type] 
      : (animeInfo?.episodes?.sub?.length 
        ? animeInfo.episodes.sub 
        : (animeInfo?.episodes?.dub?.length ? animeInfo.episodes.dub : []));

    // Fallback if episodes array is empty: provide at least 1 episode (or totalEpisodes count)
    if (!eps || !eps.length) {
      const count = animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || 1;
      eps = Array.from({ length: Math.max(1, count) }, (_, idx) => ({
        id: `ep::fallback::${animeInfo?.id || 'unknown'}::${idx + 1}`,
        number: idx + 1,
        title: count === 1 ? (animeInfo?.name || 'Full Feature') : `Episode ${idx + 1}`,
        isFiller: false,
      }));
    }

    setEpisodes(eps);
    setScreen('episode-select');
    setStatus({ message: `${eps.length} episode${eps.length === 1 ? '' : 's'} (${type === 'sub' ? 'subbed' : 'dubbed'})`, type: 'success', loading: false });
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

      // Extract IDs and title metadata
      const epIdParts = String(item.episodeId || item.id || '').split('::');
      const malId = epIdParts[0] === 'ep' && epIdParts[1] === 'jikan' ? Number(epIdParts[2]) : (epIdParts[0] === 'ep' && !isNaN(Number(epIdParts[1])) ? Number(epIdParts[1]) : (animeInfo?.malId || undefined));
      const anilistId = animeInfo?.anilistId || (String(animeInfo?.id || '').startsWith('anilist::') ? String(animeInfo.id).replace('anilist::', '') : '');
      const englishTitle = animeInfo?.titles?.english || '';
      const romajiTitle = animeInfo?.titles?.romaji || animeJName || '';
      const nativeTitle = animeInfo?.titles?.native || '';
      const year = animeInfo?.year || '';

      // Check if already downloaded locally
      const safeTitle = (animeTitle || 'Anime').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const localFile = path.join(os.homedir(), 'Downloads', 'ny-cli', safeTitle, `${safeTitle}_Ep${epNo}.mp4`);
      const providers: {name: string, type: 'torrent'|'direct'|'embed'|'hls'|'mp4', url?: string, magnet?: string, headers?: any, subtitle?: string, candidate?: any}[] = [];

      if (fs.existsSync(localFile)) {
        providers.push({
          name: 'Local File (Downloaded)',
          type: 'direct',
          url: localFile,
        });
      }

      // ── Resolve Tier 1 and Tier 2 streams (Direct / Embed) ──────────────────
      setStatus({ message: `Resolving stream for Episode ${epNo}...`, type: 'info', loading: true });

      const queryParams = new URLSearchParams({
        title: animeTitle,
        epNo: String(epNo),
        mode,
      });
      if (malId) queryParams.set('malId', String(malId));
      if (anilistId) queryParams.set('anilistId', String(anilistId));
      if (englishTitle) queryParams.set('englishTitle', englishTitle);
      if (romajiTitle) queryParams.set('romajiTitle', romajiTitle);
      if (nativeTitle) queryParams.set('nativeTitle', nativeTitle);
      if (year) queryParams.set('year', String(year));

      let streamRes: any = null;
      try {
        streamRes = await getJson(`/api/resolve-stream?${queryParams.toString()}`);
      } catch (err: any) {
        streamRes = { candidates: [], attempts: err.attempts || [] };
      }

      const candidates: any[] = streamRes?.candidates || (streamRes?.url ? [streamRes] : []);
      const attempts: any[] = streamRes?.attempts || [];

      for (const c of candidates) {
        if (c.url) {
          providers.push({
            name: `${c.provider || 'Provider'} (${c.quality || c.type?.toUpperCase() || 'Stream'})`,
            type: c.type || 'direct',
            url: c.url,
            subtitle: c.subtitleTracks?.[0]?.src || c.subtitle,
            headers: c.referer ? { Referer: c.referer, Origin: new URL(c.referer).origin } : c.headers,
            candidate: c,
          });
        }
      }

      // ── Torrent Search: ONLY when all direct and embed candidates failed ────
      if (providers.length === 0) {
        setStatus({ message: 'No direct stream found, trying torrent (slower)...', type: 'info', loading: true });

        let torrentData: any = null;
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Torrent search stall timeout')), 8000));
          torrentData = await Promise.race([
            getJson(`/api/torrent?title=${encodeURIComponent(animeTitle)}&ep=${epNo}`),
            timeoutPromise,
          ]);
        } catch {
          torrentData = null;
        }

        if (torrentData?.magnet) {
          providers.push({ name: 'Nyaa (Torrent)', type: 'torrent', magnet: torrentData.magnet });
        }
      }

      if (providers.length === 0) {
        const attemptSummary = attempts.length
          ? attempts.map((a: any) => `${a.provider}: ${a.error || (a.success ? 'ok' : 'failed')}`).join('; ')
          : 'no candidates available';
        setStatus({ message: `No playable source found (${attemptSummary})`, type: 'error', loading: false });
        return;
      }

      setPlayingProviders(providers);
      setPlayingProviderIndex(0);
      setPlayingAttempts(attempts);
      setPlayingEpisode(item);
      setPlayingPaused(false);
      setScreen('playing');

      // Start the best provider with sequential fallthrough support
      playProvider(providers[0], 0, providers, attempts, { malId, epNo, animeTitle, mode });


      const epAnimeTitle = selectedAnime?.label || animeInfo?.name || animeInfo?.title || '';
      const animeId = selectedAnime?.id || '';
      const episodeNum = item.number || 1;

      if (animeId && epAnimeTitle) {
        saveToHistory({ id: animeId, title: epAnimeTitle, episode: episodeNum, timestamp: Date.now(), category: audioType, totalEpisodes: totalEps });
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
    
    setDownloadQueue(prev => prev.map((t, idx) => 
      idx === nextTaskIndex ? { ...t, status: 'downloading', message: 'Resolving stream...' } : t
    ));

    const startDownload = async () => {
      try {
        const epIdParts = String(task.id || '').split('::');
        const malId = task.malId || (epIdParts[0] === 'ep' && epIdParts[1] === 'jikan' ? Number(epIdParts[2]) : (epIdParts[0] === 'ep' && !isNaN(Number(epIdParts[1])) ? Number(epIdParts[1]) : undefined));

        const safeTitle = (task.animeTitle || 'Anime').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const outDir = path.join(os.homedir(), 'Downloads', 'ny-cli', safeTitle);
        
        let isTorrent = false;
        let magnetLink = '';
        let streamUrl = '';
        let streamHeaders: any = {};

        const qParams = new URLSearchParams({
          title: task.animeTitle,
          epNo: String(task.episodeNumber),
          mode: audioType,
        });
        if (malId) qParams.set('malId', String(malId));
        if (task.anilistId) qParams.set('anilistId', String(task.anilistId));
        if (task.titles?.english) qParams.set('englishTitle', task.titles.english);
        if (task.titles?.romaji) qParams.set('romajiTitle', task.titles.romaji);
        if (task.titles?.native) qParams.set('nativeTitle', task.titles.native);
        if (task.year) qParams.set('year', String(task.year));

        let backendStreamRes: any = null;
        try {
          backendStreamRes = await getJson(`/api/resolve-stream?${qParams.toString()}`);
        } catch {
          backendStreamRes = null;
        }

        const candidates = backendStreamRes?.candidates || (backendStreamRes?.url ? [backendStreamRes] : []);
        const backendStream = candidates.find((c: any) => c.type === 'hls' || c.type === 'mp4') || candidates[0];

        if (backendStream?.url) {
          streamUrl = backendStream.url;
          if (backendStream.referer) {
            streamHeaders = { Referer: backendStream.referer, Origin: new URL(backendStream.referer).origin };
          } else if (backendStream.headers) {
            streamHeaders = backendStream.headers;
          }
        } else {
          // Fall back to torrent only when direct stream fails
          setDownloadQueue(prev => prev.map((t, idx) => 
            idx === nextTaskIndex ? { ...t, message: 'No direct stream — searching torrent...' } : t
          ));
          const torrentData = await getJson(
            `/api/torrent?title=${encodeURIComponent(task.animeTitle)}&ep=${task.episodeNumber}`
          ).catch(() => null);

          if (torrentData?.magnet) {
            magnetLink = torrentData.magnet;
            isTorrent = true;
          }
        }

        if (isTorrent && magnetLink) {
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
          
          setDownloadQueue(prev => prev.map((t, idx) => 
            idx === nextTaskIndex ? { ...t, message: 'Downloading Torrent...' } : t
          ));

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

                setDownloadQueue(prev => prev.map((t, idx) => 
                  idx === nextTaskIndex ? { ...t, progress, message: msg } : t
                ));
             }
          });

          wtProcess.on('close', (code) => {
             setDownloadQueue(prev => prev.map((t, idx) => 
               idx === nextTaskIndex ? {
                 ...t,
                 status: code === 0 ? 'completed' : 'error',
                 message: code === 0 ? 'Completed' : 'WebTorrent Error',
                 progress: code === 0 ? 100 : t.progress
               } : t
             ));
          });

          wtProcess.on('error', (err: any) => {
             setDownloadQueue(prev => prev.map((t, idx) => 
               idx === nextTaskIndex ? {
                 ...t,
                 status: 'error',
                 message: `Failed to launch webtorrent: ${err.message}`
               } : t
             ));
          });

          // Stall detector: if no progress change in 45s, mark as error
          let lastProgress = -1;
          const stallTimer = setInterval(() => {
            setDownloadQueue(prev => {
              const current = prev[nextTaskIndex];
              if (current?.status === 'completed' || current?.status === 'error') {
                clearInterval(stallTimer);
                return prev;
              }
              if (current?.progress === lastProgress) {
                clearInterval(stallTimer);
                try { wtProcess.kill(); } catch {}
                return prev.map((t, idx) => 
                  idx === nextTaskIndex ? {
                    ...t,
                    status: 'error',
                    message: 'No seeders found — try again later or use a direct source'
                  } : t
                );
              }
              lastProgress = current?.progress ?? -1;
              return prev;
            });
          }, 45000);

          return;
        }

        // Direct stream download
        if (!streamUrl) {
          throw new Error('No stream or torrent found');
        }

        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const filename = path.join(outDir, `${safeTitle}_Ep${task.episodeNumber}.mp4`);

        // Check tool availability
        const hasFfmpeg = (() => {
          try {
            const res = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
            return res.status === 0;
          } catch { return false; }
        })();
        const hasYtDlp = (() => {
          try {
            const res = spawnSync('yt-dlp', ['--version'], { stdio: 'pipe' });
            return res.status === 0;
          } catch { return false; }
        })();

        if (!hasFfmpeg && !hasYtDlp) {
          throw new Error('Neither ffmpeg nor yt-dlp is installed. Please install ffmpeg or yt-dlp to download streams.');
        }

        if (hasFfmpeg) {
          setDownloadQueue(prev => prev.map((t, idx) => 
            idx === nextTaskIndex ? { ...t, message: 'Downloading via FFmpeg...' } : t
          ));

          const ffmpegArgs = ['-y'];
          // HLS options MUST precede -i to allow TS segments disguised as JPG/images
          ffmpegArgs.push(
            '-allowed_extensions', 'ALL',
            '-allowed_segment_extensions', 'ALL',
            '-extension_picky', '0'
          );

          let customHeaders = '';
          if (streamHeaders?.Referer) {
            customHeaders += `Referer: ${streamHeaders.Referer}\r\n`;
          }
          if (streamHeaders?.['User-Agent'] || streamHeaders?.['user-agent']) {
            customHeaders += `User-Agent: ${streamHeaders['User-Agent'] || streamHeaders['user-agent']}\r\n`;
          } else {
            customHeaders += 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n';
          }
          ffmpegArgs.push('-headers', customHeaders);

          ffmpegArgs.push(
            '-i', streamUrl,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-progress', 'pipe:1',
            '-nostats',
            filename
          );

          const ffmpegProc = spawn('ffmpeg', ffmpegArgs);
          let durationUs = 0;

          ffmpegProc.stderr.on('data', (data: any) => {
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

          ffmpegProc.stdout.on('data', (data: any) => {
            const output = data.toString();
            const timeMatch = output.match(/out_time_us=(\d+)/);
            const speedMatch = output.match(/speed=\s*([0-9.]+x)/);
            const speed = speedMatch ? speedMatch[1] : '';

            if (timeMatch) {
              const timeUs = parseInt(timeMatch[1]);
              if (durationUs > 0) {
                const progress = Math.min(100, Math.max(0, Math.floor((timeUs / durationUs) * 100)));
                setDownloadQueue(prev => prev.map((t, idx) => 
                  idx === nextTaskIndex ? {
                    ...t,
                    progress,
                    message: speed ? `Downloading (${speed})...` : 'Downloading...'
                  } : t
                ));
              } else {
                const timeSec = Math.floor(timeUs / 1000000);
                const min = Math.floor(timeSec / 60);
                const sec = timeSec % 60;
                setDownloadQueue(prev => prev.map((t, idx) => 
                  idx === nextTaskIndex ? {
                    ...t,
                    message: `Downloaded ${min}m${sec}s${speed ? ` (${speed})` : ''}...`
                  } : t
                ));
              }
            }
          });

          ffmpegProc.on('close', (code) => {
            setDownloadQueue(prev => prev.map((t, idx) => 
              idx === nextTaskIndex ? {
                ...t,
                status: code === 0 ? 'completed' : 'error',
                message: code === 0 ? 'Completed' : `FFmpeg error (exit ${code})`,
                progress: code === 0 ? 100 : t.progress
              } : t
            ));
          });

          ffmpegProc.on('error', (err: any) => {
            setDownloadQueue(prev => prev.map((t, idx) => 
              idx === nextTaskIndex ? {
                ...t,
                status: 'error',
                message: `Failed to launch ffmpeg: ${err.message}`
              } : t
            ));
          });
        } else {
          // yt-dlp fallback
          setDownloadQueue(prev => prev.map((t, idx) => 
            idx === nextTaskIndex ? { ...t, message: 'Downloading via yt-dlp...' } : t
          ));

          const ytdlpArgs = [
            '--no-playlist',
            '--downloader-args', 'ffmpeg_i:-extension_picky 0 -allowed_extensions ALL -allowed_segment_extensions ALL',
            streamUrl,
            '-o', filename,
          ];
          if (streamHeaders?.Referer) {
            ytdlpArgs.push('--referer', streamHeaders.Referer);
          }
          ytdlpArgs.push(
            '--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          );

          const ytdlpProc = spawn('yt-dlp', ytdlpArgs);

          ytdlpProc.stdout.on('data', (data: any) => {
            const output = data.toString();
            const pctMatch = output.match(/(\d+(?:\.\d+)?)%/);
            const speedMatch = output.match(/at\s+([0-9.]+[KMG]i?B\/s)/);
            if (pctMatch) {
              const progress = Math.min(100, Math.floor(parseFloat(pctMatch[1])));
              const speed = speedMatch ? speedMatch[1] : '';
              setDownloadQueue(prev => prev.map((t, idx) => 
                idx === nextTaskIndex ? {
                  ...t,
                  progress,
                  message: speed ? `Downloading (${speed})...` : 'Downloading...'
                } : t
              ));
            }
          });

          ytdlpProc.on('close', (code) => {
            setDownloadQueue(prev => prev.map((t, idx) => 
              idx === nextTaskIndex ? {
                ...t,
                status: code === 0 ? 'completed' : 'error',
                message: code === 0 ? 'Completed' : `yt-dlp error (exit ${code})`,
                progress: code === 0 ? 100 : t.progress
              } : t
            ));
          });

          ytdlpProc.on('error', (err: any) => {
            setDownloadQueue(prev => prev.map((t, idx) => 
              idx === nextTaskIndex ? {
                ...t,
                status: 'error',
                message: `Failed to launch yt-dlp: ${err.message}`
              } : t
            ));
          });
        }
      } catch (err: any) {
        setDownloadQueue(prev => prev.map((t, idx) => 
          idx === nextTaskIndex ? {
            ...t,
            status: 'error',
            message: err.message
          } : t
        ));
      }
    };

    startDownload();

  }, [downloadQueue, audioType]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTED DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const getAnimeItemTitle = (a: any): string => {
    if (typeof a.name === 'string' && a.name.trim()) return a.name;
    if (typeof a.title === 'string' && a.title.trim()) return a.title;
    if (a.title && typeof a.title === 'object') {
      return a.title.english || a.title.romaji || a.title.userPreferred || a.title.native || '';
    }
    if (typeof a.jname === 'string' && a.jname.trim()) return a.jname;
    return 'Untitled';
  };

  const animeItems: SelectItem[] = animes.map((a) => {
    const title = getAnimeItemTitle(a);
    const subCount = a.episodes?.sub ?? (typeof a.episodes === 'number' ? a.episodes : 0);
    const dubCount = a.episodes?.dub ?? 0;
    return {
      id: a.id,
      label: title,
      badge: a.episodes ? `sub ${subCount} / dub ${dubCount}` : undefined,
      imageUrl: a.poster || a.artwork || undefined,
    };
  });

  const browseAnimeItems: SelectItem[] = browseAnimes.map((a) => {
    const title = getAnimeItemTitle(a);
    const subCount = a.episodes?.sub ?? (typeof a.episodes === 'number' ? a.episodes : 0);
    return {
      id: a.id,
      label: title,
      badge: a.averageScore ? `★ ${a.averageScore}%` : (a.format || (a.episodes ? `sub ${subCount}` : undefined)),
      imageUrl: a.poster || a.artwork || undefined,
    };
  });

  const browseCategoryItems: SelectItem[] = [
    { value: 'trending', label: 'Trending Now', icon: '[🔥]' },
    { value: 'popular-season', label: 'Popular This Season', icon: '[🌸]' },
    { value: 'top-rated', label: 'Top Rated', icon: '[⭐]' },
    { value: 'airing', label: 'Currently Airing', icon: '[📺]' },
    { value: 'upcoming', label: 'Upcoming', icon: '[📅]' },
    { value: 'movies', label: 'Movies', icon: '[🎬]' },
    { value: 'genre', label: 'By Genre', icon: '[🏷️]' },
    { value: 'season', label: 'By Season and Year', icon: '[🍂]' },
    { value: 'surprise', label: 'Surprise Me', icon: '[🎲]' },
  ];

  const seasonOptions: SelectItem[] = [
    { value: 'SPRING-2026', label: 'Spring 2026 (Current)', icon: '[🌸]' },
    { value: 'WINTER-2026', label: 'Winter 2026', icon: '[❄️]' },
    { value: 'FALL-2025', label: 'Fall 2025', icon: '[🍂]' },
    { value: 'SUMMER-2025', label: 'Summer 2025', icon: '[☀️]' },
    { value: 'SPRING-2025', label: 'Spring 2025', icon: '[🌸]' },
    { value: 'WINTER-2025', label: 'Winter 2025', icon: '[❄️]' },
    { value: 'FALL-2024', label: 'Fall 2024', icon: '[🍂]' },
    { value: 'SUMMER-2024', label: 'Summer 2024', icon: '[☀️]' },
    { value: 'SPRING-2024', label: 'Spring 2024', icon: '[🌸]' },
    { value: 'WINTER-2024', label: 'Winter 2024', icon: '[❄️]' },
  ];

  const epCount = episodes.length || animeInfo?.episodes?.sub?.length || animeInfo?.episodes?.dub?.length || animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || (animeInfo ? 1 : 0);
  const audioOptions: SelectItem[] = [
    { 
      value: 'sub', 
      label: 'Japanese (Subbed)', 
      badge: `${epCount} episodes` 
    },
    { 
      value: 'dub', 
      label: 'English (Dubbed)', 
      badge: `${epCount} episodes` 
    },
  ];


  const episodeItems: SelectItem[] = episodes
    .map((e, idx) => ({
      id: e.id || e.episodeId,
      episodeId: e.episodeId || e.id,
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
      id: e.id,
      episodeId: e.episodeId,
      number: e.number,
      label: `Episode ${e.number}${e.title && !e.title.includes('Episode') ? `: ${e.title}` : ''}`,
    }));

  const historyItems: SelectItem[] = history
    // Filter out corrupted entries with undefined/missing title or id
    .filter((h) => {
      if (!h || !h.id || !h.title) return false;
      if (String(h.id).includes('undefined') || String(h.title).includes('undefined')) return false;
      if (typeof h.title === 'string' && h.title.trim() === '') return false;
      if (typeof h.id === 'string' && h.id.trim() === '') return false;
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
      const titleStr = typeof h.title === 'string' ? h.title : (h.title?.english || h.title?.romaji || String(h.title || 'Untitled'));
      return {
        id: String(h.id),
        value: String(h.id),
        label: titleStr,
        badge: `Ep ${h.episode} • ${String(h.category || '').toUpperCase()}${progressStr}`,
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
          <ExitAnimation onDone={() => process.exit(0)} />
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

      
      {/* Playing Screen */}
      {screen === 'playing' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box borderStyle="round" borderColor={theme.cyan} padding={1} flexDirection="column" alignItems="center">
             <Text color={theme.yellow} bold>Now Playing</Text>
             <Text color={theme.white}>{selectedAnime?.label}</Text>
             <Text color={theme.white}>Episode {playingEpisode?.number}</Text>
             <Text color={theme.dimGray}>Provider: {playingProviders[playingProviderIndex]?.name}</Text>
          </Box>
          <Box marginTop={1}>
             <SelectList
               items={[
                 { label: playingPaused ? '▶ Resume Player' : '⏸ Pause Player', value: 'pause' },
                 { label: '⏭ Next Episode', value: 'next' },
                 { label: '⏮ Previous Episode', value: 'prev' },
                 { label: '⬇ Download Episode', value: 'download' },
                 { label: '⚙ Switch Provider', value: 'provider' },
                 { label: '↩ Back to Episodes', value: 'back' }
               ]}
               onSelect={(i) => {
                 if (i.value === 'pause') {
                   togglePause();
                 } else if (i.value === 'back') {
                   spawnSync('killall', ['-9', 'mpv', 'webtorrent-cli']);
                   setScreen('episode-select');
                 } else if (i.value === 'next') {
                   spawnSync('killall', ['-9', 'mpv', 'webtorrent-cli']);
                   const nextEp = episodes.find(e => e.number === (playingEpisode?.number || 0) + 1);
                   if (nextEp) handleEpisodeSelect(nextEp);
                 } else if (i.value === 'prev') {
                   spawnSync('killall', ['-9', 'mpv', 'webtorrent-cli']);
                   const prevEp = episodes.find(e => e.number === (playingEpisode?.number || 0) - 1);
                   if (prevEp) handleEpisodeSelect(prevEp);
                 } else if (i.value === 'download') {
                    if (playingEpisode) handleEpisodeAction('d', playingEpisode);
                   setStatus({ message: 'Added to download queue!', type: 'success' });
                 } else if (i.value === 'provider') {
                   // Cycle to the next provider and play it
                   spawnSync('killall', ['-9', 'mpv', 'webtorrent-cli']);
                   const nextIndex = (playingProviderIndex + 1) % playingProviders.length;
                   setPlayingProviderIndex(nextIndex);
                   playProvider(playingProviders[nextIndex]);
                 }
               }}
               color={theme.pink}
             />
          </Box>
        </Box>
      )}


      {/* Main Menu */}
      {screen === 'main-menu' && !showWelcome && (
        <Box flexDirection="column" width={Math.min(55, termSize.cols - 4)} alignItems="center">
          {loggedIn ? (
            <Box marginBottom={1} borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={0} width={Math.min(55, termSize.cols - 4)}>
              <Text color={theme.cyan}>Okaeri, </Text>
              <ShimmerText text={username} speed={150} />
              <Text color={theme.cyan}>!</Text>
            </Box>
          ) : (
            <Box marginBottom={1} borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={0} width={Math.min(55, termSize.cols - 4)}>
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

      {/* Browse Category List */}
      {screen === 'browse-category' && (
        <SelectList
          items={browseCategoryItems}
          onSelect={handleBrowseCategorySelect}
          onBack={goBack}
          title="[B] Browse Anime"
          color={theme.purple}
        />
      )}

      {/* Browse Genre List */}
      {screen === 'browse-genre' && (
        <SelectList
          items={genresList.map(g => ({ value: g, label: g, icon: '[🏷️]' }))}
          onSelect={handleBrowseGenreSelect}
          onBack={goBack}
          title={`[🏷️] Browse by Genre [Source: ${browseSource}]`}
          color={theme.pink}
        />
      )}

      {/* Browse Season List */}
      {screen === 'browse-season' && (
        <SelectList
          items={seasonOptions}
          onSelect={handleBrowseSeasonSelect}
          onBack={goBack}
          title="[🍂] Select Season & Year"
          color={theme.yellow}
        />
      )}

      {/* Browse Results */}
      {screen === 'browse-results' && (
        <SelectList
          items={browseAnimeItems}
          onSelect={handleAnimeSelect}
          onBack={goBack}
          onPageNext={handleBrowsePageNext}
          onPagePrev={handleBrowsePagePrev}
          onSortToggle={browseCategory === 'genre' ? handleBrowseSortToggle : undefined}
          title={`[Browse: ${browseCategory === 'genre' ? `${browseGenre} (${browseSort})` : (browseCategory === 'season' ? `${browseSeason} ${browseYear}` : browseCategoryTitle)}] (Page ${browsePage}) [Source: ${browseSource}]`}
          color={theme.purple}
          showArtwork={true}
        />
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

      {/* Anime Details */}
      {screen === 'anime-details' && animeInfo && (
        <AnimeDetailsView
          animeInfo={animeInfo}
          history={history}
          onWatch={handleWatchFromDetails}
          onDownload={handleDownloadFromDetails}
          onPlayTrailer={handlePlayTrailer}
          onToggleMyList={handleToggleMyList}
          isInList={isInMyList(animeInfo?.id)}
          onBack={goBack}
          termSize={termSize}
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
            {isDownloadMode ? '📥' : '📺'} {selectedAnime?.label || 'Anime'} <Text color={theme.cyan}>({audioType.toUpperCase()})</Text>
          </Text>
          <Box marginTop={1}>
            <SelectList
              items={episodeItems}
              onSelect={(item) => isDownloadMode ? handleEpisodeAction('d', item) : handleEpisodeSelect(item)}
              onAction={handleEpisodeAction}
              onBack={goBack}
              title={isDownloadMode ? `📥 Select Episode to Download (${episodeItems.length} total)` : `📋 Select Episode (${episodeItems.length} total)`}
              color={isDownloadMode ? theme.cyan : theme.blue}
              showNumbers={false}
              enableSearch={episodeItems.length > 20}
            />
          </Box>
        </Box>
      )}


      {/* Downloading Queue */}
      {screen === 'downloading' && (
        <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="round" borderColor={theme.cyan} width={Math.min(70, termSize.cols - 4)}>
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
          <Text color={theme.dimGray}>Press 'b' to go back | 'c' to clear finished</Text>
          <ScreenBackHandler onBack={goBack} onClear={() => setDownloadQueue(prev => prev.filter(t => t.status === 'downloading' || t.status === 'pending'))} />
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
        <Box flexDirection="column" width={Math.min(55, termSize.cols - 4)}>
          <Box borderStyle="round" borderColor={theme.purple} paddingX={2} paddingY={1} flexDirection="column">
            <Text color={theme.purple} bold>[L] Login to NyAnime</Text>
            <Text color={theme.dimGray}>{'─'.repeat(45)}</Text>
            <Text color={theme.lightGray}>1. Open in browser:</Text>
            <Text color={theme.yellow}>   http://localhost:8080/</Text>
            <Text color={theme.lightGray}>2. Sign in or Authorize ny-cli</Text>
            <Text color={theme.lightGray}>3. Return to terminal when done</Text>
            <Text color={theme.dimGray}>{'─'.repeat(45)}</Text>
            <Text color={theme.cyan}>Waiting for authorization...</Text>
          </Box>
        </Box>
      )}

      {/* Profile */}
      {screen === 'profile' && (
        <Box flexDirection={termSize.cols < 70 ? 'column' : 'row'} gap={2}>
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
          <Box flexDirection="column" width={Math.min(50, termSize.cols - 4)}>
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
        <Box flexDirection="column" width={Math.min(55, termSize.cols - 4)}>
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
          <ScreenBackHandler onBack={goBack} />
        </Box>
      )}

      <Box marginTop={1}>
        <StatusBar {...status} />
      </Box>
    </Box>
  );
}

// Simple component to handle keyboard input in help and download screens
function ScreenBackHandler({ onBack, onClear }: { onBack: () => void; onClear?: () => void }) {
  useInput((input, key) => {
    if (input === 'c' && onClear) {
      onClear();
      return;
    }
    if (key.escape || input === 'b' || key.leftArrow || input === 'q') {
      if (input === 'q') { quitBus.emit('quit'); return; }
      onBack();
    }
  });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER WITH PROPER CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('cli-terminal-fallback.mjs') ||
  process.argv[1].endsWith('cli-terminal.tsx')
);

if (isMain) {
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
    quitBus.emit('quit');
    // Safety fallback: if Ink doesn't exit within 1.5s, force-exit
    setTimeout(() => { instance.clear(); process.exit(0); }, 1500).unref();
  });

  process.on('SIGTERM', () => {
    quitBus.emit('quit');
    setTimeout(() => { instance.clear(); process.exit(0); }, 1500).unref();
  });
}
