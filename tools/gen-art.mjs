#!/usr/bin/env node
// gen-art.mjs - Study Farm art generation via OpenAI-compatible images API
// Usage:
//   node tools/gen-art.mjs "prompt" output.png
//   node tools/gen-art.mjs --manifest tools/art-manifest.json [--only name1,name2]
// Env: reads game/.env (ART_API_BASE_URL, ART_API_KEY, ART_IMAGE_MODEL)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function loadEnv() {
  const envPath = path.join(ROOT, 'game', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('missing game/.env - copy game/.env.example and fill in real values');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function generate(prompt, outPath) {
  const base = process.env.ART_API_BASE_URL;
  const key = process.env.ART_API_KEY;
  const model = process.env.ART_IMAGE_MODEL || 'agnes-image-2.5-flash';
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error(`no url in response: ${JSON.stringify(data).slice(0, 300)}`);
  const img = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!img.ok) throw new Error(`download HTTP ${img.status}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
  console.log(`ok  ${outPath}`);
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  if (args[0] === '--manifest') {
    const manifestPath = path.resolve(args[1]);
    const only = args.includes('--only')
      ? args[args.indexOf('--only') + 1].split(',').map((s) => s.trim())
      : null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const item of manifest.assets) {
      if (only && !only.includes(item.name)) continue;
      const out = path.join(ROOT, item.out);
      if (fs.existsSync(out) && !manifest.force) {
        console.log(`skip ${item.name} (exists, set "force": true to regenerate)`);
        continue;
      }
      try {
        await generate(item.prompt, out);
      } catch (e) {
        console.error(`FAIL ${item.name}: ${e.message}`);
        process.exitCode = 1;
      }
    }
  } else if (args.length >= 2) {
    await generate(args[0], path.resolve(args[1]));
  } else {
    console.error('usage: node tools/gen-art.mjs "prompt" out.png | --manifest file.json [--only names]');
    process.exit(1);
  }
}

main();
