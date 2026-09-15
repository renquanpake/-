import type { GameSave } from './types'
import { utcDateStr } from './types'

const DailySigninFruit = 5
const RescueWindowSeconds = 48 * 3600

function utcMonthStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 7)
}

export class StreakController {
  OnActive(save: GameSave): void {
    const now = Math.floor(Date.now() / 1000)
    const today = utcDateStr(now)
    if (save.streak.lastActiveDate === today) return

    const yesterday = utcDateStr(now - 86400)
    if (save.streak.lastActiveDate === yesterday) {
      save.streak.current++
    } else if (save.streak.lastActiveDate.length > 0) {
      save.streak.preZeroStreak = save.streak.current
      save.streak.zeroedAtUnix = now
      save.streak.current = 1
    } else {
      save.streak.current = 1
    }
    save.streak.lastActiveDate = today
    save.streak.best = Math.max(save.streak.best, save.streak.current)

    save.fruit += DailySigninFruit

    switch (save.streak.current) {
      case 7:
        save.fruit += 30
        break
      case 30:
        save.fruit += 100
        save.inventory['rare_seed'] = (save.inventory['rare_seed'] ?? 0) + 1
        break
      case 100:
        save.fruit += 300
        save.inventory['legendary_deco'] = (save.inventory['legendary_deco'] ?? 0) + 1
        break
    }
  }

  UseRescue(save: GameSave): boolean {
    const now = Math.floor(Date.now() / 1000)
    const curMonth = utcMonthStr(now)
    if (save.streak.rescueMonth === curMonth) return false

    const have = save.inventory['potion'] ?? 0
    if (have < 1) return false

    const inWindow = save.streak.zeroedAtUnix > 0 && now - save.streak.zeroedAtUnix <= RescueWindowSeconds
    if (!inWindow) return false
    if (save.streak.preZeroStreak < 1) return false

    save.inventory['potion'] = have - 1
    save.streak.current = save.streak.preZeroStreak
    save.streak.best = Math.max(save.streak.best, save.streak.current)
    save.streak.rescueMonth = curMonth
    save.streak.rescueUsedThisMonth = true
    save.streak.zeroedAtUnix = 0
    save.streak.preZeroStreak = 0
    return true
  }
}
