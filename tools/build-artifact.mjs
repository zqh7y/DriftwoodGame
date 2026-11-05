#!/usr/bin/env node
// Builds a single self-contained HTML page (artifact/index.html) for publishing:
// the head/body fragments of index.html plus the bundled game inlined as one script.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const res = await build({
  entryPoints: [join(ROOT, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const pick = (name) => {
  const m = new RegExp(`<!-- artifact:${name}:begin -->([\\s\\S]*?)<!-- artifact:${name}:end -->`).exec(html);
  if (!m) throw new Error(`index.html is missing the artifact:${name} markers`);
  return m[1].trim();
};

const page = `${pick('head')}\n${pick('body')}\n<script>\n${js}\n</script>\n`;
const out = join(ROOT, 'artifact', 'index.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(1)} KB)`);
