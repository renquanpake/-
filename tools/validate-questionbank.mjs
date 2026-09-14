#!/usr/bin/env node
// validate-questionbank.mjs — 强校验 game/Assets/StreamingAssets/questionbank/*.json
// 规则（design.md Correctness Properties）：
//  1. 任一 knowledge_point 至少挂接 1 道题
//  2. 每道题 source 非空；数学题有答案的题 answer 与 answerSource 非空
//  3. 关卡 questionIds 引用完整
//  4. needsReview 题不入关卡（数学闯关）
//  5. ID 全局唯一
// 键名约定：camelCase（与 Unity JsonUtility + C# 模型一致）
// 任何失败退出码 1。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const QB = path.join(ROOT, 'game', 'Assets', 'StreamingAssets', 'questionbank');
const files = fs.readdirSync(QB).filter((f) => f.endsWith('.json'));

let errors = 0;
let warn = 0;
const err = (m) => { errors++; console.error('  [ERROR]', m); };
const wrn = (m) => { warn++; console.log('  [warn] ', m); };

for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const d = JSON.parse(fs.readFileSync(path.join(QB, f), 'utf8'));
  const isMath = d.subject === 'math';

  // ID 唯一
  const qids = new Set();
  for (const q of d.questions) {
    if (qids.has(q.id)) err(`question id 重复: ${q.id}`);
    qids.add(q.id);
    if (!q.source || !q.source.book) err(`q ${q.id} source.book 空`);
    if (isMath && !q.needsReview) {
      if (!q.answer || !q.answer.trim()) err(`q ${q.id} 非needsReview 但 answer 空`);
      if (!q.answerSource || !q.answerSource.no) err(`q ${q.id} answerSource 缺题号`);
    }
  }
  const kpids = new Set();
  for (const ch of d.chapters || []) {
    for (const kp of ch.knowledgePoints || []) {
      if (kpids.has(kp.id)) err(`kp id 重复: ${kp.id}`);
      kpids.add(kp.id);
      if (!kp.source || !kp.source.book) err(`kp ${kp.id} source 空`);
      // 挂接题
      const linked = d.questions.filter((q) => q.kpId === kp.id).length;
      if (linked === 0) err(`kp ${kp.id} 未挂接任何题（孤立知识点）`);
    }
    // 关卡
    for (const lv of ch.levels || []) {
      if (!Array.isArray(lv.questionIds) || lv.questionIds.length === 0) {
        err(`level ${lv.id} questionIds 空`);
        continue;
      }
      // 关卡题数（默认 10，boss 可异）
      if (!lv.isBoss && lv.questionIds.length !== 10) wrn(`level ${lv.id} 题数=${lv.questionIds.length}（非boss期望10）`);
      for (const qid of lv.questionIds) {
        if (!qids.has(qid)) err(`level ${lv.id} 引用不存在题 ${qid}`);
        else {
          const q = d.questions.find((x) => x.id === qid);
          if (isMath && q.needsReview) err(`level ${lv.id} 含 needsReview 题 ${qid}`);
        }
      }
    }
  }
  // kpId 引用完整（题的 kpId 必须在 kpids 中）
  for (const q of d.questions) {
    if (q.kpId && !kpids.has(q.kpId)) err(`q ${q.id} kpId=${q.kpId} 不存在`);
  }

  // 统计报告
  const total = d.questions.length;
  const review = d.questions.filter((q) => q.needsReview).length;
  const rate = ((total - review) / total * 100).toFixed(1);
  console.log(`  题数=${total} needsReview=${review} 入关率=${rate}%`);
}

console.log(`\n${files.length} files, errors=${errors}, warns=${warn}`);
if (errors > 0) {
  console.error('VALIDATION FAILED — 阻断构建');
  process.exit(1);
}
console.log('VALIDATION PASSED');
