#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { pidFile, logFile, sessionsDir, ensureDirs, ensureSecureFiles } from '../paths.mjs';
import { loadConfig } from '../config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

// Read package.json version
let pkgVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  pkgVersion = pkg.version;
} catch {}

export function rotateLogFileIfNeeded() {
  try {
    if (!fs.existsSync(logFile)) return;
    const stat = fs.statSync(logFile);
    const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
    if (stat.size > MAX_SIZE) {
      const KEEP_SIZE = 512 * 1024; // 512 KB tail
      const fd = fs.openSync(logFile, 'r');
      const buffer = Buffer.alloc(KEEP_SIZE);
      fs.readSync(fd, buffer, 0, KEEP_SIZE, stat.size - KEEP_SIZE);
      fs.closeSync(fd);
      const firstNewline = buffer.indexOf('\n');
      const tail = firstNewline !== -1 ? buffer.subarray(firstNewline + 1) : buffer;
      fs.writeFileSync(logFile, tail, { mode: 0o600 });
      try { fs.chmodSync(logFile, 0o600); } catch {}
    }
  } catch {}
}

// ── 3. Helper functions: Ports, PID management, Health checks ─────────────────
function isProcessAlive(pid) {
  try {
    if (fs.existsSync(`/proc/${pid}/status`)) {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      if (status.includes('State:\tZ')) return false; // Zombie
      return true;
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidInfo() {
  if (!fs.existsSync(pidFile)) return null;
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stopProcess(pid, waitMs = 3000) {
  if (!pid || !isProcessAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  const start = Date.now();
  while (isProcessAlive(pid) && Date.now() - start < waitMs) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
}

function getProcessCmdline(pid) {
  try {
    if (process.platform === 'linux' && fs.existsSync(`/proc/${pid}/cmdline`)) {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return raw.replace(/\0/g, ' ').trim();
    }
    const res = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { stdio: 'pipe' });
    if (res.status === 0) {
      return (res.stdout.toString() || '').trim();
    }
  } catch {}
  return null;
}

function getProcessStartTime(pid) {
  try {
    if (process.platform === 'linux' && fs.existsSync(`/proc/${pid}/stat`)) {
      const statContent = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const lastParen = statContent.lastIndexOf(')');
      if (lastParen !== -1) {
        const fields = statContent.slice(lastParen + 2).split(' ');
        const starttimeTicks = fields[19];
        if (starttimeTicks) return `ticks:${starttimeTicks}`;
      }
    }
    const res = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { stdio: 'pipe' });
    if (res.status === 0) {
      return (res.stdout.toString() || '').trim();
    }
  } catch {}
  return null;
}

function isBackendProcess(pid, pidInfo = null) {
  if (!pid || !isProcessAlive(pid)) return false;
  const backendScript = path.join(packageRoot, 'backend.mjs');
  const cmdline = getProcessCmdline(pid);
  if (!cmdline || (!cmdline.includes(backendScript) && !cmdline.includes('backend.mjs'))) {
    return false;
  }
  if (pidInfo && pidInfo.startTime) {
    const currentStartTime = getProcessStartTime(pid);
    if (currentStartTime && currentStartTime !== pidInfo.startTime) {
      return false;
    }
  }
  return true;
}

function getSessionFilePath(pid = process.pid) {
  return path.join(sessionsDir, `${pid}.json`);
}

function cleanupDeadSessions() {
  try {
    if (!fs.existsSync(sessionsDir)) return;
    const entries = fs.readdirSync(sessionsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const sFile = path.join(sessionsDir, entry);
      try {
        const raw = fs.readFileSync(sFile, 'utf8');
        const session = JSON.parse(raw);
        if (!session.pid || !isProcessAlive(session.pid)) {
          fs.unlinkSync(sFile);
        }
      } catch {
        try { fs.unlinkSync(sFile); } catch {}
      }
    }
  } catch {}
}

function registerSession() {
  cleanupDeadSessions();
  try {
    ensureDirs();
    const sFile = getSessionFilePath(process.pid);
    const data = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(sFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}

function unregisterSession() {
  try {
    const sFile = getSessionFilePath(process.pid);
    if (fs.existsSync(sFile)) {
      fs.unlinkSync(sFile);
    }
  } catch {}
}

function getOtherActiveSessionCount() {
  cleanupDeadSessions();
  try {
    if (!fs.existsSync(sessionsDir)) return 0;
    const entries = fs.readdirSync(sessionsDir);
    let count = 0;
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const sessionPidStr = entry.slice(0, -5);
      const sessionPid = Number(sessionPidStr);
      if (sessionPid === process.pid) continue;
      if (isProcessAlive(sessionPid)) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function stopRunningBackend() {
  const info = readPidInfo();
  if (info && info.pid) {
    if (isBackendProcess(info.pid, info)) {
      console.log(`[ny-cli] stopping running backend (PID ${info.pid})...`);
      stopProcess(info.pid);
      console.log(`[ny-cli] stopped backend (PID ${info.pid})`);
    } else {
      console.log(`[ny-cli] PID file points to non-backend or stale process (PID ${info.pid}), removing stale PID file without signaling`);
    }
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {}
  try {
    if (fs.existsSync(sessionsDir)) {
      const entries = fs.readdirSync(sessionsDir);
      for (const entry of entries) {
        try { fs.unlinkSync(path.join(sessionsDir, entry)); } catch {}
      }
    }
  } catch {}
}

async function checkHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch {
    return null;
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(preferred = 43201) {
  if (await isPortFree(preferred)) return preferred;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

// ── 4. Main execution: Start backend, wait for health, run UI ──────────────────
export async function main(argv = process.argv.slice(2)) {
  // ── 1. Node version check (must be >= 20.18.0) ────────────────────────────────
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 18)) {
    console.error(`ny-cli needs Node 20.18 or newer (found ${process.version})`);
    process.exit(1);
  }

  // ── 2. Flags: --version, --stop, --doctor ────────────────────────────────────
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`ny-cli v${pkgVersion}`);
    process.exit(0);
  }

  if (argv.includes('--stop')) {
    stopRunningBackend();
    process.exit(0);
  }

  if (argv.includes('--doctor')) {
    const doctorPath = path.join(packageRoot, 'doctor.mjs');
    if (fs.existsSync(doctorPath)) {
      const res = spawnSync(process.execPath, [doctorPath], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
    } else {
      console.log(`ny-cli v${pkgVersion} (Node ${process.version})`);
      console.log('Doctor module will be available in task T1.6');
      process.exit(0);
    }
  }

  ensureDirs();
  ensureSecureFiles();
  rotateLogFileIfNeeded();

  const pidInfo = readPidInfo();
  let chosenPort = pidInfo?.port || 43201;
  let backendStartedByUs = null;

  if (pidInfo && pidInfo.pid && isBackendProcess(pidInfo.pid, pidInfo)) {
    const health = await checkHealth(chosenPort);
    if (health && health.version === pkgVersion) {
      // Backend is healthy and matches current version
    } else {
      // Version mismatch or unresponsive -> politely stop and replace
      console.log(`[ny-cli] existing backend version '${health?.version || 'unknown'}' differs from package '${pkgVersion}', replacing...`);
      stopProcess(pidInfo.pid);
      try { fs.unlinkSync(pidFile); } catch {}
      chosenPort = await findFreePort(43201);
      backendStartedByUs = startBackendProcess(chosenPort);
    }
  } else {
    // No backend running or stale PID file pointing to an unrelated process
    try { fs.unlinkSync(pidFile); } catch {}
    chosenPort = await findFreePort(43201);
    backendStartedByUs = startBackendProcess(chosenPort);
  }

  registerSession();

  // Wait for health check (up to 15 seconds)
  process.stdout.write(`[ny-cli] waiting for backend on port ${chosenPort}...`);
  const healthResult = await waitForBackendReady(chosenPort, 15000, backendStartedByUs);
  if (!healthResult.ready) {
    process.stdout.write(' failed!\n');
    if (healthResult.exitedEarly) {
      console.error(`[ny-cli] Backend process (PID ${backendStartedByUs?.pid}) exited prematurely before becoming ready`);
    } else {
      console.error(`[ny-cli] Backend failed to start on port ${chosenPort} within 15s`);
    }
    if (fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, 'utf8').trim().split('\n');
      console.error('\n--- Last 20 lines of backend.log ---');
      console.error(logContent.slice(-20).join('\n'));
      console.error('------------------------------------\n');
    }
    if (backendStartedByUs) {
      stopProcess(backendStartedByUs.pid);
      try { fs.unlinkSync(pidFile); } catch {}
    }
    unregisterSession();
    process.exit(1);
  }
  process.stdout.write(' ready.\n');

  // UI runtime is Node.js executing the standalone bundled UI
  const fallbackPath = path.join(packageRoot, 'cli-terminal-fallback.mjs');
  const uiRuntime = process.execPath;
  const uiScript = fallbackPath;

  let uiChild = null;

  // Cleanup handler for our child processes
  function cleanup() {
    unregisterSession();
    if (uiChild && isProcessAlive(uiChild.pid)) {
      stopProcess(uiChild.pid, 1000);
    }
    const otherSessions = getOtherActiveSessionCount();
    if (otherSessions > 0) {
      // Backend is still in use by other running session(s)
      return;
    }
    const info = readPidInfo();
    const pidToStop = backendStartedByUs ? backendStartedByUs.pid : info?.pid;
    if (pidToStop && isBackendProcess(pidToStop, info)) {
      stopProcess(pidToStop, 2000);
      try { fs.unlinkSync(pidFile); } catch {}
    }
  }

  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  process.on('SIGHUP', () => { cleanup(); process.exit(129); });
  process.on('exit', () => { cleanup(); });

  // Run UI without replacing shell process (preserves signal handling & cleanup)
  const uiArgs = [uiScript, ...argv];
  uiChild = spawn(uiRuntime, uiArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      NY_PORT: String(chosenPort),
      PORT: String(chosenPort),
    },
  });

  uiChild.on('exit', (code, signal) => {
    cleanup();
    if (signal) {
      process.exit(128);
    } else {
      process.exit(code ?? 0);
    }
  });
}

function startBackendProcess(port) {
  rotateLogFileIfNeeded();
  const backendPath = path.join(packageRoot, 'backend.mjs');
  const logFd = fs.openSync(logFile, 'a', 0o600);

  const child = spawn(process.execPath, [backendPath], {
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  try { fs.closeSync(logFd); } catch {}
  child.unref();

  const pidData = {
    pid: child.pid,
    port,
    version: pkgVersion,
    startedAt: new Date().toISOString(),
    startTime: getProcessStartTime(child.pid),
  };

  fs.writeFileSync(pidFile, JSON.stringify(pidData, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(pidFile, 0o600); } catch {}
  try { fs.chmodSync(logFile, 0o600); } catch {}
  return child;
}

async function waitForBackendReady(port, maxWaitMs = 15000, child = null) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (child && !isProcessAlive(child.pid)) {
      return { ready: false, exitedEarly: true };
    }
    const health = await checkHealth(port);
    if (health && health.status === 'ok') {
      return { ready: true };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { ready: false, timeout: true };
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMain()) {
  main().catch((err) => {
    console.error('[ny-cli] fatal error:', err);
    process.exit(1);
  });
}
