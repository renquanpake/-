#!/usr/bin/env node
// 应用人工校对结果到 math750.json 数据源
// 用法: node tools/apply-corrections.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'tools/extracted/math750.json');
const PROOF = '/tmp/opencode/proof';
const batches = [resolve(PROOF, 'A1.json'), resolve(PROOF, 'A2.json'), resolve(PROOF, 'A3.json')];

copyFileSync(SRC, SRC + '.bak');

const db = JSON.parse(readFileSync(SRC, 'utf8'));
const byNum = new Map(db.questions.map(q => [q.num, q]));

let stemN = 0, ansN = 0;
const touched = [];
for (const f of batches) {
  const { batch, corrections } = JSON.parse(readFileSync(f, 'utf8'));
  for (const c of corrections) {
    const q = byNum.get(c.num);
    if (!q) { console.error(`[ERR] ${batch} num=${c.num} 不在 math750 中`); process.exit(1); }
    if (c.stem && c.stem !== q.stem) { q.stem = c.stem; stemN++; touched.push(c.num); }
    if (c.answer && c.answer !== q.answer_text) { q.answer_text = c.answer; ansN++; touched.push(c.num); }
  }
}

writeFileSync(SRC, JSON.stringify(db, null, 1) + '\n');
console.log(`OK stem 改 ${stemN} 处, answer 改 ${ansN} 处, 触及题 ${touched.length} 道: ${touched.join(',')}`);
