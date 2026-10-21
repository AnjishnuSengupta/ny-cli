import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const expected = pkg.version;
let ok = true;

// PKGBUILD
const pkgbuild = fs.readFileSync(path.join(ROOT, 'PKGBUILD'), 'utf8');
const pkgverMatch = pkgbuild.match(/^pkgver=(.*)$/m);
if (!pkgverMatch || pkgverMatch[1] !== expected) {
  console.error(`Version mismatch in PKGBUILD: found '${pkgverMatch?.[1]}', expected '${expected}'`);
  ok = false;
}

// ny-cli.spec
const spec = fs.readFileSync(path.join(ROOT, 'ny-cli.spec'), 'utf8');
const specMatch = spec.match(/^Version:\s+(.*)$/m);
if (!specMatch || specMatch[1] !== expected) {
  console.error(`Version mismatch in ny-cli.spec: found '${specMatch?.[1]}', expected '${expected}'`);
  ok = false;
}

// debian/changelog
const changelog = fs.readFileSync(path.join(ROOT, 'debian', 'changelog'), 'utf8');
const changelogMatch = changelog.match(/^ny-cli \((.*?)-1\)/m);
if (!changelogMatch || changelogMatch[1] !== expected) {
  console.error(`Version mismatch in debian/changelog: found '${changelogMatch?.[1]}', expected '${expected}'`);
  ok = false;
}

if (!ok) {
  console.error('check:versions FAILED');
  process.exit(1);
} else {
  console.log(`check:versions PASSED: all package versions match ${expected}`);
}
