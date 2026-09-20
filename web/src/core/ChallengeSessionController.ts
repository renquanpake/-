// ChallengeSessionController.ts — 一关的会话状态（题目序列、逐题结果、退出作废）
// 由 C# StudyFarm.Challenge.ChallengeSessionController 翻译，纯逻辑（无 UnityEngine）
import type { GameSave, Level, LevelProgress, Question } from './types'
import type { QuizController, ChallengeAnswer } from './QuizController'
import type { EconomyController } from './EconomyController'
import type { QuestionBank } from './QuestionBank'

export interface LevelResult {
  stars: number // 0=未通关 1/2/3
  rate: number
  correct: number
  total: number
  cleared: boolean
}

function newLevelProgress(): LevelProgress {
  return { stars: 0, bestRate: 0, cleared: false }
}

export class ChallengeSessionController {
  private level: Level | null = null
  private idx = 0
  private correct = 0
  private aborted = false
  private readonly quiz: QuizController
  private readonly econ: EconomyController

  IsActive: boolean
  LastResult: LevelResult | null

  constructor(quiz: QuizController, econ: EconomyController) {
    this.quiz = quiz
    this.econ = econ
    this.IsActive = false
    this.LastResult = null
  }

  Start(lv: Level, save: GameSave): void {
    this.level = lv
    this.idx = 0
    this.correct = 0
    this.aborted = false
    this.IsActive = true
    if (this.quiz != null) this.quiz.Context = 'challenge'
    if (lv.questionIds.length > 0) {
      this.quiz.Present(QuestionBankStatic.Get(lv.questionIds[0]))
    }
  }

  BindBank(bank: QuestionBank | null): void {
    QuestionBankStatic.Bind(bank)
  }

  // 提交当前题
  Submit(choice: number | null, save: GameSave): ChallengeAnswer {
    const r = this.quiz.SubmitChallenge(choice, save)
    if (r.correct) this.correct++
    this.idx++
    const level = this.level
    if (level != null && this.idx < level.questionIds.length) {
      this.quiz.Present(QuestionBankStatic.Get(level.questionIds[this.idx]))
    }
    return r
  }

  // 自动判分提交（玩家输入答案）
  SubmitGraded(input: string, save: GameSave): ChallengeAnswer {
    const r = this.quiz.SubmitGraded(input, save)
    if (r.correct) this.correct++
    this.idx++
    const level = this.level
    if (level != null && this.idx < level.questionIds.length) {
      this.quiz.Present(QuestionBankStatic.Get(level.questionIds[this.idx]))
    }
    return {
      questionId: r.questionId,
      correct: r.correct,
      counted: true,
      manualReveal: r.manualReveal
    }
  }

  // 结算（R11.6 星级：90/70/50）
  Finish(save: GameSave): LevelResult {
    const level = this.level as Level
    const total = level.questionIds.length
    const rate = total > 0 ? this.correct / total : 0
    let stars = 0
    let cleared = false
    if (rate >= level.star3Rate) {
      stars = 3
      cleared = true
    } else if (rate >= level.star2Rate) {
      stars = 2
      cleared = true
    } else if (rate >= level.passRate) {
      stars = 1
      cleared = true
    }

    if (cleared) {
      const oldStars = save.levels[level.id]?.stars ?? 0
      const firstClear = oldStars === 0

      let prog = save.levels[level.id]
      if (prog === undefined) {
        prog = newLevelProgress()
        save.levels[level.id] = prog
      }
      prog.stars = Math.max(prog.stars, stars)
      prog.bestRate = Math.max(prog.bestRate, rate)
      prog.cleared = true

      // 首通奖励（R11.7）
      if (firstClear) {
        this.econ.GrantLevelReward(save, level.reward)
      } else {
        // 星级提升补差奖励（R11.7）
        this.econ.GrantLevelUpgrade(save, stars - oldStars)
      }

      // 通关随机掉落（R8.1）
      this.econ.RandomDrop(save)

      // 章末宝箱：本章全部关卡（含 boss）3 星 → 发宝箱一次（R11.9）
      if (this.AllChapterThreeStars(save)) {
        const chapId = level.id.substring(0, level.id.lastIndexOf('.'))
        if (!save.chapterChests.includes(chapId)) {
          save.chapterChests.push(chapId)
          this.econ.GrantChapterChest(save)
        }
      }
    }

    const result: LevelResult = {
      stars: stars,
      rate: rate,
      correct: this.correct,
      total: total,
      cleared: cleared
    }
    this.LastResult = result
    this.IsActive = false
    this.quiz.Init()
    return result
  }

  // 本章全部关卡（含 boss）达 3 星
  private AllChapterThreeStars(save: GameSave): boolean {
    if (this.level == null) return false
    const chapId = this.level.id.substring(0, this.level.id.lastIndexOf('.'))
    const levels = QuestionBankStatic.GetLevels(chapId)
    if (levels.length === 0) return false
    for (const lv of levels) {
      const p = save.levels[lv.id]
      if (p === undefined || p.stars < 3) return false
    }
    return true
  }

  // 退出：整关作废（R11.8）
  Abort(): void {
    this.aborted = true
    this.IsActive = false
    this.quiz.Init()
  }

  get CurrentQuestion(): Question | null {
    const lv = this.level
    if (lv != null && this.idx < lv.questionIds.length) {
      return QuestionBankStatic.Get(lv.questionIds[this.idx])
    }
    return null
  }
}

// 避免循环依赖，用静态桥接 QuestionBank 单例
export class QuestionBankStatic {
  private static bank: QuestionBank | null = null

  static Bind(b: QuestionBank | null): void {
    QuestionBankStatic.bank = b
  }

  static Get(id: string): Question | null {
    return QuestionBankStatic.bank?.GetQuestion(id) ?? null
  }

  static GetLevels(chapterId: string): Level[] {
    return QuestionBankStatic.bank?.GetLevels(chapterId) ?? []
  }
}
