// LevelMapController.ts — 章节地图（节点/星级/boss 锁定态）
// 由 C# StudyFarm.Challenge.LevelMapController 翻译；Unity UI 渲染部分纯逻辑化：
// - 节点对象改为 LevelNodeModel（C# LevelNodeView 的纯数据版）
// - 位置布局规则保留（x 起点 40、步长 120）
// - 场景跳转（GameManager.GoToScene）改为可注入的 onEnterLevel 回调
import type { GameSave, Level, LevelProgress } from './types'
import type { QuestionBank } from './QuestionBank'

export function repeatChar(s: string, n: number): string {
  if (n <= 0) return ''
  let out = ''
  for (let i = 0; i < n; i++) out += s
  return out
}

// C# LevelNodeView 的纯数据版
export interface LevelNodeModel {
  level: Level
  progress: LevelProgress
  nameText: string
  starText: string
  locked: boolean
  x: number
}

function newLevelProgress(): LevelProgress {
  return { stars: 0, bestRate: 0, cleared: false }
}

export class LevelMapController {
  private bank: QuestionBank | null = null
  private save: GameSave | null = null

  // C# 版通过 ChallengeSessionControllerStatic 取单例；此处由外部注入
  session: { Start(lv: Level, s: GameSave): void } | null = null

  // C# 版调用 GameManager.I.GoToScene(GameScene.Challenge)；此处注入
  onEnterLevel: ((lv: Level) => void) | null = null

  Init(b: QuestionBank, s: GameSave): void {
    this.bank = b
    this.save = s
  }

  // 渲染某一章的关卡节点（纯布局计算，无实例化/销毁）
  RenderChapter(chapterId: string, chapterName: string): LevelNodeModel[] {
    const out: LevelNodeModel[] = []
    if (this.bank == null || this.save == null) return out

    const levels = this.bank.GetLevels(chapterId)
    const bossUnlocked = this.IsBossUnlocked(chapterId, levels)
    let x = 40
    for (const lv of levels) {
      const model: LevelNodeModel = {
        level: lv,
        progress: this.GetProgress(lv.id),
        nameText: lv.name,
        starText: this.StarText(this.GetProgress(lv.id)),
        locked: lv.isBoss && !bossUnlocked,
        x: x
      }
      out.push(model)
      x += 120
    }
    return out
  }

  // 星级展示文本（C# "★".Repeat(n) + "☆".Repeat(3-n)）
  private StarText(p: LevelProgress): string {
    return repeatChar('★', p.stars) + repeatChar('☆', 3 - p.stars)
  }

  // 章节全 3 星 → 解锁 boss 关与章末宝箱（R11.9）
  IsBossUnlocked(chapterId: string, levels: Level[]): boolean {
    const save = this.save
    if (save == null) return false
    for (const lv of levels) {
      if (lv.isBoss) continue
      const p = save.levels[lv.id]
      if (p === undefined || p.stars < 3) return false
    }
    return true
  }

  GetProgress(levelId: string): LevelProgress {
    const p = this.save?.levels[levelId]
    return p !== undefined ? p : newLevelProgress()
  }

  // 进入关卡：未解锁（前关未通关）则拒绝
  EnterLevel(lv: Level): boolean {
    if (this.bank == null || this.save == null || this.session == null) return false
    // boss 关需章节解锁
    if (lv.isBoss) {
      const chapId = lv.id.substring(0, lv.id.lastIndexOf('.'))
      const levels = this.bank.GetLevels(chapId)
      if (levels.length === 0 || !this.IsBossUnlocked(chapId, levels)) {
        return false
      }
    }
    this.session.Start(lv, this.save)
    if (this.onEnterLevel != null) this.onEnterLevel(lv)
    return true
  }
}
