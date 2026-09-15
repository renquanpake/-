import { describe, it, expect } from 'vitest'
import { QuizController } from '../src/core/QuizController'
import { QuestionBank } from '../src/core/QuestionBank'
import { newGameSave, utcDateStr, type Question } from '../src/core/types'

function judgeQuestion(over: Partial<Question>): Question {
  return {
    id: '',
    num: 0,
    kpId: '',
    type: 'judge',
    stem: '',
    options: null,
    answer: '',
    explanation: '',
    difficulty: 0,
    source: null,
    answerSource: null,
    needsReview: false,
    ...over
  }
}

describe('QuizControllerTests', () => {
  it('ManualReveal_ForcesWrong', () => {
    const q = new QuizController()
    const save = newGameSave()
    const question = judgeQuestion({ id: 'q1', type: 'judge', stem: 'test', answer: '0' })
    q.Present(question)
    q.RevealAnswer() // 主动展开
    const r = q.Submit(0, save) // 即使选对了
    expect(r.correct).toBe(false)
    expect(r.manualReveal).toBe(true)
  })

  it('JudgeQuestion_CorrectChoice', () => {
    const q = new QuizController()
    const save = newGameSave()
    q.Present(judgeQuestion({ id: 'q1', type: 'judge', answer: '1' }))
    const r = q.Submit(1, save)
    expect(r.correct).toBe(true)
  })
})

describe('QuizControllerExtTests', () => {
  it('SelfEvalCalc_Choice0CountsCorrect', () => {
    const quiz = new QuizController()
    const s = newGameSave()
    quiz.Present(
      judgeQuestion({ id: 'c1', type: 'calc', stem: '求 2+2', answer: '4' })
    )
    const r = quiz.Submit(0, s)
    expect(r.correct).toBe(true)
    const r2 = quiz.Submit(1, s)
    expect(r2.correct).toBe(false)
  })

  it('Combo3TriggersCrit', () => {
    const quiz = new QuizController()
    let crits = 0
    quiz.OnCrit = () => {
      crits++
    }
    const s = newGameSave()
    for (let i = 0; i < 3; i++) {
      quiz.Submit(0, s) // 尚未 Present 任何题
    }
    // 重新走 3 连对（single）
    quiz.Init()
    for (let i = 0; i < 3; i++) {
      quiz.Present(
        judgeQuestion({ id: 'q' + i, type: 'single', answer: '0' })
      )
      quiz.Submit(0, s)
    }
    expect(crits).toBe(1)
  })

  it('FarmContext_LogsEnvAnswers', () => {
    const quiz = new QuizController()
    quiz.Context = 'farm'
    const s = newGameSave()
    quiz.Present(
      judgeQuestion({
        id: 'e1',
        type: 'judge',
        answer: '1',
        kpId: 'env.ch01.kp01'
      })
    )
    quiz.Submit(1, s)
    expect(s.envAnswers).toBe(1)
    expect(s.envCorrect).toBe(1)
    const today = utcDateStr(Math.floor(Date.now() / 1000))
    expect(s.dailyAnswers[today]).toBe(1)
  })

  it('ChallengeContext_LogsChapterStats', () => {
    const bank = new QuestionBank([])
    const quiz = new QuizController()
    quiz.Context = 'challenge'
    quiz.BankRef = bank
    // 直接给 bank 塞 kp→chapter 映射（不读文件）
    bank.KpToChapter['math.ch08.kp01'] = 'math.ch08'
    const s = newGameSave()
    quiz.Present(
      judgeQuestion({ id: 'm1', type: 'single', answer: '0', kpId: 'math.ch08.kp01' })
    )
    quiz.Submit(0, s)
    quiz.Present(
      judgeQuestion({ id: 'm2', type: 'single', answer: '9', kpId: 'math.ch08.kp01' })
    )
    quiz.Submit(0, s)
    const st = s.chapterStats['math.ch08']
    expect(st.total).toBe(2)
    expect(st.correct).toBe(1)
  })

  it('ManualReveal_SelfEvalStillForcedWrong', () => {
    const quiz = new QuizController()
    const s = newGameSave()
    quiz.Present(judgeQuestion({ id: 'c1', type: 'calc', answer: '4' }))
    quiz.RevealAnswer()
    const r = quiz.Submit(0, s) // 自评做对也强制负
    expect(r.correct).toBe(false)
    expect(r.manualReveal).toBe(true)
  })
})
