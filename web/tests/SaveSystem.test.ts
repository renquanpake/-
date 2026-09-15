import { describe, it, expect } from 'vitest'
import { SaveSystem, MemoryStorage } from '../src/core/SaveSystem'
import { newGameSave, type GameSave, type CropState } from '../src/core/types'

function crop(kpId: string, growth: number): CropState {
  return { kpId: kpId, growth: growth, interval: 0, ease: 0, nextDue: 0, state: '' }
}

describe('SaveSystemTests', () => {
  it('RoundTrip', () => {
    const sys = new SaveSystem(new MemoryStorage())
    const s = newGameSave()
    s.fruit = 100
    s.crops.push(crop('kp1', 3))
    sys.Save(s)

    const loaded = sys.Load()
    expect(loaded.fruit).toBe(100)
    expect(loaded.crops.length).toBe(1)
    expect(loaded.crops[0].kpId).toBe('kp1')
  })
})

describe('SaveSystemMigrationTests', () => {
  it('V2Save_MigratesToV3', () => {
    const storage = new MemoryStorage()
    const sys = new SaveSystem(storage)
    // 手工造一个 v2 档（无 v3 字段）
    const v2: GameSave = newGameSave()
    delete (v2 as { streak?: unknown }).streak
    delete (v2 as { chapterStats?: unknown }).chapterStats
    delete (v2 as { dailyAnswers?: unknown }).dailyAnswers
    delete (v2 as { lastLegendaryDropUnix?: unknown }).lastLegendaryDropUnix
    v2.schemaVersion = 2
    v2.fruit = 42
    v2.crops.push(crop('k1', 2))
    storage.write(sys.SavePath, JSON.stringify(v2))

    const loaded = sys.Load()
    expect(loaded.schemaVersion).toBe(3)
    expect(loaded.fruit).toBe(42)
    expect(loaded.chapterStats).toBeDefined()
    expect(loaded.dailyAnswers).toBeDefined()
    expect(loaded.crops.length).toBe(1)
  })

  it('CorruptSave_RollsBackToBackup', () => {
    const storage = new MemoryStorage()
    const sys = new SaveSystem(storage)
    // 模拟 C# persistentDataPath 里遗留的旧档（磁盘状态跨测试运行残留）
    const leftover = newGameSave()
    leftover.fruit = 100
    storage.write(sys.SavePath, JSON.stringify(leftover))

    const s = newGameSave()
    s.fruit = 100
    sys.Save(s) // 写前备份当前档
    storage.write(sys.SavePath, '{corrupt json')
    const loaded = sys.Load()
    expect(loaded.fruit).toBe(100)
  })
})
