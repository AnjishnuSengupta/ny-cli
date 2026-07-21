import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Get version from package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const version = pkgJson.version;
console.log(`Syncing version to: ${version}`);

function replaceInFile(filePath, regex, replacement) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const newContent = content.replace(regex, replacement);
  if (content !== newContent) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

replaceInFile('install.sh', /VERSION="[^"]+"/g, `VERSION="${version}"`);
replaceInFile('install.sh', /NY-CLI v[0-9\.]+/g, `NY-CLI v${version}`);
replaceInFile('install.sh', /v[0-9\.]+ • nyanime/g, `v${version} • nyanime`);

replaceInFile('ny-cli', /NY-CLI v[0-9\.]+/g, `NY-CLI v${version}`);

replaceInFile('cli-terminal.tsx', /const VERSION = '[^']+';/g, `const VERSION = '${version}';`);

if (fs.existsSync(path.join(ROOT_DIR, 'PKGBUILD'))) {
  replaceInFile('PKGBUILD', /pkgver=[0-9\.]+/g, `pkgver=${version}`);
}

if (fs.existsSync(path.join(ROOT_DIR, 'ny-cli.spec'))) {
  replaceInFile('ny-cli.spec', /Version:\s+[0-9\.]+/g, `Version:        ${version}`);
}

if (fs.existsSync(path.join(ROOT_DIR, 'debian', 'changelog'))) {
  replaceInFile('debian/changelog', /ny-cli \([^\)]+\)/g, `ny-cli (${version}-1)`);
}

replaceInFile('backend.mjs', /backend v[0-9\.]+/g, `backend v${version}`);
