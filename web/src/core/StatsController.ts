import type { GameSave } from './types'
import type { QuestionBank } from './QuestionBank'
import { utcDateStr } from './types'

export interface SubjectStat {
  answered: number
  correct: number
  correctRate: number
  masteredKp: number
  withered: number
}

export interface ChallengeStat {
  clearedLevels: number
  totalStars: number
  chapterRates: Record<string, number>
}

export interface DailyCount {
  date: string
  count: number
}

export interface SubjectOverview {
  subject: string
  subjectName: string
  questionCount: number
  chapterCount: number
}

export class StatsController {
  GetEnvStat(save: GameSave): SubjectStat {
    let withered = 0
    for (const c of save.crops) {
      if (c.state === 'withered') withered++
    }
    const total = save.envAnswers
    return {
      answered: total,
      correct: save.envCorrect,
      correctRate: total > 0 ? save.envCorrect / total : 0,
      masteredKp: save.mastered.length,
      withered
    }
  }

  GetChallengeStat(save: GameSave): ChallengeStat {
    let cleared = 0
    let stars = 0
    for (const kv of Object.entries(save.levels ?? {})) {
      const value = kv[1]
      if (value.cleared) {
        cleared++
        stars += value.stars
      }
    }
    const rates: Record<string, number> = {}
    for (const kv of Object.entries(save.chapterStats ?? {})) {
      const key = kv[0]
      const value = kv[1]
      rates[key] = value.total > 0 ? value.correct / value.total : 0
    }
    return {
      clearedLevels: cleared,
      totalStars: stars,
      chapterRates: rates
    }
  }

  Last7Days(save: GameSave): DailyCount[] {
    const daily = save.dailyAnswers ?? {}
    const list: DailyCount[] = []
    const now = Math.floor(Date.now() / 1000)
    for (let i = 6; i >= 0; i--) {
      const d = utcDateStr(now - i * 86400)
      list.push({ date: d, count: daily[d] ?? 0 })
    }
    return list
  }

  GetBankOverview(bank: QuestionBank): SubjectOverview[] {
    const list: SubjectOverview[] = []
    for (const s of bank.Subjects ?? []) {
      const chCount = (s.chapters ?? []).length
      const qCount = (s.questions ?? []).length
      list.push({
        subject: s.subject,
        subjectName: s.subjectName,
        questionCount: qCount,
        chapterCount: chCount
      })
    }
    return list
  }
}
