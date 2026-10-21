import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

await esbuild.build({
  entryPoints: [path.join(ROOT, 'cli-terminal.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(ROOT, 'cli-terminal-fallback.mjs'),
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  external: ['react', 'ink', 'ink-text-input', 'ink-picture'],
});

console.log(`Built cli-terminal-fallback.mjs (version ${pkg.version})`);
