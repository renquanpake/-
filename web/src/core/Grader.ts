// Grader.ts — 主观题机判引擎（数值等价 / 符号模糊匹配 / 多部分答案）
// 纯逻辑，无 DOM。配合 Question.answerKey（答案首行结论）使用。
// 无法判定时 verdict='ungraded'，UI 回退到自评/看答案模式。

export type Verdict = 'correct' | 'partial' | 'wrong' | 'ungraded'

export interface GradeResult {
  verdict: Verdict
  /** 判分明细（给玩家看的提示文本） */
  detail: string
  /** 标准答案关键（answerKey 原样） */
  key: string
}

// ---------- 归一化 ----------

const SUP_MAP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n', '⁺': '+', '⁻': '-' }
const SUB_MAP: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n' }

function fullToHalf(t: string): string {
  let s = t
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  s = s.replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0).toUpperCase())
  s = s.replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0).toLowerCase())
  s = s.replace(/（/g, '(').replace(/）/g, ')').replace(/＝/g, '=').replace(/＋/g, '+').replace(/－/g, '-').replace(/／/g, '/')
  s = s.replace(/[−−]/g, '-')
  s = s.replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/√/g, 'SQRT')
  for (const [k, v] of Object.entries(SUP_MAP)) s = s.split(k).join(v)
  for (const [k, v] of Object.entries(SUB_MAP)) s = s.split(k).join(v)
  return s
}

export function normalize(t: string): string {
  let s = fullToHalf(t.trim()).replace(/\s+/g, '')
  s = s.replace(/π/g, 'PI').replace(/\bpi\b/g, 'PI').replace(/\be\b/g, 'E')
  return s
}

// ---------- 数值求值 ----------

/** 检测含自由变量（x/y/z/n/f 等，π/e/dx 等常量与微分记号除外） */
function hasFreeVar(t: string): boolean {
  let s = t
  // 保护常数/函数/微分记号
  s = s.replace(/SQRT/g, '').replace(/PI/g, '').replace(/EU/g, '').replace(/E/g, '')
  s = s.replace(/d[A-Za-z]/g, '')
  s = s.replace(/L|C|O/g, '') // 积分曲线/曲面标签
  // 剩余字母视为变量
  return /[A-Za-z]/.test(s)
}

function implicitMul(s: string): string {
  // 数字后紧跟 sqrt/PI/E/字母 → 补 *（函数名自身字母不动）
  s = s.replace(/(\d)(sqrt|PI|E)/g, '$1*$2')
  s = s.replace(/(\d)([A-Za-z])/g, '$1*$2')
  s = s.replace(/\)([A-Za-z0-9])/g, ')*$1')
  return s
}

