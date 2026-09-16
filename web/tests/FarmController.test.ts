import { describe, it, expect } from 'vitest'
import { FarmController } from '../src/core/FarmController'
import { Scheduler } from '../src/core/Scheduler'
import { EconomyController } from '../src/core/EconomyController'
import { newGameSave, ensureInvKey } from '../src/core/types'

function makeFx() {
  return { farm: new FarmController(), sched: new Scheduler(), econ: new EconomyController() }
}

describe('FarmController', () => {
  it('Plant consumes a seed and creates a growth-0 crop', () => {
    const { farm } = makeFx()
    const save = newGameSave()
    ensureInvKey(save)
    const r = farm.Plant(save, 'env.kp001')
    expect(r.ok).toBe(true)
    expect(save.inventory['seed_common']).toBe(4)
    expect(save.crops).toHaveLength(1)
    expect(save.crops[0].growth).toBe(0)
  })

  it('Plant refuses when no seed left', () => {
    const { farm } = makeFx()
    const save = newGameSave()
    ensureInvKey(save)
    save.inventory['seed_common'] = 0
    expect(farm.Plant(save, 'env.kp001').ok).toBe(false)
  })

  it('Harvest only at full growth, rewards fruit', () => {
    const { farm, econ } = makeFx()
    const save = newGameSave()
    ensureInvKey(save)
    farm.Plant(save, 'env.kp001')
    const fruitBefore = save.fruit
    expect(farm.Harvest(save, 'env.kp001', 'common', econ).ok).toBe(false)
    save.crops[0].growth = 5
    const r = farm.Harvest(save, 'env.kp001', 'common', econ)
    expect(r.ok).toBe(true)
    expect(save.crops).toHaveLength(0)
    expect(save.fruit).toBeGreaterThan(fruitBefore)
  })
})
