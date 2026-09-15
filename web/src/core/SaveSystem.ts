// SaveSystem.ts — 本地 JSON 存档，3 份自动备份
// 由 C# StudyFarm.Core.SaveSystem 翻译；System.IO 替换为可注入的 Storage 抽象
import type { GameSave } from './types'
import { newGameSave, ensureV3Fields } from './types'

export interface Storage {
  read(path: string): string | null
  write(path: string, content: string): void
  list(prefix: string): string[]
}

// 测试用内存存储；mtime 用单调递增的 tick（同毫秒内写入也有先后序，
// 对齐 C# 按文件 LastWriteTimeUtc 排序的语义）
export class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>()
  private readonly mtimeMap = new Map<string, number>()
  private tick = 0

  read(path: string): string | null {
    const v = this.data.get(path)
    return v === undefined ? null : v
  }

  write(path: string, content: string): void {
    this.data.set(path, content)
    this.tick++
    this.mtimeMap.set(path, this.tick)
  }

  list(prefix: string): string[] {
    const out: string[] = []
    for (const k of this.data.keys()) {
      if (k.startsWith(prefix)) out.push(k)
    }
    return out
  }

  mtime(path: string): number {
    const t = this.mtimeMap.get(path)
    return t === undefined ? 0 : t
  }
}

// 浏览器适配：localStorage，key 统一加前缀 studyfarm.
export class LocalStorageStorage implements Storage {
  private readonly prefix = 'studyfarm.'

  read(path: string): string | null {
    return localStorage.getItem(this.prefix + path)
  }

  write(path: string, content: string): void {
    localStorage.setItem(this.prefix + path, content)
  }

  list(prefix: string): string[] {
    const out: string[] = []
    const full = this.prefix + prefix
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(full)) out.push(k.slice(this.prefix.length))
    }
    return out
  }
}

// 对齐 C# [Serializable] class BackupManifest
export interface BackupManifest {
  path: string
  timestamp: number
}

const MaxBackups = 3
const saveFileName = 'save.json'
const backupDirName = 'backups'

export class SaveSystem {
  private readonly storage: Storage
  readonly SavePath: string
  private readonly backupDir: string
  // Storage 无 delete 能力；C# File.Delete 的语义用内部删除标记实现
  private readonly deleted = new Set<string>()

  // 构造注入 Storage；base 路径对齐 C# Application.persistentDataPath
  constructor(storage: Storage, base?: string) {
    const root = base ?? 'studyfarm'
    this.storage = storage
    this.SavePath = `${root}/${saveFileName}`
    this.backupDir = `${root}/${backupDirName}`
  }

  private readFile(path: string): string | null {
    if (this.deleted.has(path)) return null
    return this.storage.read(path)
  }

  private writeFile(path: string, content: string): void {
    this.deleted.delete(path)
    this.storage.write(path, content)
  }

  Save(state: GameSave): void {
    try {
      state.schemaVersion = 3
      ensureV3Fields(state)
      const json = JSON.stringify(state)
      // 写前备份当前档
      if (this.readFile(this.SavePath) !== null) {
        this.MakeBackup()
      }
      this.writeFile(this.SavePath, json)
    } catch {
      // 写失败：保留旧档，内存态继续运行（Error Handling 表）
    }
  }

  Load(): GameSave {
    try {
      const raw = this.readFile(this.SavePath)
      if (raw == null) {
        const s = newGameSave()
        ensureV3Fields(s)
        return s
      }
      const loaded = JSON.parse(raw) as GameSave
      const migrated = this.Migrate(loaded)
      ensureV3Fields(migrated)
      return migrated
    } catch {
      // 读失败，回滚到最近备份
      return this.RollbackToBackup()
    }
  }

  Export(): string {
    const s = this.Load()
    return JSON.stringify(s)
  }

  Import(jsonText: string): boolean {
    try {
      let s = JSON.parse(jsonText) as GameSave
      s = this.Migrate(s)
      ensureV3Fields(s)
      this.Save(s)
      return true
    } catch {
      return false
    }
  }

  // 从文件导入（R9.3）：先校验 JSON 可解析再覆盖
  ImportFromPath(filePath: string): boolean {
    try {
      const raw = this.readFile(filePath)
      if (raw == null) return false
      return this.Import(raw)
    } catch {
      return false
    }
  }

  // 低版本档迁移（Correctness Property 4）
  private Migrate(s: GameSave): GameSave {
    // C# int 缺省为 0；JSON 缺字段时 TS 为 undefined，按 0 处理对齐
    const ver = s.schemaVersion ?? 0
    if (ver < 2) {
      // v1 → v2：补 challenge/reveal_log 字段
      s.schemaVersion = 2
      if (s.levels == null) s.levels = {}
      if (s.revealLog == null) s.revealLog = {}
    }
    if (s.schemaVersion < 3) {
      // v2 → v3：补答题日志/章节统计/传说限流/streak 清零时间
      s.schemaVersion = 3
    }
    return s
  }

  private MakeBackup(): void {
    const ts = Math.floor(Date.now() / 1000)
    let dst = `${this.backupDir}/save_${ts}.json`
    // 同秒内多次写档 → 文件名冲突，追加序号
    let n = 0
    while (this.readFile(dst) !== null) {
      n++
      dst = `${this.backupDir}/save_${ts}_${n}.json`
    }
    const content = this.readFile(this.SavePath)
    if (content != null) this.writeFile(dst, content)
    this.PruneBackups()
  }

  private RollbackToBackup(): GameSave {
    // 按修改时间倒序取最新备份（兼容同秒多份的序号后缀）
    const files = this.ListBackupFilesSortedMtimeDesc()
    for (const f of files) {
      try {
        const raw = this.readFile(f)
        if (raw == null) continue
        const s = JSON.parse(raw) as GameSave
        const migrated = this.Migrate(s)
        ensureV3Fields(migrated)
        this.writeFile(this.SavePath, JSON.stringify(migrated))
        return migrated
      } catch {
        // 继续找上一份
      }
    }
    const fresh = newGameSave()
    ensureV3Fields(fresh)
    return fresh
  }

  private fileMtime(path: string): number {
    // MemoryStorage 暴露单调 mtime；其它实现退回 0（保持 list 顺序）
    const s = this.storage as Storage & { mtime?: (p: string) => number }
    return typeof s.mtime === 'function' ? s.mtime(path) : 0
  }

  private ListBackupFilesSortedMtimeDesc(): string[] {
    const files = this.storage
      .list(this.backupDir + '/save_')
      .filter(f => this.IsBackupFileName(f) && !this.deleted.has(f))
    const withMtime = files.map(f => ({ f: f, mtime: this.fileMtime(f) }))
    withMtime.sort((a, b) => b.mtime - a.mtime)
    return withMtime.map(x => x.f)
  }

  private IsBackupFileName(path: string): boolean {
    const name = path.split('/').pop() ?? ''
    return name.startsWith('save_') && name.endsWith('.json')
  }

  private PruneBackups(): void {
    // 按修改时间倒序，保留最新 MaxBackups 份
    const files = this.ListBackupFilesSortedMtimeDesc()
    for (let i = MaxBackups; i < files.length; i++) {
      this.deleted.add(files[i])
    }
  }
}
