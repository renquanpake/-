import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QuestionBank } from '../src/core/QuestionBank'
import { newGameSave, type QuestionBankFile } from '../src/core/types'

const BANK_DIR = join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'game/Assets/StreamingAssets/questionbank'
)

function loadBanks(): QuestionBankFile[] {
  return ['math.json', 'env.json'].map(f =>
    JSON.parse(readFileSync(join(BANK_DIR, f), 'utf8')) as QuestionBankFile
  )
}

describe('QuestionBankTests', () => {
  it('LoadsRealQuestionBanks', () => {
    const bank = new QuestionBank(loadBanks())
    expect(bank.LoadErrors.length).toBe(0)
    const qs = Object.values(bank.Questions)
    expect(qs.length).toBeGreaterThanOrEqual(705)
    // camelCase 键解析验证（关键回归：snake_case 会导致 kpId 全空）
    const kpsWithLink = qs.filter(q => q.kpId != null && q.kpId.length > 0).length
    expect(kpsWithLink).toBe(qs.length)
    // 关卡引用
    const levels = bank.GetLevels('math.ch08')
    expect(levels.length).toBeGreaterThanOrEqual(1)
    const totalQ = levels.reduce((sum, l) => sum + l.questionIds.length, 0)
    expect(totalQ).toBeGreaterThanOrEqual(10)
    // 章节映射
    expect(bank.GetChapterOfKp('math.ch08.kp01')).toBe('math.ch08')
  })

  it('DrawQuestion_RespectsRecentExclusion', () => {
    const bank = new QuestionBank(loadBanks())
    const s = newGameSave()
    // 挑一个有 3+ 道题的 kp（每题池大小 >= 3 时近 5 次去重才有可观察差异）
    let kpId: string | null = null
    const poolSize: Record<string, number> = {}
    for (const q of Object.values(bank.Questions)) {
      const kp = q.kpId ?? ''
      if (kp.length > 0) {
        poolSize[kp] = (poolSize[kp] ?? 0) + 1
      }
    }
    for (const [k, v] of Object.entries(poolSize)) {
      if (v >= 3) {
        kpId = k
        break
      }
    }
    if (kpId == null) {
      // 每个 kp 只挂 1 题 → 去重语义退化为反复抽同一题，仅验证可抽题
      kpId = Object.values(bank.Questions)[0].kpId
      const q = bank.DrawQuestion(kpId, s)
      expect(q).not.toBeNull()
      return
    }
    const ids: string[] = []
    for (let i = 0; i < 30; i++) {
      const q = bank.DrawQuestion(kpId, s)
      if (q != null) ids.push(q.id)
    }
    // 近 5 次去重：同一题被抽中后 5 轮内不会再出现，单题最多约 6 次
    const counts: Record<string, number> = {}
    for (const x of ids) {
      counts[x] = (counts[x] ?? 0) + 1
    }
    const maxFreq = Math.max(...Object.values(counts))
    expect(ids.length).toBe(30)
    expect(maxFreq).toBeLessThanOrEqual(7)
  })
})
