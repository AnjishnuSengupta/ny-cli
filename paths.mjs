import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const home = os.homedir();

/**
 * Resolves platform-specific directories for config, state, and data.
 * Pure function allowing environment injection for deterministic testing.
 */
export function resolvePlatformDirs(platform = process.platform, env = process.env, customHome = os.homedir()) {
  let config, state, data;

  if (platform === 'win32') {
    const appData = (env.APPDATA || (customHome ? path.win32.join(customHome, 'AppData', 'Roaming') : '')).replace(/\//g, '\\');
    const localAppData = (env.LOCALAPPDATA || (customHome ? path.win32.join(customHome, 'AppData', 'Local') : '')).replace(/\//g, '\\');
    config = appData ? `${appData}\\ny-cli` : 'ny-cli';
    state = localAppData ? `${localAppData}\\ny-cli` : 'ny-cli';
    data = localAppData ? `${localAppData}\\ny-cli` : 'ny-cli';
  } else if (platform === 'darwin') {
    const appSupport = path.join(customHome, 'Library', 'Application Support', 'ny-cli');
    config = appSupport;
    state = path.join(appSupport, 'state');
    data = path.join(appSupport, 'data');
  } else {
    // Linux / BSD / XDG standard
    config = env.XDG_CONFIG_HOME
      ? path.join(env.XDG_CONFIG_HOME, 'ny-cli')
      : path.join(customHome, '.config', 'ny-cli');
    state = env.XDG_STATE_HOME
      ? path.join(env.XDG_STATE_HOME, 'ny-cli')
      : path.join(customHome, '.local', 'state', 'ny-cli');
    data = env.XDG_DATA_HOME
      ? path.join(env.XDG_DATA_HOME, 'ny-cli')
      : path.join(customHome, '.local', 'share', 'ny-cli');
  }

  return { configDir: config, stateDir: state, dataDir: data };
}

const defaultDirs = resolvePlatformDirs();
export const configDir = defaultDirs.configDir;
export const stateDir = defaultDirs.stateDir;
export const dataDir = defaultDirs.dataDir;

export const configFile = path.join(configDir, 'config.json');
export const settingsFile = path.join(configDir, 'settings.json');
export const authFile = path.join(configDir, 'auth');
export const pidFile = path.join(stateDir, 'ny-cli.pid');
export const logFile = path.join(stateDir, 'backend.log');
export const historyFile = path.join(dataDir, 'history');
export const anime4kDir = path.join(dataDir, 'anime4k');
export const sessionsDir = path.join(stateDir, 'sessions');
export const progressFile = path.join(dataDir, 'progress');

export function getFallbackStateDir() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : (process.env.USERNAME || 'user');
  return path.join(os.tmpdir(), `ny-cli-${uid}`);
}

export function resolvePidFile() {
  if (fs.existsSync(pidFile)) return pidFile;
  const fallback = path.join(getFallbackStateDir(), 'ny-cli.pid');
  if (fs.existsSync(fallback)) return fallback;
  return pidFile;
}

export function resolveLogFile() {
  if (fs.existsSync(logFile)) return logFile;
  const fallback = path.join(getFallbackStateDir(), 'backend.log');
  if (fs.existsSync(fallback)) return fallback;
  return logFile;
}

export function clearPidFile() {
  try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile); } catch {}
  try {
    const fb = path.join(getFallbackStateDir(), 'ny-cli.pid');
    if (fs.existsSync(fb)) fs.unlinkSync(fb);
  } catch {}
}

