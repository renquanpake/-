// app.ts — 全局状态与子系统接线（Web 版 GameManager，去掉 Unity 单例/场景切换）
import { SaveSystem, LocalStorageStorage } from './core/SaveSystem'
import { QuestionBank } from './core/QuestionBank'
import { Scheduler } from './core/Scheduler'
import { EconomyController } from './core/EconomyController'
import { FarmController } from './core/FarmController'
import { QuizController } from './core/QuizController'
import { ChallengeSessionController, QuestionBankStatic } from './core/ChallengeSessionController'
import { StreakController } from './core/StreakController'
import { StatsController } from './core/StatsController'
import type { GameSave, QuestionBankFile } from './core/types'

export class App {
  save: GameSave
  bank: QuestionBank
  sched: Scheduler
  econ: EconomyController
  farm: FarmController
  quiz: QuizController
  session: ChallengeSessionController
  streak: StreakController
  stats: StatsController
  saveSys: SaveSystem

  constructor(banks: QuestionBankFile[]) {
    this.saveSys = new SaveSystem(new LocalStorageStorage())
    this.save = this.saveSys.Load()

    this.bank = new QuestionBank(banks)
    this.sched = new Scheduler()
    this.econ = new EconomyController()
    this.farm = new FarmController()
    this.quiz = new QuizController()
    this.session = new ChallengeSessionController(this.quiz, this.econ)
    this.streak = new StreakController()
    this.stats = new StatsController()

    // 题库校验（R1.4 source 缺失清单）
    this.bank.LogSourceValidation()
    if (this.bank.LoadErrors.length > 0) {
      console.warn('题库加载警告:\n' + this.bank.LoadErrors.join('\n'))
    }

    // 把题库单例绑定给闯关会话静态桥（对齐 C# GameManager.BindBank）
    QuestionBankStatic.Bind(this.bank)
    this.session.BindBank(this.bank)

    // 暴击 / 签到接线（对齐 GameManager）
    this.quiz.BankRef = this.bank
    this.quiz.OnCrit = () => {
      this.econ.GrantCrit(this.save)
      this.persist()
    }
    this.quiz.OnAnswerSubmitted = () => {
      this.streak.OnActive(this.save) // R7.1 浇水与闯关均计入活跃
      this.persist()
    }

    this.sched.Init(this.save)
    this.sched.MarkWithered(this.save) // R4.3 启动置蔫萎态
    this.econ.Init(this.save)
    this.farm.Init(this.save)
    this.quiz.Init()
  }

  persist(): void {
    this.saveSys.Save(this.save)
  }
}
