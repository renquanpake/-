// types.ts — 共享数据契约（与 C# StudyFarm.Data 逐字段对齐，字段名保持 Unity JsonUtility 的 camelCase 风格）
// 所有 web/src/core/ 下的纯逻辑模块统一从这里取类型。

export interface Source {
  book: string
  chapter: string
  section: string
  page: string
  no: number
}

export interface Question {
  id: string
  num: number
  kpId: string
  type: string // single / multi / judge / blank / calc / proof
  stem: string
  options: string[] | null
  answer: string
  answerKey?: string // 机判键（答案首行结论；空则自评）
  explanation: string
  difficulty: number
  source: Source | null
  answerSource: Source | null
  needsReview: boolean
}

export interface KnowledgePoint {
  id: string
  name: string
  summary: string
  cropRarity: string // common / rare / epic / legendary
  source: Source | null
  linkedQuestionCount: number
}

export interface LevelReward {
  fruit: number
  seeds: number
}

export interface Level {
  id: string
  name: string
  questionIds: string[]
  passRate: number
  star3Rate: number
  star2Rate: number
  isBoss: boolean
  reward: LevelReward
}

export interface Chapter {
  id: string
  name: string
  levels: Level[]
  knowledgePoints: KnowledgePoint[]
}

export interface QuestionBankFile {
  subject: string
  subjectName: string
  version: number
  sourceBook: string
  chapters: Chapter[]
  questions: Question[]
}

export interface LevelProgress {
  stars: number
  bestRate: number
  cleared: boolean
}

export interface CropState {
  kpId: string
  growth: number // 0..5
  interval: number // 复习间隔（天）
  ease: number // SM-2 ease
  nextDue: number // unix 秒
  state: string // growing / due / withered / harvestable / mastered
}

export interface RevealRecord {
  count: number
  last: string
}

export interface StreakInfo {
  current: number
  best: number
  lastActiveDate: string // yyyy-MM-dd (UTC)
  rescueUsedThisMonth: boolean
  rescueMonth: string
  zeroedAtUnix: number // 最近一次清零时间（unix 秒，挽回药剂 48h 窗口）
  preZeroStreak: number
}

export interface ChapterAnswerStat {
  total: number
  correct: number
}

export interface GameSave {
  schemaVersion: number
  crops: CropState[]
  inventory: Record<string, number>
  fruit: number
  streak: StreakInfo
  levels: Record<string, LevelProgress>
  chapterChests: string[]
  revealLog: Record<string, RevealRecord>
  mastered: string[]
  recentDraws: Record<string, string[]>
  envAnswers: number
  envCorrect: number
  chapterStats: Record<string, ChapterAnswerStat>
  dailyAnswers: Record<string, number> // yyyy-MM-dd -> 当日答题数（全科目）
  lastLegendaryDropUnix: number
}

export function newStreakInfo(): StreakInfo {
  return {
    current: 0,
    best: 0,
    lastActiveDate: '',
    rescueUsedThisMonth: false,
    rescueMonth: '',
    zeroedAtUnix: 0,
    preZeroStreak: 0
  }
}

export function newGameSave(): GameSave {
  return {
    schemaVersion: 3,
    crops: [],
    inventory: {},
    fruit: 0,
    streak: newStreakInfo(),
    levels: {},
    chapterChests: [],
    revealLog: {},
    mastered: [],
    recentDraws: {},
    envAnswers: 0,
    envCorrect: 0,
    chapterStats: {},
    dailyAnswers: {},
    lastLegendaryDropUnix: 0
  }
}

export function ensureInvKey(save: GameSave): void {
  if (!('fruit' in save.inventory)) save.inventory['fruit'] = 0
  if (!('seed_common' in save.inventory)) save.inventory['seed_common'] = 5
  if (!('fertilizer' in save.inventory)) save.inventory['fertilizer'] = 2
  if (!('potion' in save.inventory)) save.inventory['potion'] = 0
}

export function ensureV3Fields(save: GameSave): void {
  if (save.streak == null) save.streak = newStreakInfo()
  if (save.chapterStats == null) save.chapterStats = {}
  if (save.dailyAnswers == null) save.dailyAnswers = {}
  if (save.levels == null) save.levels = {}
  if (save.revealLog == null) save.revealLog = {}
  if (save.recentDraws == null) save.recentDraws = {}
  if (save.crops == null) save.crops = []
  if (save.mastered == null) save.mastered = []
  if (save.chapterChests == null) save.chapterChests = []
  ensureInvKey(save)
}

export function utcDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}
