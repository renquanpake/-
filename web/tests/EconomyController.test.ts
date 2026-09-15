import { describe, it, expect } from 'vitest'
import { EconomyController } from '../src/core/EconomyController'
import { newGameSave } from '../src/core/types'

const callCounter = { n: 0 }

describe('EconomyControllerTests', () => {
  it('RandomDrop_LegendaryLimitedToOncePer30Days', () => {
    const econ = new EconomyController(() => {
      const n = callCounter.n++
      if (n < 200) return 0.01
      if (n < 205) return 0.5
      return 0.01
    })
    const s = newGameSave()
    s.lastLegendaryDropUnix = Math.floor(Date.now() / 1000)

    for (let i = 0; i < 200; i++) {
      const d = econ.RandomDrop(s)
      expect(d === 'legendary_seed').toBe(false)
    }

    s.lastLegendaryDropUnix = Math.floor(Date.now() / 1000) - 31 * 86400
    s.inventory = {}
    let got = false
    for (let i = 0; i < 500; i++) {
      if (econ.RandomDrop(s) === 'legendary_seed') {
        got = true
        break
      }
    }
    expect(got).toBe(true)
    expect(s.inventory['legendary_seed']).toBe(1)
  })

  it('BuySeed_BalanceUnchangedWhenInsufficient', () => {
    const econ = new EconomyController()
    const s = newGameSave()
    s.fruit = 3
    const invBefore = s.inventory['seed_common']
    expect(econ.BuySeed(s)).toBe(false)
    expect(s.fruit).toBe(3)
    expect(s.inventory['seed_common']).toBe(invBefore)
  })

  it('GrantLevelUpgrade_PaysPerStar', () => {
    const econ = new EconomyController()
    const s = newGameSave()
    econ.GrantLevelUpgrade(s, 2)
    expect(s.fruit).toBe(40)
  })

  it('GrantHarvest_AddsYieldByRarity', () => {
    const econ = new EconomyController()
    const s = newGameSave()
    econ.GrantHarvest(s, 'kp1', 'rare')
    expect(s.fruit).toBe(40)
    expect(s.mastered.includes('kp1')).toBe(true)
  })
})
