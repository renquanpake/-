import type { GameSave, CropState } from './types'

export interface ReviewPlan {
  newInterval: number
  newEase: number
  canHarvest: boolean
  nextDueUnix: number
}

export interface IScheduler {
  OnAnswer(kpId: string, correct: boolean, save: GameSave): ReviewPlan
  GetDueKnowledgePoints(save: GameSave): string[]
}

export class Scheduler implements IScheduler {
  static readonly HarvestGrowth = 5

  Init(save: GameSave): void {}

  OnAnswer(kpId: string, correct: boolean, save: GameSave): ReviewPlan {
    let crop = this.FindCrop(save, kpId)
    if (crop === undefined) {
      crop = { kpId, growth: 0, interval: 0, ease: 2.2, nextDue: 0, state: 'growing' }
      save.crops.push(crop)
    }

    const now = Math.floor(Date.now() / 1000)

    if (correct) {
      if (crop.interval === 0) crop.interval = 1
      else if (crop.interval === 1) crop.interval = 3
      else crop.interval = Math.round(crop.interval * crop.ease)
      crop.ease = Math.min(2.8, crop.ease + 0.05)
      if (crop.growth < Scheduler.HarvestGrowth) crop.growth++
    } else {
      crop.interval = 1
      crop.ease = 2.2
    }

    if (crop.growth >= Scheduler.HarvestGrowth) {
      crop.state = 'harvestable'
    } else {
      crop.nextDue = now + crop.interval * 86400
      crop.state = 'growing'
    }

    return {
      newInterval: crop.interval,
      newEase: crop.ease,
      canHarvest: crop.growth >= Scheduler.HarvestGrowth,
      nextDueUnix: crop.nextDue
    }
  }

  GetDueKnowledgePoints(save: GameSave): string[] {
    const due: string[] = []
    const now = Math.floor(Date.now() / 1000)
    for (const c of save.crops) {
      if (c.nextDue > 0 && c.nextDue <= now) due.push(c.kpId)
    }
    return due
  }

  IsWithered(c: CropState): boolean {
    const now = Math.floor(Date.now() / 1000)
    return c.nextDue > 0 && now - c.nextDue > 86400 && c.state !== 'harvestable' && c.state !== 'mastered'
  }

  MarkWithered(save: GameSave): void {
    for (const c of save.crops) {
      if (this.IsWithered(c) && c.state === 'growing') c.state = 'withered'
    }
  }

  ApplyFertilizer(save: GameSave, kpId: string): void {
    const c = this.FindCrop(save, kpId)
    if (c === undefined) return
    c.state = 'growing'
    const now = Math.floor(Date.now() / 1000)
    c.nextDue = now + c.interval * 86400
  }

  private FindCrop(save: GameSave, kpId: string): CropState | undefined {
    for (const c of save.crops) {
      if (c.kpId === kpId) return c
    }
    return undefined
  }
}
