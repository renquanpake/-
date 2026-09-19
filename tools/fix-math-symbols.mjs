#!/usr/bin/env node
// 一次性修复 math750.json 中的高置信 OCR 记号错位（B 批次系统性修复）
// 1) RR → ∬  2) II → ∭  3) ̸= → ≠  4) 组合向量箭头 ⃗X → X⃗
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'tools/extracted/math750.json');
copyFileSync(SRC, SRC + '.bak2');

const db = JSON.parse(readFileSync(SRC, 'utf8'));
let n = 0;
for (const q of db.questions) {
  const fix = (s) => {
    if (!s) return s;
    const before = s;
    s = s.replace(/\bRR\b/g, '∬').replace(/\bII\b/g, '∭');
    s = s.replace(/̸=/g, '≠');
    s = s.replace(/⃗\s*([A-Za-z])/g, '$1⃗');
    if (s !== before) n++;
    return s;
  };
  q.stem = fix(q.stem);
  q.answer_text = fix(q.answer_text);
}
writeFileSync(SRC, JSON.stringify(db, null, 1) + '\n');
console.log(`OK 记号修复触及 ${n} 处字段`);
