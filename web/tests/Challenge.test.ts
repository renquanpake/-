import { describe, it, expect } from 'vitest'
import {
  ChallengeSessionController,
  QuestionBankStatic
} from '../src/core/ChallengeSessionController'
import { QuizController } from '../src/core/QuizController'
import { EconomyController } from '../src/core/EconomyController'
import { QuestionBank } from '../src/core/QuestionBank'
import {
  newGameSave,
  type Level,
  type LevelReward,
  type Question
} from '../src/core/types'

describe('ChallengeSessionTests', () => {
  it('StarUpgrade_PaysDiff', () => {
    const quiz = new QuizController()
    const econ = new EconomyController()
    const session = new ChallengeSessionController(quiz, econ)
    QuestionBankStatic.Bind(null)

    const s = newGameSave()

    const lv: Level = {
      id: 'math.ch08.lv01',
      name: '第1关',
      questionIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
      passRate: 0.5,
      star3Rate: 0.9,
      star2Rate: 0.7,
      isBoss: false,
      reward: { fruit: 30, seeds: 2 } as LevelReward
    }

    // 模拟已有 3 星
    s.levels[lv.id] = { stars: 3, bestRate: 0, cleared: true }

    const lv2: Level = {
      id: 'math.ch08.lv02',
      name: '第2关',
      questionIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
      passRate: 0.5,
      star3Rate: 0.9,
      star2Rate: 0.7,
      isBoss: false,
      reward: { fruit: 30, seeds: 2 } as LevelReward
    }
    s.levels[lv2.id] = { stars: 1, bestRate: 0, cleared: true }
    const fruitBefore = s.fruit

    // 直接走 Finish 前准备：先 Start 关卡（bank 尚未绑定，q1 未入 bank → 全判错）
    session.Start(lv2, s)
    for (let i = 0; i < 8; i++) {
      session.Submit(0, s)
    }

    // 改为 mock bank
    const bank = new QuestionBank([])
    for (let i = 1; i <= 10; i++) {
      const q: Question = {
        id: 'q' + i,
        num: 0,
        kpId: 'math.ch08.kp01',
        type: 'single',
        stem: '',
        options: null,
        answer: '0',
        explanation: '',
        difficulty: 0,
        source: null,
        answerSource: null,
        needsReview: false
      }
      bank.Questions['q' + i] = q
    }
    bank.KpToChapter['math.ch08.kp01'] = 'math.ch08'
    QuestionBankStatic.Bind(bank)
    quiz.BankRef = bank
    session.Start(lv2, s)
    for (let i = 0; i < 8; i++) session.Submit(0, s)
    for (let i = 0; i < 2; i++) session.Submit(1, s) // 答错
    const res = session.Finish(s)
    expect(res.stars).toBe(2)
    expect(Math.abs(res.rate - 0.8)).toBeLessThan(0.001)
    expect(s.levels[lv2.id].cleared).toBe(true)
    expect(s.levels[lv2.id].stars).toBe(2)
    // 补差奖励 = (2-1)*20 = 20
    expect(s.fruit).toBe(fruitBefore + 20)
  })
})
