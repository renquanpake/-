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
    // 箭头乱码行（含花括号残迹的孤立冒号行）
    if (/^[<>]+:?$/.test(raw) || raw === ':') {
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

// ---------- 机判键提取：答案首行结论（供前端 Grader 自动判分） ----------
// 仅提取"结论行"；推导式首行/散文式回答 → 空串（该题回退自评模式）
function extractAnswerKey(answerText) {
  const lines = String(answerText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) return '';
  let first = lines[0];
  if (first.startsWith('解')) first = first.replace(/^解\s*/, '');
  const head = first.split('。')[0].trim();
  if (head === '' || head.length > 200) return '';
  if (/^(由|故|设|记|代入|根据|利用|再求)/.test(head)) return '';
  // 散文式推导首行（中文占比高）不适合机判
  const han = (head.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (han / head.length > 0.3) return '';
  return head;
}

// ---------- 嵌入式选择题：题干尾部 (A)...(B)...(C)...(D) 选项提取 ----------
// 仅当四个标记按 A→B→C→D 连续出现且选项区位于题干后段时才提取；否则返回 null
function extractEmbeddedOptions(stem) {
  const s = String(stem || '');
  const re = /[（(]\s*([A-D])\s*[)）]/g;
  const marks = [];
  let m;
  while ((m = re.exec(s)) !== null) marks.push({ letter: m[1], idx: m.index, end: re.lastIndex });
  if (marks.map((x) => x.letter).join('') !== 'ABCD') return null;
  if (marks[0].idx < s.length * 0.3) return null;
  const stemPart = s.slice(0, marks[0].idx).trim().replace(/[：:]$/, '');
  if (stemPart.length < 8) return null;
  const opts = [];
  for (let i = 0; i < 4; i++) {
    const start = marks[i].end;
    const stop = i < 3 ? marks[i + 1].idx : s.length;
    let text = s.slice(start, stop).replace(/\n/g, ' ').replace(/[ \t]+/g, ' ').trim();
    text = text.replace(/[；;。]\s*$/, '').trim();
    if (text === '') return null;
    opts.push(text);
  }
  return { stem: stemPart, options: opts };
}

// ---------- 选择题选项生成：answerKey → [正确项, 干扰项×3]；无法生成返回 null（该题保留填空判分） ----------

// 数值化（白名单校验 + 受控求值；含自由变量/不可解析 → null）
function numEval(s) {
  let t = String(s).trim()
  if (t === '') return null
  t = t.replace(/[−–—]/g, '-')
  t = t.replace(/²/g, '**2').replace(/³/g, '**3')
  t = t.replace(/\^/g, '**')
  t = t.replace(/√(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)').replace(/π/g, 'Math.PI')
  t = t.replace(/\s+/g, '')
  if (/[A-Za-z]/.test(t.replace(/Math\.sqrt|Math\.PI/g, ''))) return null
  // 隐式乘法：数字/右括号 紧跟 Math.sqrt / Math.PI
  t = t.replace(/([0-9.)])(Math\.sqrt|Math\.PI)/g, '$1*$2')
  try {
    const v = new Function('"use strict";return (' + t + ')')()
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

// 数值干扰项：按形态生成 3 个数值不等、互不重复的候选
function numDistractors(val, form) {
  const out = []
  const push = (s) => {
    const v = numEval(s)
    if (v == null || Math.abs(v - val) < 1e-9) return
    if (!out.some((o) => Math.abs(numEval(o) - v) < 1e-9)) out.push(s)
  }
  const f = String(form).replace(/−/g, '-')
  const mR = f.match(/^([1-9])?√(\d+)\/(\d+)$/) // k√n/m
  const mRP = f.match(/^√(\d+)π\/(\d+)$/) // √nπ/m
  const mP = f.match(/^π\/(\d+)$/)
  const mF = f.match(/^(\d+)\/(\d+)$/) // a/b
  const mI = f.match(/^([+-]?)(\d+(?:\.\d+)?)$/) // 带符号整数/小数
  if (mR) {
    const koef = mR[1] ?? ''
    push(`${koef}√${mR[2]}/${Number(mR[3]) * 2}`)
    push(`${koef === '' ? '2' : Number(koef) * 2}√${mR[2]}/${mR[3]}`)
    push(`√${Number(mR[2]) * 4}/${mR[3]}`)
    push(`-√${mR[2]}/${mR[3]}`)
  } else if (mRP) {
    push(`√${mRP[1]}π/${Number(mRP[2]) + 1}`)
    push(`2√${mRP[1]}π/${mRP[2]}`)
    push(`√${mRP[1]}π/${Number(mRP[2]) * 2}`)
  } else if (mP) {
    push(`π/${Number(mP[1]) + 1}`)
    push(`2π/${mP[1]}`)
    push(`π/${Math.max(1, Number(mP[1]) - 1)}`)
  } else if (mF) {
    push(`${mF[1]}/${Number(mF[2]) * 2}`)
    push(`${Number(mF[1]) + 1}/${mF[2]}`)
    push(`${Number(mF[1]) - 1}/${mF[2]}`)
    push(`-${mF[1]}/${mF[2]}`)
  } else if (mI) {
    const n = Number(mI[2]) * (mI[1] === '-' ? -1 : 1)
    push(String(n + 1))
    push(String(n - 1))
    push(String(-n))
    push(String(n * 2))
    push(String(n + 2))
    push(String(n - 2))
  }
  return out.slice(0, 3)
}

// 解析 "ax + by + cz + c0 = 0" / "ax + by + cz = d"（缺项允许）→ {a,b,c,d}
function parseLinEq(s) {
  // 归一化：Unicode 负号 → ASCII '-'，去空格
  const norm = String(s).replace(/[−–—]/g, '-').replace(/\s+/g, '')
  const eq = norm.split('=')
  if (eq.length !== 2 || eq[0] === '') return null
  const lhs = eq[0]
  const rhs = eq[1]
  let dRight = 0
  if (rhs !== '') {
    if (!/^[+-]?\d+$/.test(rhs)) return null
    dRight = Number(rhs)
  }
  const m = lhs.match(/^([+-]?\d*)x(?:([+-]\d*)y)?(?:([+-]\d*)z)?(?:([+-]\d+))?$/)
  if (!m) return null
  const fc = (x) => (x === '' ? 1 : x === '-' ? -1 : Number(x))
  const tc = (x) => (x === '+' || x === '' ? 1 : x === '-' ? -1 : Number(x))
  const a = fc(m[1])
  const b = m[2] == null ? 0 : tc(m[2])
  const c = m[3] == null ? 0 : tc(m[3])
  const c0 = m[4] == null ? 0 : Number(m[4])
  return { a, b, c, d: dRight - c0 }
}

// 线性方程干扰项：系数 +1 / +3、常数 +2
function eqDistractors(eq) {
  const p = parseLinEq(eq)
  if (p == null) return null
  const termStr = (coef, v, first) => {
    if (coef === 0) return null
    const body = (Math.abs(coef) === 1 ? '' : String(Math.abs(coef))) + v
    if (first) return coef < 0 ? '-' + body : body
    return (coef < 0 ? ' - ' : ' + ') + body
  }
  const build = (A, B, C, D) => {
    const t = [termStr(A, 'x', true), termStr(B, 'y', false), termStr(C, 'z', false)].filter((x) => x != null).join('')
    return (t === '' ? '0' : t) + (D === 0 ? '' : ' = ' + D)
  }
  const norm = (x) => x.replace(/\s+/g, '').replace(/[−–—]/g, '-')
  const target = norm(eq)
  const cands = [
    build(p.a + 1, p.b, p.c, p.d),
    build(p.a, p.b + 3, p.c, p.d),
    build(p.a, p.b, p.c + 1, p.d),
    build(p.a, p.b, p.c, p.d + 2),
    build(p.a, p.b, p.c, -p.d)
  ]
  const out = []
  for (const cand of cands) {
    const cn = norm(cand)
    if (cn === target) continue
    if (out.some((o) => norm(o) === cn)) continue
    out.push(cand)
    if (out.length === 3) break
  }
  return out.length === 3 ? out : null
}

// 纯向量 "(a, b, c)" 分量扰动
function vecDistractors(v) {
  const m = String(v).match(/^\((-?\d+), ?(-?\d+), ?(-?\d+)\)$/)
  if (!m) return null
  const p = m.slice(1).map(Number)
  const fmt = (c) => `(${c[0]}, ${c[1]}, ${c[2]})`
  const cands = [
    [p[0] + 1, p[1], p[2]],
    [p[0], p[1] + 1, p[2]],
    [p[0], p[1], p[2] + 1],
    [-p[0], p[1], p[2]],
    [p[0] - 1, p[1], p[2]],
    [p[0], p[1] - 1, p[2]]
  ]
  const out = []
  for (const c of cands) {
    const s = fmt(c)
    if (s === String(v) || out.includes(s)) continue
    out.push(s)
    if (out.length === 3) break
  }
  return out.length === 3 ? out : null
}

// 直线对称式 "n/d = n/d = n/d"（分母可为 0）：分母 ±1 扰动
function lineDistractors(s) {
  const base = String(s).replace(/即.*$/, '').replace(/[−–]/g, '-').trim()
  const segs = base.split('=')
  if (segs.length !== 3) return null
  const parsed = segs.map((sg) => {
    const t = sg.trim().replace(/（.*$/, '').replace(/[，、。；;]+$/, '').trim()
    const m = t.match(/^(.+?)\/\(?([+\-]?\d+)\)?$/)
    return m ? { num: m[1].trim(), den: Number(m[2]) } : null
  })
  if (parsed.some((x) => x == null)) return null
  const build = (i, den) =>
    parsed
      .map((p, j) => {
        const d = j === i ? den : p.den
        return d === 0 ? p.num : `${p.num}/${d}`
      })
      .join(' = ')
  const out = []
  for (const [i, k] of [
    [0, 1],
    [1, 1],
    [2, 1],
    [0, -1],
    [2, -1]
  ]) {
    if (parsed[i].den === 0) continue
    const cand = build(i, parsed[i].den + k)
    if (cand !== base && !out.includes(cand)) out.push(cand)
    if (out.length === 3) break
  }
  return out.length === 3 ? out : null
}

// 多部分 key（；， 或 分隔）：逐部分生成选项；全部成功才出题
function multiPartOpts(key) {
  const parts = String(key)
    .split(/[；;]| ， |，| 或 /)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (parts.length < 2) return null
  const gen = (raw) => {
    // 剥 "(n) " 编号前缀与中文标签前缀（"切线方程："）
    let p = raw.replace(/^\(\d\)\s*/, '')
    p = p.replace(/^[\u4e00-\u9fff]+[：:]\s*/, (m) => (raw.startsWith(m) ? '' : m))
    // 数值结论："label = 数字" 或 "∫_L = 值" 或 纯数值表达式
    const mEq = p.match(/^(.*?)\s*=\s*([+\-−]?\d+(?:\.\d+)?)\s*$/)
    if (mEq && mEq[1] !== '' && mEq[1].length <= 20) {
      const val = numEval(mEq[2].replace(/−/g, '-'))
      if (val != null) {
        const d = numDistractors(val, mEq[2])
        return d.length >= 3 ? [p, ...d.map((x) => `${mEq[1]} = ${x}`)] : null
      }
    }
    if (numEval(p) != null) {
      const d = numDistractors(numEval(p), p)
      return d.length >= 3 ? [p, ...d] : null
    }
    if (/\d+\s*[xzy]/.test(p) && /\s*=\s*[+\-−]?\d*($| )/.test(p) && parseLinEq(p) != null) {
      const d = eqDistractors(p)
      return d != null && d.length >= 3 ? [p, ...d] : null
    }
    if (/^\((-?\d+), ?(-?\d+), ?(-?\d+)\)$/.test(p)) {
      const d = vecDistractors(p)
      return d ? [p, ...d] : null
    }
    const lineP = p.replace(/即.*$/, '').trim()
    if (lineP.split('=').length === 3 && lineP.match(/\//)) {
      const d = lineDistractors(lineP)
      return d ? [p, ...d] : null
    }
    return null
  }
  const groups = parts.map(gen)
  // 只保留能生成选项的部分（"即..."等价式、条件子句等丢弃）
  const usable = []
  for (let i = 0; i < parts.length; i++) {
    if (groups[i] != null) usable.push(i)
  }
  if (usable.length === 0) return null
  const correct = usable.map((i) => parts[i]).join(' 或 ')
  const wrongs = []
  for (const i of usable) {
    for (const sel of [1, 2, 3]) {
      const w = usable.map((j) => (j === i ? groups[j][sel] : parts[j])).join(' 或 ')
      if (w !== correct && !wrongs.includes(w)) wrongs.push(w)
      if (wrongs.length >= 3) break
    }
    if (wrongs.length >= 3) break
  }
  if (wrongs.length < 3) return null
  return [correct, ...wrongs.slice(0, 3)]
}

export function buildOptionsForKey(key) {
  if (!key) return null
  const k = String(key).trim()
  // 多部分（；， 或 分隔多个子答案）
  if (/；|，|\s或\s/.test(k)) {
    const r = multiPartOpts(k)
    if (r != null) return r
    return null // 多部分生成失败 → 保留填空判分
  }
  // 单部分
  // 数值（可带 d = / V = / ∫_L = / r = 前缀）
  const mLab = k.match(/^(∫_L|∮_L|d|V|r)\s*=\s*(.+)$/)
  const prefix = mLab ? `${mLab[1]} = ` : ''
  const bare = mLab ? mLab[2].trim() : k
  const val = numEval(bare)
  if (val != null && /^[0-9+\-−*/(). ²³√π\s]*$/.test(bare)) {
    const d = numDistractors(val, bare)
    if (d.length >= 3) return [k, ...d.map((x) => prefix + x)]
  }
  // 线性方程
  if (parseLinEq(bare) != null) {
    const d = eqDistractors(bare)
    if (d != null && d.length >= 3) return [k, ...d]
  }
  // 纯向量
  const vm = k.match(/^[= ]?\((-?\d+), ?(-?\d+), ?(-?\d+)\)$/);
  if (vm && vecDistractors(vm[0]) != null) {
    const vs = vm[0]
    const d = vecDistractors(vs)
    return [k, ...d]
  }
  // 直线对称式
  if (k.match(/\//)) {
    const d = lineDistractors(k)
    if (d != null && d.length >= 3) return [k, ...d]
  }
  return null
}

// ---------- 数学 ----------
// 确定性洗牌（选项顺序固定，重建不漂移）
function shuffled(arr, seed) {
  let s = seed >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildMath() {
  const raw = loadJson(path.join(EXTRACTED, 'math750.json'));
  const qs = raw.questions;
  // 无答案题的自解答案键（solved-c*.json 合并产物，人工逐题求解并页图核对）
  const supKeys = loadJson(path.join(EXTRACTED, 'math750-solved.json'));

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
    const supKey = String(supKeys[String(q.num)] ?? '');
    const hasAns = q.has_answer && q.answer_text.trim().length > 0;
    const repairedAnswer = hasAns ? repairMathText(q.answer_text) : '';
    const extracted = hasAns ? extractAnswerKey(repairedAnswer) : '';
    // 书本答案提取失败时回退到补充 key（避免 hasAns 题丢答案）
    const key = extracted !== '' ? extracted : supKey;
    const repairedStem = repairMathText(q.stem);
    // 嵌入式选择题：题干自带 (A)-(D) 选项 + 自解字母答案 → 原生选择题
    const emb = extractEmbeddedOptions(repairedStem);
    let type, options = [], answer = '', stemFinal = repairedStem;
    if (emb != null && /^[A-D]$/.test(key)) {
      type = 'single';
      stemFinal = emb.stem;
      options = emb.options;
      answer = String('ABCD'.indexOf(key));
    } else {
      const optGroup = buildOptionsForKey(key);
      // 可出题 → 选择题（选项打乱、记录正确索引）；否则 → 填空（输入判分）/ 自评
      if (optGroup != null) {
        type = 'single';
        options = shuffled(optGroup.slice(), q.num * 7919 + 13);
        answer = String(options.indexOf(optGroup[0]));
      } else if (key !== '' || q.type === 'proof') {
        type = 'blank';
        answer = hasAns ? repairedAnswer.slice(0, 2000) : key;
      } else {
        type = 'calc';
      }
    }
    questions.push({
      id,
      num: q.num,
      kpId: `${chap.id}.kp01`,
      type,
      stem: stemFinal,
      options,
      answer,
      answerKey: key,
      explanation: '',
      difficulty: q.difficulty,
      source: { book: BOOK, chapter: chap.name, page: '', no: q.num },
      answerSource: hasAns ? { book: BOOK, page: '答案区', no: q.num } : { book: `${BOOK}·AI 拟答`, page: '', no: q.num },
      needsReview: !(hasAns || supKey !== ''),
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
  // 优先加载 AI 拟写的真题（env-real.json），回退占位题 env.json
  let realPath = path.join(EXTRACTED, 'env-real.json');
  let raw = fs.existsSync(realPath)
    ? loadJson(realPath)
    : loadJson(path.join(EXTRACTED, 'env.json'));
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
    answerKey: q.answer_key ?? q.answerKey ?? '',
    explanation: q.explanation ?? '',
    difficulty: q.difficulty ?? 1,
    source: q.source || { book: sourceBook },
    answerSource: q.answer_source || q.answerSource || q.source || { book: sourceBook },
    needsReview: q.needs_review ?? q.needsReview ?? true,
  }));

  // 关卡：每 10 题 1 关（与 math 同规则），只用 needs_review=false 的题
  for (const chap of chapters) {
    const prefix = chap.id === 'env.ch01' ? 'env.' : 'envp.';
    const playable = questions.filter((q) => String(q.kpId).startsWith(prefix) && !q.needsReview);
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
  }

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
