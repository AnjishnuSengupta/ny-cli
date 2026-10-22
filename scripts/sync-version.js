import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const version = pkgJson.version;
console.log(`[sync-version] Syncing to version: ${version}`);

// 1. Update PKGBUILD: only update pkgver
const pkgbuildPath = path.join(ROOT_DIR, 'PKGBUILD');
if (fs.existsSync(pkgbuildPath)) {
  let content = fs.readFileSync(pkgbuildPath, 'utf8');
  content = content.replace(/^pkgver=.*$/m, `pkgver=${version}`);
  fs.writeFileSync(pkgbuildPath, content, 'utf8');
  console.log(`[sync-version] Updated PKGBUILD pkgver=${version}`);
}

// 2. Update ny-cli.spec: only update Version
const specPath = path.join(ROOT_DIR, 'ny-cli.spec');
if (fs.existsSync(specPath)) {
  let content = fs.readFileSync(specPath, 'utf8');
  content = content.replace(/^Version:\s+.*$/m, `Version:        ${version}`);
  fs.writeFileSync(specPath, content, 'utf8');
  console.log(`[sync-version] Updated ny-cli.spec Version: ${version}`);
}

// 3. Update debian/changelog: add one new entry at the top, never editing older entries
const changelogPath = path.join(ROOT_DIR, 'debian', 'changelog');
if (fs.existsSync(changelogPath)) {
  const current = fs.readFileSync(changelogPath, 'utf8');
  const targetHeader = `ny-cli (${version}-1)`;
  if (!current.startsWith(targetHeader)) {
    const dateStr = new Date().toUTCString().replace(/GMT$/, '+0000');
    const newEntry = `${targetHeader} unstable; urgency=medium\n\n  * Release ${version}\n\n -- Anjishnu Sengupta <itsaemail@duck.com>  ${dateStr}\n\n`;
    fs.writeFileSync(changelogPath, newEntry + current, 'utf8');
    console.log(`[sync-version] Added ${targetHeader} to debian/changelog`);
  }
}

// 4. Update npm-shrinkwrap.json if present
const shrinkwrapPath = path.join(ROOT_DIR, 'npm-shrinkwrap.json');
if (fs.existsSync(shrinkwrapPath)) {
  const sw = JSON.parse(fs.readFileSync(shrinkwrapPath, 'utf8'));
  sw.version = version;
  if (sw.packages && sw.packages['']) {
    sw.packages[''].version = version;
  }
  fs.writeFileSync(shrinkwrapPath, JSON.stringify(sw, null, 2) + '\n', 'utf8');
  console.log(`[sync-version] Updated npm-shrinkwrap.json version=${version}`);
}
