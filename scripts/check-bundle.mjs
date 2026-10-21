import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const bundlePath = path.join(ROOT, 'cli-terminal-fallback.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const existingContent = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, 'utf8') : '';

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'cli-terminal.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  external: ['react', 'ink', 'ink-text-input', 'ink-picture'],
});

const newContent = result.outputFiles[0].text;
if (newContent !== existingContent) {
  console.error('cli-terminal-fallback.mjs differs from source cli-terminal.tsx. Run npm run build:fallback');
  process.exit(1);
} else {
  console.log('cli-terminal-fallback.mjs is up to date.');
}
