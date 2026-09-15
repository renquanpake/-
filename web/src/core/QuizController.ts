// QuizController.ts — 答题核心（农场 + 闯关共用），含答案折叠状态机
// 由 C# StudyFarm.Core.QuizController 翻译，纯逻辑（无 UnityEngine / DOM）
import type { GameSave, Question, Source } from './types'
import { ensureV3Fields, utcDateStr } from './types'
import type { IQuestionBank } from './QuestionBank'

export enum QuizPhase {
  ShowingQuestion = 'ShowingQuestion',
  ManualRevealed = 'ManualRevealed',
  Judged = 'Judged'
}

export interface ReviewResult {
  questionId: string | null
  correct: boolean
  manualReveal: boolean
  answerText: string | null
  answerSource: Source | null
  explanation: string | null
}

export interface ChallengeAnswer {
  questionId: string | null
  correct: boolean
  counted: boolean
  manualReveal: boolean
}

function nowUtcDateStr(): string {
  return utcDateStr(Math.floor(Date.now() / 1000))
}

function chapterAnswerStat(): { total: number; correct: number } {
  return { total: 0, correct: 0 }
}

export class QuizController {
  private phase: QuizPhase = QuizPhase.ShowingQuestion
  private current: Question | null = null
  private manualRevealed = false
  private combo = 0 // 连对计数（R3.4 暴击）

  // 上下文：farm（浇水）/ challenge（闯关），决定统计归属
  Context: string = 'farm'
  BankRef: IQuestionBank | null = null

  // 委托：连对 3 题暴击（GameManager 接线 econ.GrantCrit）
  OnCrit: (() => void) | null = null
  // 委托：答题提交完成（GameManager 接线 streak.OnActive + 存档）
  OnAnswerSubmitted: ((correct: boolean) => void) | null = null

  get Current(): Question | null {
    return this.current
  }
  get Phase(): QuizPhase {
    return this.phase
  }
  get ManualRevealed(): boolean {
    return this.manualRevealed
  }
  get Combo(): number {
    return this.combo
  }

  Init(): void {
    this.phase = QuizPhase.ShowingQuestion
    this.current = null
    this.manualRevealed = false
    this.combo = 0
  }

  Present(q: Question | null): void {
    this.current = q
    this.phase = QuizPhase.ShowingQuestion
    this.manualRevealed = false
  }

  // 玩家主动展开答案（SHOWING_QUESTION → MANUAL_REVEALED，该题强制判负）
  RevealAnswer(): void {
    if (this.phase !== QuizPhase.ShowingQuestion) return
    this.manualRevealed = true
    this.phase = QuizPhase.ManualRevealed
  }

  IsSelfEvalType(q: Question | null): boolean {
    return q != null && (q.type === 'calc' || q.type === 'blank' || q.type === 'multi')
  }

  static IsSelfEvalStatic(q: Question | null): boolean {
    return q != null && (q.type === 'calc' || q.type === 'blank' || q.type === 'multi')
  }

  // 提交作答。
  // 客观题（single/judge）：choice 为选项索引。
  // 自评题（calc/blank/multi，v1 无机器判分）：choice 0=我独立做对，1=未做对（看答案学习）。
  // 返回判定结果，自动展开答案（→ JUDGED）
  Submit(choice: number | null, save: GameSave | null): ReviewResult {
    let correct = false
    if (this.current != null) {
      if (this.current.type === 'judge') {
        // 判断题：选项0=对 选项1=错；answer="0"/"1"
        correct =
          choice != null && this.current.answer.trim() === String(choice)
      } else if (this.current.type === 'single') {
        const trimmed = this.current.answer.trim()
        const parsed = trimmed !== '' && Number.isInteger(Number(trimmed))
          ? Number(trimmed)
          : null
        correct = choice != null && parsed !== null && choice === parsed
      } else if (this.IsSelfEvalType(this.current)) {
        // 自评模式：玩家对照折叠答案自评（v1 计算/证明/填空无机器判分）
        correct = choice != null && choice === 0
      }
    }

    // 防作弊：主动展开过的题，最终判定恒为 wrong（Correctness Property 7）
    if (this.manualRevealed) correct = false

    // 连对计数与暴击（R3.4：连对 3 题 +1 果实）
    if (correct && !this.manualRevealed) {
      this.combo++
      if (this.combo % 3 === 0 && this.OnCrit != null) this.OnCrit()
    } else {
      this.combo = 0
    }

    // 记录 reveal_log
    if (this.manualRevealed && save != null && this.current != null) {
      if (save.revealLog == null) save.revealLog = {}
      let rec = save.revealLog[this.current.id]
      if (rec === undefined) {
        rec = { count: 0, last: '' }
        save.revealLog[this.current.id] = rec
      }
      rec.count++
      rec.last = nowUtcDateStr()
    }

    // 答题日志（R10）
    if (save != null && this.current != null) this.RecordAnswerLog(save, this.current, correct)

    this.phase = QuizPhase.Judged

    const result: ReviewResult = {
      questionId: this.current?.id ?? null,
      correct: correct,
      manualReveal: this.manualRevealed,
      answerText: this.current?.answer ?? null,
      explanation: this.current?.explanation ?? null,
      answerSource: this.current?.answerSource ?? null
    }

    if (this.OnAnswerSubmitted != null) this.OnAnswerSubmitted(correct)
    return result
  }

  private RecordAnswerLog(save: GameSave, q: Question, correct: boolean): void {
    ensureV3Fields(save)
    const today = nowUtcDateStr()
    save.dailyAnswers[today] = (save.dailyAnswers[today] ?? 0) + 1

    if (this.Context === 'farm') {
      save.envAnswers++
      if (correct) save.envCorrect++
    } else {
      // 闯关：按章节统计（R10.2）
      let chapId: string | null = null
      const kp = q.kpId == null || q.kpId === undefined ? '' : q.kpId
      if (kp !== '' && this.BankRef != null) {
        chapId = this.BankRef.GetChapterOfKp(kp)
      }
      if (chapId != null) {
        let st = save.chapterStats[chapId]
        if (st === undefined) {
          st = chapterAnswerStat()
          save.chapterStats[chapId] = st
        }
        st.total++
        if (correct) st.correct++
      }
    }
  }

  SubmitChallenge(choice: number | null, save: GameSave | null): ChallengeAnswer {
    const r = this.Submit(choice, save)
    return {
      questionId: r.questionId,
      correct: r.correct,
      counted: true,
      manualReveal: r.manualReveal
    }
  }

  Next(q: Question | null, save: GameSave): void {
    this.Present(q)
  }
}
