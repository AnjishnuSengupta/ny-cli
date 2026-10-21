import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const home = os.homedir();

export const configDir = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'ny-cli')
  : path.join(home, '.config', 'ny-cli');

export const stateDir = process.env.XDG_STATE_HOME
  ? path.join(process.env.XDG_STATE_HOME, 'ny-cli')
  : path.join(home, '.local', 'state', 'ny-cli');

export const dataDir = process.env.XDG_DATA_HOME
  ? path.join(process.env.XDG_DATA_HOME, 'ny-cli')
  : path.join(home, '.local', 'share', 'ny-cli');

export const configFile = path.join(configDir, 'config.json');
export const settingsFile = path.join(configDir, 'settings.json');
export const authFile = path.join(configDir, 'auth');
export const pidFile = path.join(stateDir, 'ny-cli.pid');
export const logFile = path.join(stateDir, 'backend.log');
export const historyFile = path.join(dataDir, 'history');
export const anime4kDir = path.join(dataDir, 'anime4k');
export const sessionsDir = path.join(stateDir, 'sessions');

export function ensureDirs() {
  for (const dir of [configDir, stateDir, dataDir, anime4kDir, sessionsDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      try { fs.chmodSync(dir, 0o700); } catch {}
    } catch {}
  }
}

export function ensureSecureAuthFile() {
  // Migrate legacy auth locations if present
  const legacyAuthLocations = [
    path.join(home, '.ny-cli-auth'),
    path.join(home, '.ny-cli', 'auth'),
  ];
  for (const leg of legacyAuthLocations) {
    if (fs.existsSync(leg) && !fs.existsSync(authFile)) {
      try {
        fs.copyFileSync(leg, authFile);
        fs.unlinkSync(leg);
      } catch {}
    }
  }

  // Ensure strict 0600 permissions on auth credentials
  if (fs.existsSync(authFile)) {
    try {
      const stat = fs.statSync(authFile);
      if ((stat.mode & 0o077) !== 0) {
        fs.chmodSync(authFile, 0o600);
      }
    } catch {}
  }
}

export const progressFile = path.join(dataDir, 'progress');

export function ensureSecureFiles() {
  ensureSecureAuthFile();
  const sensitiveFiles = [
    configFile,
    settingsFile,
    pidFile,
    historyFile,
    progressFile,
    logFile,
  ];
  for (const file of sensitiveFiles) {
    if (fs.existsSync(file)) {
      try {
        const stat = fs.statSync(file);
        if ((stat.mode & 0o077) !== 0) {
          fs.chmodSync(file, 0o600);
        }
      } catch {}
    }
  }
}

// Initialise directories and permissions on import
ensureDirs();
ensureSecureAuthFile();

