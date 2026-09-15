import { describe, it, expect } from 'vitest'
import { Scheduler } from '../src/core/Scheduler'
import { newGameSave } from '../src/core/types'

describe('SchedulerTests', () => {
  it('IntervalSequence_OnCorrect', () => {
    const s = new Scheduler()
    const save = newGameSave()

    const p1 = s.OnAnswer('kp1', true, save)
    expect(p1.newInterval).toBe(1)

    const p2 = s.OnAnswer('kp1', true, save)
    expect(p2.newInterval).toBe(3)

    const p3 = s.OnAnswer('kp1', true, save)
    expect(p3.newInterval).toBe(7)
  })

  it('WrongAnswer_ResetsIntervalToOne', () => {
    const s = new Scheduler()
    const save = newGameSave()
    s.OnAnswer('kp1', true, save)
    s.OnAnswer('kp1', true, save)
    const p = s.OnAnswer('kp1', false, save)
    expect(p.newInterval).toBe(1)
    expect(Math.abs(p.newEase - 2.2)).toBeLessThan(0.01)
  })

  it('NextDue_AlwaysGreaterThanNow', () => {
    const s = new Scheduler()
    const save = newGameSave()
    const p = s.OnAnswer('kp1', true, save)
    const now = Math.floor(Date.now() / 1000)
    expect(p.nextDueUnix).toBeGreaterThan(now)
  })

  it('GrowthReachesHarvest', () => {
    const s = new Scheduler()
    const save = newGameSave()
    let canHarvest = false
    for (let i = 0; i < 5; i++) {
      const p = s.OnAnswer('kp1', true, save)
      canHarvest = p.canHarvest
    }
    expect(canHarvest).toBe(true)
  })

  it('EaseCappedAt28', () => {
    const s = new Scheduler()
    const save = newGameSave()
    for (let i = 0; i < 20; i++) {
      s.OnAnswer('kp1', true, save)
    }
    const p = s.OnAnswer('kp1', true, save)
    expect(p.newEase).toBeLessThanOrEqual(2.8)
  })
})
