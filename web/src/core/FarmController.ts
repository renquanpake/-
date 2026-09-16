// FarmController.ts — 地块交互：播种 / 收获 / 化肥（由 C# StudyFarm.Core.FarmController 翻译，纯逻辑）
import type { GameSave } from './types'
import { Scheduler } from './Scheduler'
import type { EconomyController } from './EconomyController'

export interface PlantResult {
  ok: boolean
  msg: string
}

export interface HarvestResult {
  ok: boolean
  fruit: number
  rarity: string
}

export class FarmController {
  static readonly FieldSlots = 6

  Init(save: GameSave): void {}

  // 播种：扣 1 种子，创建 growth=0 作物
  Plant(save: GameSave, kpId: string, cropType = 'seed_common'): PlantResult {
    const have = save.inventory[cropType] ?? 0
    if (have < 1) return { ok: false, msg: '种子不足，请去商店购买' }
    for (const c of save.crops) {
      if (c.kpId === kpId) return { ok: false, msg: '该知识点已在生长' }
    }
    save.inventory[cropType] = have - 1
    save.crops.push({ kpId, growth: 0, interval: 0, ease: 2.2, nextDue: 0, state: 'growing' })
    return { ok: true, msg: '播种成功' }
  }

  // 收获：growth==5 → 产出果实 + 随机掉落，移除地块
  Harvest(save: GameSave, kpId: string, rarity: string, econ?: EconomyController): HarvestResult {
    const c = save.crops.find(x => x.kpId === kpId)
    if (c == null || c.growth < Scheduler.HarvestGrowth) return { ok: false, fruit: 0, rarity }
    save.crops = save.crops.filter(x => x !== c)
    if (econ != null) {
      econ.GrantHarvest(save, kpId, rarity)
      econ.RandomDrop(save)
    }
    return { ok: true, fruit: econ != null ? econ.HarvestYield(rarity) : 0, rarity }
  }

  // 用化肥恢复蔫萎
  UseFertilizer(save: GameSave, kpId: string, scheduler: Scheduler): boolean {
    const f = save.inventory['fertilizer'] ?? 0
    if (f < 1) return false
    save.inventory['fertilizer'] = f - 1
    scheduler.ApplyFertilizer(save, kpId)
    return true
  }

  DueCount(save: GameSave, scheduler: Scheduler): number {
    return scheduler.GetDueKnowledgePoints(save).length
  }
}
