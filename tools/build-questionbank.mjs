#!/usr/bin/env node
// build-questionbank.mjs — 组装 tools/extracted/*.json 为最终题库，输出到
// game/Assets/StreamingAssets/questionbank/（Unity 工程创建前输出到 game/questionbank/）
// 用法：node tools/build-questionbank.mjs
// 前置：python3 tools/extract-math.py && python3 tools/extract-env.py

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EXTRACTED = path.join(ROOT, 'tools', 'extracted');
const BOOK = '高等数学下册精选750题';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ---------- 数学 ----------
function buildMath() {
  const raw = loadJson(path.join(EXTRACTED, 'math750.json'));
  const qs = raw.questions;

  // 章节推断：按题号范围与 13 章对应（下册第8-13章）
  // 用题目里的章节关键词切分（从 stem 前的章节标题）
  // v1 简化：按题号区间近似映射 6 大章（下册）
  const chapters = [
    { id: 'math.ch08', name: '第八章 向量代数与空间解析几何', from: 1, to: 90, levels: [] },
    { id: 'math.ch09', name: '第九章 多元函数微分法及其应用', from: 91, to: 180, levels: [] },
    { id: 'math.ch10', name: '第十章 重积分', from: 181, to: 260, levels: [] },
    { id: 'math.ch11', name: '第十一章 曲线积分', from: 261, to: 340, levels: [] },
    { id: 'math.ch12', name: '第十二章 曲面积分', from: 341, to: 420, levels: [] },
    { id: 'math.ch13', name: '第十三章 无穷级数', from: 421, to: 750, levels: [] },
  ];

  const questions = [];
  for (const q of qs) {
    const chap = chapters.find((c) => q.num >= c.from && q.num <= c.to) || chapters[0];
    const id = `math.q${String(q.num).padStart(4, '0')}`;
    const hasAns = q.has_answer && q.answer_text.trim().length > 0;
    questions.push({
      id,
      num: q.num,
      kp_id: `${chap.id}.kp01`,
      type: q.type === 'single' ? 'single' : q.type === 'proof' ? 'blank' : 'calc',
      stem: q.stem,
      options: q.type === 'single' ? [] : [],
      answer: hasAns ? q.answer_text.slice(0, 2000) : '',
      explanation: hasAns ? '' : '',
      difficulty: q.difficulty,
      source: { book: BOOK, chapter: chap.name, page: '', no: q.num },
      answer_source: hasAns ? { book: BOOK, page: '答案区', no: q.num } : null,
      needs_review: !hasAns,
    });
  }

  // 关卡：每章 10 题/关，只用 needs_review=false 的题（有答案的入关）
  for (const chap of chapters) {
    const inChap = questions.filter((q) => q.num >= chap.from && q.num <= chap.to);
    const playable = inChap.filter((q) => !q.needs_review);
    const groups = [];
    for (let i = 0; i < playable.length; i += 10) {
      groups.push(playable.slice(i, i + 10));
    }
    groups.forEach((g, i) => {
      if (g.length === 0) return;
      const isBoss = i === groups.length - 1;
      chap.levels.push({
        id: `${chap.id}.lv${String(i + 1).padStart(2, '0')}`,
        name: isBoss ? 'Boss关' : `第${i + 1}关`,
        question_ids: g.map((q) => q.id),
        pass_rate: 0.5,
        star3_rate: 0.9,
        star2_rate: 0.7,
        is_boss: isBoss,
        first_clear_reward: { fruit: 30, seeds: 2 },
      });
    });
    // 知识点：每章 1 个代表 KP（挂全部该章题）
    chap.knowledge_points = [
      {
        id: `${chap.id}.kp01`,
        name: chap.name.replace(/^第.+章/, '').trim(),
        summary: `${chap.name} 核心考点，覆盖题号 ${chap.from}-${chap.to}。`,
        crop_rarity: 'rare',
        source: { book: BOOK, chapter: chap.name, page: `P${chap.from}-P${chap.to}` },
      },
    ];
  }

  return {
    subject: 'math',
    subject_name: '高等数学',
    version: 1,
    source_book: BOOK,
    chapters,
    questions,
    stats: {
      total_questions: questions.length,
      with_answer: questions.filter((q) => !q.needs_review).length,
      needs_review: questions.filter((q) => q.needs_review).length,
      total_levels: chapters.reduce((s, c) => s + c.levels.length, 0),
    },
  };
}

// ---------- 环工 ----------
function buildEnv() {
  const raw = loadJson(path.join(EXTRACTED, 'env.json'));
  const sourceBook = raw.source_book;
  // 按 chapter 分组为两个科目田区（环工原理 / 环工第三版）
  const chapters = [
    {
      id: 'env.ch01',
      name: '环工第三版·水质与物理化学处理',
      levels: [],
      knowledge_points: raw.knowledge_points
        .filter((k) => k.id.startsWith('env.'))
        .map((k) => ({
          id: k.id,
          name: k.name,
          summary: k.summary,
          crop_rarity: k.crop_rarity,
          source: k.source,
        })),
    },
    {
      id: 'env.ch02',
      name: '环工原理·单元操作',
      levels: [],
      knowledge_points: raw.knowledge_points
        .filter((k) => k.id.startsWith('envp.'))
        .map((k) => ({
          id: k.id,
          name: k.name,
          summary: k.summary,
          crop_rarity: k.crop_rarity,
          source: k.source,
        })),
    },
  ];

  const questions = raw.questions.map((q) => ({
    ...q,
    source: q.source || { book: sourceBook },
    answer_source: q.answer_source || q.source || { book: sourceBook },
  }));

  return {
    subject: 'env',
    subject_name: '环境工程',
    version: 1,
    source_book: sourceBook,
    chapters,
    questions,
    stats: {
      total_kp: raw.knowledge_points.length,
      total_questions: questions.length,
      note: raw.note,
    },
  };
}

// ---------- 输出 ----------
function main() {
  const outDir = path.join(ROOT, 'game', 'questionbank');
  fs.mkdirSync(outDir, { recursive: true });
  const math = buildMath();
  const env = buildEnv();
  fs.writeFileSync(path.join(outDir, 'math.json'), JSON.stringify(math, null, 1));
  fs.writeFileSync(path.join(outDir, 'env.json'), JSON.stringify(env, null, 1));
  console.log('math:', JSON.stringify(math.stats));
  console.log('env :', JSON.stringify(env.stats));
  console.log(`wrote ${outDir}/math.json, env.json`);
}

main();
