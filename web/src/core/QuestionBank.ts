// QuestionBank.ts — 题库加载与索引（数据注入改造：构造函数接收 QuestionBankFile[]，无文件读写）
// 由 C# StudyFarm.Core.QuestionBank 翻译，纯逻辑（无 UnityEngine / 文件系统）
import type {
  GameSave,
  KnowledgePoint,
  Level,
  Question,
  QuestionBankFile
} from './types'

export interface IQuestionBank {
  DrawQuestion(kpId: string, save: GameSave): Question | null
  GetQuestion(id: string): Question | null
  GetLevels(chapterId: string): Level[]
  GetMeta(kpId: string): KnowledgePoint | null
  GetChapterOfKp(kpId: string): string | null
}

function hasKey(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export class QuestionBank implements IQuestionBank {
  Questions: Record<string, Question> = {}
  KnowledgePoints: Record<string, KnowledgePoint> = {}
  LevelsByChapter: Record<string, Level[]> = {}
  KpToChapter: Record<string, string> = {}
  Subjects: QuestionBankFile[] = []
  private readonly rng: () => number

  LoadErrors: string[] = []

  // 数据注入改造：C# Init 读 StreamingAssets/questionbank/*.json，
  // Web 版由调用方读好文件后 JSON.parse 成 QuestionBankFile[] 注入
  constructor(banks: QuestionBankFile[], rng?: () => number) {
    this.rng = rng ?? Math.random
    for (const data of banks) {
      this.Subjects.push(data)
      this.IndexSubject(data)
    }
  }

  private IndexSubject(d: QuestionBankFile): void {
    for (const q of d.questions ?? []) {
      this.Questions[q.id] = q
      const kp = q.kpId == null || q.kpId === undefined ? '' : q.kpId
      if (kp !== '') {
        const k = this.KnowledgePoints[kp]
        if (k !== undefined) k.linkedQuestionCount++
      }
    }
    for (const ch of d.chapters ?? []) {
      if (ch.levels != null) this.LevelsByChapter[ch.id] = ch.levels
      if (ch.knowledgePoints != null) {
        for (const kp of ch.knowledgePoints) {
          this.KnowledgePoints[kp.id] = kp
          this.KpToChapter[kp.id] = ch.id
        }
      }
    }
  }

  // R1.4：启动校验 source 完整性，缺失清单进启动日志
  LogSourceValidation(): void {
    const missing: string[] = []
    for (const q of Object.values(this.Questions)) {
      if (q.source == null || !hasSourceContent(q.source)) {
        missing.push(`q ${q.id} source 缺失`)
      }
    }
    for (const kp of Object.values(this.KnowledgePoints)) {
      if (kp.source == null || !hasSourceContent(kp.source)) {
        missing.push(`kp ${kp.id} source 缺失`)
      }
    }
    if (missing.length > 0) {
      this.LoadErrors.push(
        `source 校验失败 ${missing.length} 项: ` + missing.slice(0, 20).join('; ')
      )
    }
  }

  GetChapterOfKp(kpId: string): string | null {
    return hasKey(this.KpToChapter, kpId) ? this.KpToChapter[kpId] : null
  }

  // 农场抽题：kpId 题目池随机，排除近5次已用
  DrawQuestion(kpId: string, save: GameSave): Question | null {
    const pool: Question[] = []
    for (const q of Object.values(this.Questions)) {
      const qkp = q.kpId == null || q.kpId === undefined ? '' : q.kpId
      if (qkp === kpId && !q.needsReview) pool.push(q)
    }
    if (pool.length === 0) {
      // 允许占位练习题（环工 needs_review 题可作练习）
      for (const q of Object.values(this.Questions)) {
        const qkp = q.kpId == null || q.kpId === undefined ? '' : q.kpId
        if (qkp === kpId) pool.push(q)
      }
    }
    if (pool.length === 0) return null

    const recent =
      save.recentDraws != null && hasKey(save.recentDraws, kpId)
        ? save.recentDraws[kpId]
        : null
    // 近5次去重：优先从未用过的题中抽；全用过才从近5次外随机
    let pick: Question | null = null
    const unused = pool.filter(q => recent == null || !recent.includes(q.id))
    if (unused.length > 0) {
      pick = unused[Math.floor(this.rng() * unused.length)]
    } else {
      pick = pool[Math.floor(this.rng() * pool.length)]
    }
    if (save.recentDraws == null) save.recentDraws = {}
    if (!hasKey(save.recentDraws, kpId)) save.recentDraws[kpId] = []
    const list = save.recentDraws[kpId]
    list.push(pick.id)
    while (list.length > 5) list.shift()
    return pick
  }

  GetQuestion(id: string): Question | null {
    return hasKey(this.Questions, id) ? this.Questions[id] : null
  }

  GetLevels(chapterId: string): Level[] {
    return hasKey(this.LevelsByChapter, chapterId)
      ? this.LevelsByChapter[chapterId]
      : []
  }

  GetMeta(kpId: string): KnowledgePoint | null {
    return hasKey(this.KnowledgePoints, kpId) ? this.KnowledgePoints[kpId] : null
  }
}

function hasSourceContent(s: { book?: string | null }): boolean {
  // 对齐 C# Source.HasContent() => !string.IsNullOrEmpty(book)
  return s.book !== null && s.book !== undefined && s.book.length > 0
}
