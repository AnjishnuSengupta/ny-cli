#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configDir, stateDir, pidFile, configFile, authFile, historyFile, ensureDirs } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { httpFetch } from './net.mjs';
import { resolveHost, getLayerFailures, resolveDoH, resolveUdp, recordLayerFailure } from './dns.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findFreePort(preferred = 43299) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      const s2 = net.createServer();
      s2.unref();
      s2.listen(0, '127.0.0.1', () => {
        const port = s2.address().port;
        s2.close(() => resolve(port));
      });
    });
    server.listen(preferred, '127.0.0.1', () => {
      server.close(() => resolve(preferred));
    });
  });
}

function checkTool(cmd) {
  try {
    const flag = cmd === 'ffmpeg' ? '-version' : '--version';
    const res = spawnSync(cmd, [flag], { stdio: 'pipe' });
    if (res.status === 0) {
      const line = (res.stdout.toString() || res.stderr.toString()).trim().split('\n')[0];
      return { present: true, info: line.slice(0, 45) };
    }
  } catch {}
  return { present: false };
}

function isWritable(dir) {
  try {
    ensureDirs();
    const testFile = path.join(dir, `.doctor-write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

async function testEndpoint(url, options = {}) {
  try {
    const res = await httpFetch(url, {
      ...options,
      signal: AbortSignal.timeout( options.timeout || 6000 ),
    });
    if (res.ok) {
      return { ok: true, status: res.status, message: `reachable (${res.status} OK)` };
    }
    const raw = await res.text().catch(() => '');
    const snippet = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
    return {
      ok: false,
      status: res.status,
      message: `HTTP ${res.status}${snippet ? ` (${snippet})` : ''}`,
    };
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message || err.code || err.message || 'unknown error';
    return { ok: false, status: 0, message: `network error: ${cause}` };
  }
}

async function testBackend(pkgVersion) {
  // 1. Check if backend is already running via pidFile
  if (fs.existsSync(pidFile)) {
    try {
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      if (info && info.port) {
        const res = await httpFetch(`http://127.0.0.1:${info.port}/`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null);
        if (res && res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            ok: body.version === pkgVersion,
            message: `running on port ${info.port} (reported v${body.version || 'unknown'})`,
            version: body.version,
          };
        }
      }
    } catch {}
  }

  // 2. Start a temporary backend on a free port
  const freePort = await findFreePort();
  const backendScript = path.join(__dirname, 'backend.mjs');
  let child = null;
  try {
    child = spawn(process.execPath, [backendScript], {
      env: { ...process.env, PORT: String(freePort) },
      stdio: 'pipe',
    });

    const start = Date.now();
    let healthy = false;
    let reportedVersion = null;

    while (Date.now() - start < 8000) {
      try {
        const res = await httpFetch(`http://127.0.0.1:${freePort}/`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          const data = await res.json();
          healthy = true;
          reportedVersion = data.version;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    if (healthy) {
      return {
        ok: reportedVersion === pkgVersion,
        message: `started successfully on port ${freePort} (reported v${reportedVersion})`,
        version: reportedVersion,
      };
    } else {
      return { ok: false, message: 'failed to start or respond to health check within 8s' };
    }
  } catch (err) {
    return { ok: false, message: `launch error: ${err.message}` };
  } finally {
    if (child) {
      try { child.kill('SIGKILL'); } catch {}
    }
  }
}

export async function runDoctor() {
  console.log('ny-cli doctor');
  console.log('=============');

  let hasFatalError = false;

  // 1. Package version
  let pkgVersion = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    pkgVersion = pkg.version;
  } catch {}
  console.log(`Package Version: ${pkgVersion}`);

  // 2. Node version
  const nodeVersion = process.version;
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeSupported = major > 20 || (major === 20 && minor >= 18);
  if (nodeSupported) {
    console.log(`Node.js:         ${nodeVersion} (supported: >=20.18.0)`);
  } else {
    console.log(`Node.js:         ${nodeVersion} (UNSUPPORTED: needs >=20.18.0)`);
    hasFatalError = true;
  }

  // 3. UI Runtime
  const uiRuntime = `node (${nodeVersion})`;
  console.log(`UI Runtime:      ${uiRuntime}`);

  // 4. Directories
  ensureDirs();
  const configWritable = isWritable(configDir);
  const stateWritable = isWritable(stateDir);
  console.log(`Config Dir:      ${configDir} (${configWritable ? 'writable' : 'NOT WRITABLE'})`);
  console.log(`State Dir:       ${stateDir} (${stateWritable ? 'writable' : 'NOT WRITABLE'})`);
  if (!configWritable || !stateWritable) {
    hasFatalError = true;
  }

  // Check file permissions for sensitive files
  const sensitiveChecks = [
    { name: 'Config file', path: configFile },
    { name: 'Auth credentials', path: authFile },
    { name: 'Watch history', path: historyFile },
  ];
  for (const item of sensitiveChecks) {
    if (fs.existsSync(item.path)) {
      try {
        const stat = fs.statSync(item.path);
        const mode = stat.mode & 0o777;
        const isLoose = (stat.mode & 0o077) !== 0;
        if (isLoose) {
          console.log(`  WARNING: ${item.name} (${item.path}) has loose permissions (0${mode.toString(8)}), expected 0600!`);
        }
      } catch {}
    }
  }

  // 5. DNS Resolution & Layer Diagnostics
  const config = loadConfig();
  const dnsMode = config.dns || process.env.NY_DNS || 'cloudflare-doh';
  console.log(`DNS Mode:        ${dnsMode}`);

  console.log('\nChecking DNS Layers:');
  const testHost = 'cloudflare.com';

  // Layer 1: DoH (1.1.1.1)
  try {
    const doh1 = await resolveDoH(testHost, 0, '1.1.1.1');
    console.log(`  DoH (1.1.1.1):   PASS (${doh1[0]?.address})`);
  } catch (err) {
    recordLayerFailure('doh:1.1.1.1', err);
    console.log(`  DoH (1.1.1.1):   FAIL (${err.message})`);
  }

  // Layer 2: DoH (8.8.8.8)
  try {
    const doh8 = await resolveDoH(testHost, 0, '8.8.8.8');
    console.log(`  DoH (8.8.8.8):   PASS (${doh8[0]?.address})`);
  } catch (err) {
    recordLayerFailure('doh:8.8.8.8', err);
    console.log(`  DoH (8.8.8.8):   FAIL (${err.message})`);
  }

  // Layer 3: UDP (Cloudflare)
  try {
    const udpRes = await resolveUdp(testHost, 0, ['1.1.1.1', '1.0.0.1']);
    console.log(`  UDP (Cloudflare): PASS (${udpRes[0]?.address})`);
  } catch (err) {
    recordLayerFailure('udp:cloudflare', err);
    console.log(`  UDP (Cloudflare): FAIL (${err.message})`);
  }

  // Configured resolution
  try {
    const dnsRes = await resolveHost(testHost, { mode: dnsMode });
    console.log(`  Active (${dnsMode}): PASS via ${dnsRes.mode} (${dnsRes.address} in ${dnsRes.timeMs}ms)`);
  } catch (err) {
    console.log(`  Active (${dnsMode}): FAIL (${err.message})`);
    hasFatalError = true;
  }

  const failures = getLayerFailures();
  const failureEntries = Object.entries(failures);
  if (failureEntries.length > 0) {
    console.log('  Failed DNS Layers (cached 60s cooldown):');
    for (const [layer, info] of failureEntries) {
      console.log(`    - ${layer}: ${info.error}`);
    }
  }

  // 6. Backend check
  console.log('\nChecking Backend:');
  const backendResult = await testBackend(pkgVersion);
  if (backendResult.ok) {
    console.log(`  Backend:       PASS - ${backendResult.message}`);
  } else {
    console.log(`  Backend:       FAIL - ${backendResult.message}`);
    hasFatalError = true;
  }

  // 7. Network Endpoints
  console.log('\nChecking Network Endpoints:');
  const anilistResult = await testEndpoint('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: '{ Media(id: 1) { id } }' }),
  });
  console.log(`  AniList:       ${anilistResult.message}`);

  const jikanResult = await testEndpoint('https://api.jikan.moe/v4/anime/1');
  console.log(`  Jikan:         ${jikanResult.message}`);

  const kitsuResult = await testEndpoint('https://kitsu.io/api/edge/anime?page[limit]=1');
  console.log(`  Kitsu:         ${kitsuResult.message}`);

  const anikotoResult = await testEndpoint('https://ani-koto-api-three.vercel.app/api');
  console.log(`  AniKoto:       ${anikotoResult.message}`);

  const anyMetadataOk = anilistResult.ok || jikanResult.ok || kitsuResult.ok || anikotoResult.ok;
  if (!anyMetadataOk) {
    console.log('  WARNING: All external metadata providers failed (upstream outages).');
    console.log('  NOTE: Local system is healthy, but anime discovery requires upstream recovery or a configured Relay.');
  }

  // Relay (if configured)
  const relayUrl = config.relayUrl || process.env.NY_RELAY_URL;
  if (!relayUrl) {
    console.log('  Relay:         not configured (optional)');
  } else {
    const relayResult = await testEndpoint(relayUrl);
    console.log(`  Relay (${relayUrl}): ${relayResult.message}`);
    if (!relayResult.ok) {
      hasFatalError = true;
    }
  }

  // 8. Media Tools
  console.log('\nChecking Media Tools:');
  const mpv = checkTool('mpv');
  const vlc = checkTool('vlc');
  const ffmpeg = checkTool('ffmpeg');
  const ytdlp = checkTool('yt-dlp');

  console.log(`  mpv:           ${mpv.present ? `installed (${mpv.info})` : 'not installed (recommended)'}`);
  console.log(`  vlc:           ${vlc.present ? `installed (${vlc.info})` : 'not installed'}`);
  console.log(`  ffmpeg:        ${ffmpeg.present ? `installed (${ffmpeg.info})` : 'not installed'}`);
  console.log(`  yt-dlp:        ${ytdlp.present ? `installed (${ytdlp.info}) (optional)` : 'not installed (optional)'}`);

  if (!mpv.present && !vlc.present) {
    console.log('  WARNING: Neither mpv nor vlc was found. Playback will fail without a video player.');
  }

  console.log('\n-----------------------------');
  if (hasFatalError) {
    console.log('Doctor result: FAIL (one or more required checks failed)');
    return 1;
  } else {
    console.log('Doctor result: PASS (all required checks passed)');
    return 0;
  }
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
  runDoctor()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('Doctor fatal error:', err);
      process.exit(1);
    });
}
