import { describe, it, expect } from 'vitest'
import { StreakController } from '../src/core/StreakController'
import { newGameSave, utcDateStr } from '../src/core/types'
import type { GameSave } from '../src/core/types'

function NewSave(): GameSave {
  const s = newGameSave()
  s.inventory['potion'] = 1
  return s
}

describe('StreakControllerTests', () => {
  const streak = new StreakController()

  it('FirstActivity_StreakOneAndSigninReward', () => {
    const s = NewSave()
    const fruitBefore = s.fruit
    streak.OnActive(s)
    expect(s.streak.current).toBe(1)
    expect(s.fruit).toBe(fruitBefore + 5)
  })

  it('NextDayActive_StreakIncrements', () => {
    const s = NewSave()
    s.streak.lastActiveDate = utcDateStr(Math.floor(Date.now() / 1000) - 86400)
    s.streak.current = 2
    streak.OnActive(s)
    expect(s.streak.current).toBe(3)
  })

  it('GapDays_ZeroThenRestartToOne', () => {
    const s = NewSave()
    s.streak.lastActiveDate = utcDateStr(Math.floor(Date.now() / 1000) - 3 * 86400)
    s.streak.current = 5
    s.streak.best = 5
    streak.OnActive(s)
    expect(s.streak.current).toBe(1)
    expect(s.streak.preZeroStreak).toBe(5)
    expect(s.streak.zeroedAtUnix).toBeGreaterThanOrEqual(1)
    expect(s.streak.best).toBe(5)
  })

  it('Rescue_RestoresPreZeroStreakWithin48h', () => {
    const s = NewSave()
    s.streak.preZeroStreak = 9
    s.streak.zeroedAtUnix = Math.floor(Date.now() / 1000) - 3600
    s.streak.current = 1
    s.streak.lastActiveDate = utcDateStr(Math.floor(Date.now() / 1000))
    expect(streak.UseRescue(s)).toBe(true)
    expect(s.streak.current).toBe(9)
    expect(s.inventory['potion']).toBe(0)
    const curMonth = new Date().toISOString().slice(0, 7)
    expect(s.streak.rescueMonth).toBe(curMonth)
  })

  it('Rescue_RejectedOutside48h', () => {
    const s = NewSave()
    s.streak.preZeroStreak = 9
    s.streak.zeroedAtUnix = Math.floor(Date.now() / 1000) - 72 * 3600
    expect(streak.UseRescue(s)).toBe(false)
    expect(s.inventory['potion']).toBe(1)
  })

  it('Rescue_RejectedWhenNoPotion', () => {
    const s = NewSave()
    s.inventory['potion'] = 0
    s.streak.preZeroStreak = 9
    s.streak.zeroedAtUnix = Math.floor(Date.now() / 1000)
    expect(streak.UseRescue(s)).toBe(false)
  })

  it('Rescue_MonthlyLimit', () => {
    const s = NewSave()
    s.streak.rescueMonth = new Date().toISOString().slice(0, 7)
    s.streak.preZeroStreak = 9
    s.streak.zeroedAtUnix = Math.floor(Date.now() / 1000)
    expect(streak.UseRescue(s)).toBe(false)

    s.streak.rescueMonth = '0000-00'
    s.streak.preZeroStreak = 4
    expect(streak.UseRescue(s)).toBe(true)
  })

  it('Milestone7Days_30Fruit', () => {
    const s = NewSave()
    s.streak.current = 6
    s.streak.lastActiveDate = utcDateStr(Math.floor(Date.now() / 1000) - 86400)
    const before = s.fruit
    streak.OnActive(s)
    expect(s.streak.current).toBe(7)
    expect(s.fruit).toBe(before + 5 + 30)
  })

  it('Milestone30Days_RareSeed', () => {
    const s = NewSave()
    s.streak.current = 29
    s.streak.lastActiveDate = utcDateStr(Math.floor(Date.now() / 1000) - 86400)
    streak.OnActive(s)
    expect(s.inventory['rare_seed']).toBe(1)
  })
})
