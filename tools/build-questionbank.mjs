#!/usr/bin/env node
// build-questionbank.mjs — 组装 tools/extracted/*.json 为最终题库，输出到
// game/Assets/StreamingAssets/questionbank/（Unity JsonUtility 按 C# 属性名匹配，
// 所有键必须为 camelCase，与 C# 模型 QuestionModels.cs 一一对应）
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

// ---------- OCR 文本修复（"文本版" PDF 的系统性损伤） ----------
// 1) 题干尾部混入的章节标题截断  2) 分式拆行（分母掉到下一行）合回 "a / b"
// 3) 箭头乱码行（>>> / <<< / 单 < >）  4) 孤立括号行（题号残骸）
// 规则保守：只动数学上下文明确的行，不动编号列表（"1." "2、" 有标点不匹配）
function repairMathText(s) {
  if (!s) return s;
  const cutPatterns = [
    /^\s*第[一二三四五六七八九十百]+[节章]/,
    /^\s*[一二三四五六七八九十]+\s*、/
  ];
  const lines = s.replace(/\r/g, '').split('\n');
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (cutPatterns.some((re) => re.test(lines[i]))) {
      cut = i;
      break;
    }
  }
  const mathTail = /[A-Za-z0-9+\-−)）]$/;
  const out = [];
  for (let i = 0; i < cut; i++) {
    // 行首残留的右括号（题号 "8）" 被抽走后留下的 ））
    let raw = lines[i].trim().replace(/^）+\s*/, '').replace(/^\)+\s*/, '');
    // 孤立括号行
    if (/^[（）()]+$/.test(raw)) continue;
    // 箭头乱码行
    if (/^[<>]+:?$/.test(raw)) {
      if (raw.endsWith(':') && out.length > 0) out[out.length - 1] += ':';
      continue;
    }
    const prev = out.length > 0 ? out[out.length - 1] : '';
    const mNum = raw.match(/^([−-]?\d{1,2})(?:\s*(=)\s*)?(.*)$/);
    // 分式：行首 1-2 位数字，上一行以数学符号结尾，且不是编号列表（"1." "2、"）
    if (mNum && prev && mathTail.test(prev) && !/^\d{1,2}\s*[.、,．，]/.test(raw)) {
      const d = mNum[1];
      const eq = mNum[2];
      const rest = (mNum[3] || '').trim();
      let merged = prev + ' / ' + d;
      if (eq) merged += ' = ' + (rest ? rest : '');
      else if (rest) merged += ' ' + rest;
      out[out.length - 1] = merged;
      continue;
    }
    if (/^\d{1,2}$/.test(raw) && !(prev && mathTail.test(prev))) {
      // 裸数字且上一行非数学 → 题号/节号残骸，删
      continue;
    }
    if (raw !== '') out.push(raw);
  }
  return out
    .map((l) => l.replace(/[ \t]+/g, ' '))
    .filter((l) => l !== '')
    .join('\n')
    .trim();
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
      kpId: `${chap.id}.kp01`,
      type: q.type === 'single' ? 'single' : q.type === 'proof' ? 'blank' : 'calc',
      stem: repairMathText(q.stem),
      options: q.type === 'single' ? [] : [],
      answer: hasAns ? repairMathText(q.answer_text).slice(0, 2000) : '',
      explanation: hasAns ? '' : '',
      difficulty: q.difficulty,
      source: { book: BOOK, chapter: chap.name, page: '', no: q.num },
      answerSource: hasAns ? { book: BOOK, page: '答案区', no: q.num } : null,
      needsReview: !hasAns,
    });
  }

  // 关卡：每章 10 题/关，只用 needs_review=false 的题（有答案的入关）
  for (const chap of chapters) {
    const inChap = questions.filter((q) => q.num >= chap.from && q.num <= chap.to);
    const playable = inChap.filter((q) => !q.needsReview);
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
        questionIds: g.map((q) => q.id),
        passRate: 0.5,
        star3Rate: 0.9,
        star2Rate: 0.7,
        isBoss: isBoss,
        firstClearReward: { fruit: 30, seeds: 2 },
      });
    });
    // 知识点：每章 1 个代表 KP（挂全部该章题）
    chap.knowledgePoints = [
      {
        id: `${chap.id}.kp01`,
        name: chap.name.replace(/^第.+章/, '').trim(),
        summary: `${chap.name} 核心考点，覆盖题号 ${chap.from}-${chap.to}。`,
        cropRarity: 'rare',
        source: { book: BOOK, chapter: chap.name, page: `P${chap.from}-P${chap.to}` },
      },
    ];
  }

  return {
    subject: 'math',
    subjectName: '高等数学',
    version: 1,
    sourceBook: BOOK,
    chapters,
    questions,
    stats: {
      totalQuestions: questions.length,
      withAnswer: questions.filter((q) => !q.needsReview).length,
      needsReview: questions.filter((q) => q.needsReview).length,
      totalLevels: chapters.reduce((s, c) => s + c.levels.length, 0),
    },
  };
}

// ---------- 环工 ----------
function buildEnv() {
  const raw = loadJson(path.join(EXTRACTED, 'env.json'));
  const sourceBook = raw.source_book || raw.sourceBook;
  // 按 chapter 分组为两个科目田区（环工原理 / 环工第三版）
  const chapters = [
    {
      id: 'env.ch01',
      name: '环工第三版·水质与物理化学处理',
      levels: [],
      knowledgePoints: (raw.knowledge_points || raw.knowledgePoints || [])
        .filter((k) => k.id.startsWith('env.'))
        .map((k) => ({
          id: k.id,
          name: k.name,
          summary: k.summary,
          cropRarity: k.crop_rarity || k.cropRarity,
          source: k.source,
        })),
    },
    {
      id: 'env.ch02',
      name: '环工原理·单元操作',
      levels: [],
      knowledgePoints: (raw.knowledge_points || raw.knowledgePoints || [])
        .filter((k) => k.id.startsWith('envp.'))
        .map((k) => ({
          id: k.id,
          name: k.name,
          summary: k.summary,
          cropRarity: k.crop_rarity || k.cropRarity,
          source: k.source,
        })),
    },
  ];

  const questions = (raw.questions || []).map((q) => ({
    id: q.id,
    num: q.num,
    kpId: q.kp_id || q.kpId,
    type: q.type,
    stem: q.stem,
    options: q.options || [],
    answer: q.answer ?? '',
    explanation: q.explanation ?? '',
    difficulty: q.difficulty ?? 1,
    source: q.source || { book: sourceBook },
    answerSource: q.answer_source || q.answerSource || q.source || { book: sourceBook },
    needsReview: q.needs_review ?? q.needsReview ?? true,
  }));

  return {
    subject: 'env',
    subjectName: '环境工程',
    version: 1,
    sourceBook: sourceBook,
    chapters,
    questions,
    stats: {
      totalKp: (raw.knowledge_points || raw.knowledgePoints || []).length,
      totalQuestions: questions.length,
      note: raw.note,
    },
  };
}

// ---------- 输出 ----------
function main() {
  const outDir = path.join(ROOT, 'game', 'Assets', 'StreamingAssets', 'questionbank');
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
