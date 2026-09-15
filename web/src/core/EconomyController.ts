import type { GameSave, LevelReward } from './types'

const SeedCommonPrice = 5
const FertilizerPrice = 15
const PotionPrice = 40

export class EconomyController {
  private readonly rng: () => number

  constructor(rng?: () => number) {
    this.rng = rng ?? Math.random
  }

  Init(save: GameSave): void {}

  BuySeed(save: GameSave): boolean {
    if (save.fruit < SeedCommonPrice) return false
    save.fruit -= SeedCommonPrice
    save.inventory['seed_common'] = (save.inventory['seed_common'] ?? 0) + 1
    return true
  }

  BuyFertilizer(save: GameSave): boolean {
    if (save.fruit < FertilizerPrice) return false
    save.fruit -= FertilizerPrice
    save.inventory['fertilizer'] = (save.inventory['fertilizer'] ?? 0) + 1
    return true
  }

  BuyPotion(save: GameSave): boolean {
    if (save.fruit < PotionPrice) return false
    save.fruit -= PotionPrice
    save.inventory['potion'] = (save.inventory['potion'] ?? 0) + 1
    return true
  }

  HarvestYield(rarity: string): number {
    switch (rarity) {
      case 'common':
        return 20
      case 'rare':
        return 40
      case 'epic':
        return 80
      case 'legendary':
        return 160
      default:
        return 20
    }
  }

  GrantHarvest(save: GameSave, kpId: string, rarity: string): void {
    const y = this.HarvestYield(rarity)
    save.fruit += y
    save.mastered.push(kpId)
  }

  GrantLevelReward(save: GameSave, r: LevelReward): void {
    save.fruit += r.fruit
    save.inventory['seed_common'] = (save.inventory['seed_common'] ?? 0) + r.seeds
  }

  GrantLevelUpgrade(save: GameSave, starDiff: number): void {
    if (starDiff > 0) save.fruit += starDiff * 20
  }

  GrantChapterChest(save: GameSave): void {
    save.fruit += 60
    save.inventory['rare_seed'] = (save.inventory['rare_seed'] ?? 0) + 2
  }

  GrantCrit(save: GameSave): void {
    save.fruit += 1
  }

  RandomDrop(save: GameSave): string | null {
    const roll = this.rng()
    let drop: string | null = null
    if (roll < 0.02) {
      const now = Math.floor(Date.now() / 1000)
      const legendaryAllowed =
        save.lastLegendaryDropUnix === 0 || now - save.lastLegendaryDropUnix >= 30 * 86400
      drop = legendaryAllowed ? 'legendary_seed' : 'rare_seed'
      if (legendaryAllowed) save.lastLegendaryDropUnix = now
    } else if (roll < 0.1) {
      drop = 'rare_seed'
    } else if (roll < 0.25) {
      drop = 'decor'
    }

    if (drop !== null) save.inventory[drop] = (save.inventory[drop] ?? 0) + 1
    return drop
  }
}
