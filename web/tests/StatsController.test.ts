import { describe, it, expect } from 'vitest'
import { StatsController } from '../src/core/StatsController'
import { newGameSave, utcDateStr } from '../src/core/types'

describe('StatsControllerTests', () => {
  it('EnvStat_UsesRealLog', () => {
    const stats = new StatsController()
    const s = newGameSave()
    s.envAnswers = 10
    s.envCorrect = 7
    s.crops.push({ kpId: 'k1', growth: 0, interval: 0, ease: 0, nextDue: 0, state: 'withered' })
    const st = stats.GetEnvStat(s)
    expect(st.answered).toBe(10)
    expect(st.correct).toBe(7)
    expect(Math.abs(st.correctRate - 0.7)).toBeLessThan(0.001)
    expect(st.withered).toBe(1)
  })

  it('ChallengeStat_ChapterRates', () => {
    const stats = new StatsController()
    const s = newGameSave()
    s.chapterStats['math.ch08'] = { total: 10, correct: 9 }
    s.levels['math.ch08.lv01'] = { stars: 3, cleared: true, bestRate: 0 }
    s.levels['math.ch08.lv02'] = { stars: 1, cleared: true, bestRate: 0 }
    const st = stats.GetChallengeStat(s)
    expect(st.clearedLevels).toBe(2)
    expect(st.totalStars).toBe(4)
    expect(Math.abs(st.chapterRates['math.ch08'] - 0.9)).toBeLessThan(0.001)
  })

  it('Last7Days_ReadsDailyAnswers', () => {
    const stats = new StatsController()
    const s = newGameSave()
    const now = Math.floor(Date.now() / 1000)
    s.dailyAnswers[utcDateStr(now)] = 5
    s.dailyAnswers[utcDateStr(now - 2 * 86400)] = 3
    const days = stats.Last7Days(s)
    expect(days.length).toBe(7)
    expect(days[6].count).toBe(5)
    const total = days.reduce((acc, d) => acc + d.count, 0)
    expect(total).toBe(8)
  })
})
