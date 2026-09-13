#!/usr/bin/env node
// gen-art.mjs - Study Farm art generation via OpenAI-compatible images API
// Usage:
//   node tools/gen-art.mjs "prompt" output.png
//   node tools/gen-art.mjs --manifest tools/art-manifest.json [--only name1,name2] [--concurrency 4]
// Env: reads game/.env (ART_API_BASE_URL, ART_API_KEY, ART_IMAGE_MODEL, ART_CONCURRENCY)

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

async function generateOnce(prompt, outPath) {
  const base = process.env.ART_API_BASE_URL;
  const key = process.env.ART_API_KEY;
  const model = process.env.ART_IMAGE_MODEL || 'agnes-image-2.5-flash';
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error(`no url in response: ${JSON.stringify(data).slice(0, 200)}`);
  const img = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!img.ok) throw new Error(`download HTTP ${img.status}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
}

async function generate(prompt, outPath, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await generateOnce(prompt, outPath);
      console.log(`ok   ${path.relative(ROOT, outPath)}`);
      return true;
    } catch (e) {
      if (attempt < retries) {
        console.log(`retry ${path.relative(ROOT, outPath)} (attempt ${attempt + 1}): ${e.message.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      } else {
        console.error(`FAIL ${path.relative(ROOT, outPath)}: ${e.message.slice(0, 200)}`);
        return false;
      }
    }
  }
  return false;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  let done = 0;
  const total = items.length;
  async function runner() {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
      done++;
      console.log(`[${done}/${total}]`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const concurrency = args.includes('--concurrency')
    ? parseInt(args[args.indexOf('--concurrency') + 1], 10)
    : parseInt(process.env.ART_CONCURRENCY || '4', 10);

  if (args[0] === '--manifest') {
    const manifestPath = path.resolve(args[1]);
    const only = args.includes('--only')
      ? args[args.indexOf('--only') + 1].split(',').map((s) => s.trim())
      : null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const style = manifest.style_suffix || '';
    const jobs = manifest.assets
      .filter((a) => !only || only.includes(a.name))
      .filter((a) => {
        const out = path.join(ROOT, a.out);
        if (fs.existsSync(out) && !manifest.force) {
          console.log(`skip ${a.name} (exists)`);
          return false;
        }
        return true;
      })
      .map((a) => ({ ...a, fullPrompt: `${a.prompt}${style ? ', ' + style : ''}` }));

    console.log(`generating ${jobs.length} assets, concurrency=${concurrency}`);
    let failed = 0;
    await runPool(jobs, async (job) => {
      const okFlag = await generate(job.fullPrompt, path.join(ROOT, job.out));
      if (!okFlag) failed++;
    }, concurrency);
    console.log(failed === 0 ? 'all done' : `${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  } else if (args.length >= 2) {
    const okFlag = await generate(args[0], path.resolve(args[1]));
    if (!okFlag) process.exitCode = 1;
  } else {
    console.error('usage: node tools/gen-art.mjs "prompt" out.png | --manifest file.json [--only names] [--concurrency N]');
    process.exit(1);
  }
}

main();