export function readPidInfo() {
  const resolved = resolvePidFile();
  try {
    if (!fs.existsSync(resolved)) return null;
    const raw = fs.readFileSync(resolved, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writePidInfo(pidData) {
  const json = JSON.stringify(pidData, null, 2);
  try {
    ensureDirs();
    fs.writeFileSync(pidFile, json, { encoding: 'utf8', mode: 0o600 });
    if (process.platform !== 'win32') {
      try { fs.chmodSync(pidFile, 0o600); } catch {}
    }
    return pidFile;
  } catch (err) {
    const fbDir = getFallbackStateDir();
    try {
      if (!fs.existsSync(fbDir)) {
        fs.mkdirSync(fbDir, { recursive: true, mode: 0o700 });
      }
      const fbFile = path.join(fbDir, 'ny-cli.pid');
      fs.writeFileSync(fbFile, json, { encoding: 'utf8', mode: 0o600 });
      if (process.platform !== 'win32') {
        try { fs.chmodSync(fbFile, 0o600); } catch {}
      }
      return fbFile;
    } catch {
      return null;
    }
  }
}

export function getSudoTargetUser() {
  if (typeof process.getuid === 'function' && process.getuid() === 0 && process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
    const uid = parseInt(process.env.SUDO_UID, 10);
    const gid = parseInt(process.env.SUDO_GID, 10);
    if (!isNaN(uid) && uid > 0 && !isNaN(gid) && gid >= 0) {
      return { uid, gid };
    }
  }
  return null;
}

export function migrateLegacyPaths(customHome = home, customTargetDirs = null) {
  const legacyConfig = path.join(customHome, '.config', 'ny-cli');
  const targetConfig = customTargetDirs?.configDir || configDir;
  const targetState = customTargetDirs?.stateDir || stateDir;

  if (fs.existsSync(legacyConfig)) {
    // 1. If targetConfig != legacyConfig (macOS or Windows), copy config files
    if (legacyConfig !== targetConfig) {
      try {
        if (!fs.existsSync(targetConfig)) {
          fs.mkdirSync(targetConfig, { recursive: true, mode: process.platform === 'win32' ? 0o777 : 0o700 });
        }
        for (const file of ['config.json', 'settings.json', 'auth']) {
          const src = path.join(legacyConfig, file);
          const dst = path.join(targetConfig, file);
          if (fs.existsSync(src) && !fs.existsSync(dst)) {
            try { fs.copyFileSync(src, dst); } catch {}
          }
        }
      } catch {}
    }

    // 2. State files (history.json, backend.log): if targetState != legacyConfig, migrate them to stateDir
    if (legacyConfig !== targetState) {
      try {
        if (!fs.existsSync(targetState)) {
          fs.mkdirSync(targetState, { recursive: true, mode: process.platform === 'win32' ? 0o777 : 0o700 });
        }
        for (const file of ['history.json', 'backend.log']) {
          const src = path.join(legacyConfig, file);
          const dst = path.join(targetState, file);
          if (fs.existsSync(src) && !fs.existsSync(dst)) {
            try { fs.copyFileSync(src, dst); } catch {}
          }
        }
      } catch {}
    }
  }
}

export function ensureDirs() {
  const targetUser = getSudoTargetUser();
  const dirMode = process.platform === 'win32' ? 0o777 : 0o700;

  for (const dir of [configDir, stateDir, dataDir, anime4kDir, sessionsDir]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: dirMode });
      }
      if (process.platform !== 'win32') {
        try { fs.chmodSync(dir, dirMode); } catch {}
        if (targetUser) {
          try { fs.chownSync(dir, targetUser.uid, targetUser.gid); } catch {}
        }
      }
    } catch {}
  }
  migrateLegacyPaths();
}

export function ensureSecureAuthFile() {
  const targetUser = getSudoTargetUser();

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

  // Ensure strict 0600 permissions on Unix
  if (fs.existsSync(authFile) && process.platform !== 'win32') {
    try {
      if (targetUser) {
        try { fs.chownSync(authFile, targetUser.uid, targetUser.gid); } catch {}
      }
      const stat = fs.statSync(authFile);
      if ((stat.mode & 0o077) !== 0) {
        fs.chmodSync(authFile, 0o600);
      }
    } catch {}
  }
}

export function ensureSecureFiles() {
  ensureSecureAuthFile();
  if (process.platform === 'win32') return;

  const targetUser = getSudoTargetUser();
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
        if (targetUser) {
          try { fs.chownSync(file, targetUser.uid, targetUser.gid); } catch {}
        }
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