/** 把数学表达式转成 JS 数值；含变量/无法解析返回 null */
export function evalNumber(t: string): number | null {
  let s = normalize(t)
  if (s === '') return null
  if (hasFreeVar(s)) return null
  // 去掉 "∫_L=" / "I=" 等标签前缀（已确认无自由变量）
  s = s.replace(LABEL_RE, '')
  s = s.replace(/SQRT\(/g, 'sqrt(').replace(/SQRT(\d+(?:\.\d+)?)/g, 'sqrt($1)').replace(/SQRTPI/g, 'sqrt(PI)')
  if (/SQRT/.test(s)) return null
  s = s.replace(/\^/g, '**')
  s = implicitMul(s)
  const cleaned = s.replace(/sqrt/g, '').replace(/PI/g, '').replace(/E/g, '')
  if (!/^[0-9+\-*/().]*$/.test(cleaned)) return null
  try {
    // 局部绑定 sqrt/PI/E，防逃逸
    const v = new Function('sqrt', 'PI', 'E', `"use strict";return (${s})`)(Math.sqrt, Math.PI, Math.E)
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

// ---------- 模糊匹配（符号型答案） ----------

/** 去标点取字母数字序列：两边相同说明只是排版差异 */
function alnum(t: string): string {
  return t.replace(/[^A-Za-z0-9]/g, '')
}

function partHit(partNorm: string, inputParts: string[], inputNorm: string): boolean {
  if (partNorm === inputNorm) return true
  // 双向包含（短侧至少 4 字符，避免 "0" 之类误中）
  if (inputNorm.length >= 4 && partNorm.length >= 4 && (inputNorm.includes(partNorm) || partNorm.includes(inputNorm))) return true
  for (const p of inputParts) {
    if (p.length >= 4 && partNorm.length >= 4 && (p.includes(partNorm) || partNorm.includes(p))) return true
  }
  // 字母数字序列相同（仅标点/空格/负号形式不同）
  const aA = alnum(partNorm)
  const aI = alnum(inputNorm)
  if (aA !== '' && aA === aI) return true
  // 玩家写了答案的核心子段（如多式结论的一部分，≥6 字符）
  if (aI.length >= 6 && aA.includes(aI)) return true
  return false
}

// ---------- 主判分 ----------

const LABEL_RE = /^(∫_L|∫_C|∮_L|∮_C|∫|∮|∑|Σ|I)\s*=\s*/

export function canGrade(answerKey: string): boolean {
  return answerKey != null && answerKey.trim() !== ''
}

export function gradeInput(input: string, answerKey: string): GradeResult {
  const key = (answerKey || '').trim()
  const raw = (input || '').trim()
  if (key === '') {
    return { verdict: 'ungraded', detail: '该题暂不支持自动判分，请对照答案自评。', key }
  }
  if (raw === '') {
    return { verdict: 'wrong', detail: '未填写答案。', key }
  }
  // 拆子答案（；，分隔；"或"备选展开；无 "=" 的条件式子句剔除，保留短结论词）
  const parts: string[] = []
  for (const seg of key.split(/[；;，,]/)) {
    let s = seg.trim().replace(LABEL_RE, '')
    if (s === '') continue
    if (!s.includes('=') && !s.includes('≈')) {
      if (s.length <= 12 && !s.includes('(')) parts.push(s)
      continue
    }
    for (const alt of s.split(/或/)) {
      const a = alt.trim()
      if (a !== '') parts.push(a)
    }
  }
  if (parts.length === 0) {
    return { verdict: 'ungraded', detail: '该答案无法拆解为可判定的部分，请对照答案自评。', key }
  }

  const inputNorm = normalize(raw)
  const inputParts = raw.split(/[；;，,]/).map((p) => normalize(p)).filter((p) => p !== '')

  let hit = 0
  const missed: string[] = []
  for (const part of parts) {
    const pNorm = normalize(part)
    const pNum = evalNumber(part)
    if (pNum != null) {
      // 数值型 part：只做数值比较（失败即未命中，不再走模糊匹配，避免 √2/3 ≈ √3/3 误判）
      const inNum = evalNumber(raw)
      if (inNum != null && Math.abs(pNum - inNum) / Math.max(1, Math.abs(pNum), Math.abs(inNum)) <= 1e-3) {
        hit++
        continue
      }
      let anyNum = false
      for (const ip of inputParts) {
        const iv = evalNumber(ip)
        if (iv != null && Math.abs(pNum - iv) / Math.max(1, Math.abs(pNum), Math.abs(iv)) <= 1e-3) {
          anyNum = true
          break
        }
      }
      if (anyNum) {
        hit++
        continue
      }
      missed.push(part.length > 40 ? part.slice(0, 40) + '…' : part)
      continue
    }
    if (partHit(pNorm, inputParts, inputNorm)) hit++
    else missed.push(part.length > 40 ? part.slice(0, 40) + '…' : part)
  }

  if (hit === parts.length) return { verdict: 'correct', detail: '答案与标准一致。', key }
  if (hit > 0) return { verdict: 'partial', detail: `部分正确（${hit}/${parts.length}）。待核对：${missed.join('；')}`, key }
  return { verdict: 'wrong', detail: `答案与标准不符。标准：${key.slice(0, 80)}`, key }
}
