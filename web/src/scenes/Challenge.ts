// Challenge.ts — 数学闯关场景：选章 → 关卡地图 → 逐题答题 → 星级结算
import Phaser from 'phaser'
import { App } from '../app'
import { LevelMapController, LevelNodeModel } from '../core/LevelMapController'
import type { Level } from '../core/types'
import type { LevelResult } from '../core/ChallengeSessionController'

const W = 480
const H = 920

type View = 'chapters' | 'map' | 'play' | 'result'

export class Challenge extends Phaser.Scene {
  private app!: App
  private mapCtl = new LevelMapController()
  private view: View = 'chapters'
  private chapterId = ''
  private chapterName = ''
  private curLevel: Level | null = null
  private answered = 0
  private viewRoot: Phaser.GameObjects.Container | null = null

  constructor() {
    super('Challenge')
  }

  init() {
    this.app = this.registry.get('app') as App
  }

  create() {
    const save = this.app.save
    this.mapCtl.Init(this.app.bank, save)
    this.mapCtl.session = this.app.session
    this.mapCtl.onEnterLevel = lv => this.beginPlay(lv)
    this.add.image(W / 2, H / 2, 'tiles/grass').setDisplaySize(W, H).setDepth(0)
    this.showChapters()
  }

  private root(): Phaser.GameObjects.Container {
    if (this.viewRoot != null) {
      this.viewRoot.destroy(true)
      this.viewRoot = null
    }
    const c = this.add.container(0, 0).setDepth(10)
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10160d, 0.72))
    this.viewRoot = c
    return c
  }

  private title(c: Phaser.GameObjects.Container, text: string, backLabel: string, onBack: () => void): void {
    c.add(this.add.text(W / 2, 30, text, { fontFamily: 'sans-serif', fontSize: '18px', color: '#eaf5dc' }).setOrigin(0.5, 0))
    const back = this.add
      .text(12, 20, '←  ' + backLabel, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ff9f9f',
        backgroundColor: '#241a1a',
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onBack)
    c.add(back)
  }

  // ---------- 选章 ----------
  private showChapters(): void {
    this.view = 'chapters'
    const c = this.root()
    this.title(c, '数学闯关 · 选章节', '农场', () => this.scene.start('Farm'))
    const chapters = this.app.bank.Subjects.flatMap(s => s.chapters ?? [])
    const withLevels = chapters.filter(ch => this.app.bank.GetLevels(ch.id).length > 0)
    if (withLevels.length === 0) {
      c.add(this.add.text(W / 2, H / 2, '（题库暂无闯关关卡）', { fontSize: '15px', color: '#9fb48f' }).setOrigin(0.5))
      return
    }
    withLevels.forEach((ch, i) => {
      const levels = this.app.bank.GetLevels(ch.id)
      const stars = levels.reduce((n, lv) => n + (this.app.save.levels[lv.id]?.stars ?? 0), 0)
      const by = 90 + i * 74
      const card = this.add.rectangle(W / 2, by + 32, 420, 64, 0x22361d, 1)
      const name = this.add.text(W / 2 - 195, by + 8, ch.name, { fontSize: '16px', color: '#eaf5dc' })
      const sub = this.add.text(W / 2 - 195, by + 36, `${levels.length} 关 · 已得 ${stars} 星`, { fontSize: '12px', color: '#9fd67f' })
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.showMap(ch.id, ch.name))
      c.add([card, name, sub])
    })
  }

  // ---------- 关卡地图 ----------
  private showMap(chapterId: string, chapterName: string): void {
    this.view = 'map'
    this.chapterId = chapterId
    this.chapterName = chapterName
    const c = this.root()
    this.title(c, `闯关 · ${chapterName}`, '章节', () => this.showChapters())
    const nodes = this.mapCtl.RenderChapter(chapterId, chapterName)
    c.add(this.add.text(W / 2, 70, `章节 ${chapterName}（${nodes.length} 关）`, { fontSize: '14px', color: '#9fb48f' }).setOrigin(0.5, 0))
    nodes.forEach((node, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const cx = W / 2 - 110 + col * 220
      const cy = 130 + row * 92
      this.drawNode(c, cx, cy, i + 1, node, () => this.tryEnter(node))
    })
  }

  private drawNode(
    c: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    index: number,
    node: LevelNodeModel,
    onTap: () => void
  ): void {
    const isBoss = node.level.isBoss
    const nodeImg = this.add.image(cx, cy, isBoss ? 'challenge/lvl_node_boss' : 'challenge/lvl_node_plain').setDisplaySize(84, 84).setDepth(11)
    const label = this.add
      .text(cx, cy + 52, `第${index}关 ${node.level.name}`.slice(0, 14), {
        fontSize: '11px',
        color: node.locked ? '#6b7a5f' : '#dfe9d0',
        align: 'center',
        wordWrap: { width: 110, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
      .setDepth(11)
    const star = this.add.text(cx, cy - 52, node.starText, { fontSize: '13px', color: '#ffd75e' }).setOrigin(0.5).setDepth(11)
    const lock = node.locked
      ? this.add.image(cx + 30, cy - 30, 'ui/lock').setDisplaySize(26, 26).setDepth(12)
      : null
    nodeImg.setInteractive({ useHandCursor: true }).on('pointerdown', onTap)
    c.add([nodeImg, label, star])
    if (lock != null) c.add(lock)
  }

  private tryEnter(node: LevelNodeModel): void {
    if (node.locked) {
      this.app.persist()
      this.flash('Boss 关需本章普通关全部 3 星才解锁')
      return
    }
    const ok = this.mapCtl.EnterLevel(node.level)
    if (!ok) this.flash('无法进入该关')
  }

  private flash(msg: string): void {
    const t = this.add
      .text(W / 2, H - 90, msg, {
        fontSize: '13px',
        color: '#ffd75e',
        backgroundColor: '#3a2f16',
        padding: { x: 10, y: 6 },
        wordWrap: { width: 420, useAdvancedWrap: true }
      })
      .setOrigin(0.5)
      .setDepth(50)
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 400, onComplete: () => t.destroy() })
  }

  // ---------- 答题 ----------
  private beginPlay(lv: Level): void {
    this.view = 'play'
    this.curLevel = lv
    this.answered = 0
    this.showQuestion()
  }

  private total(): number {
    return this.curLevel != null ? this.curLevel.questionIds.length : 0
  }

  private showQuestion(): void {
    const session = this.app.session
    const q = session.CurrentQuestion
    if (q == null || this.curLevel == null) {
      this.showResult()
      return
    }
    const c = this.root()
    this.title(c, `闯关 ${this.curLevel.name}`, '放弃', () => this.abort())
    c.add(
      this.add.text(W / 2, 60, `第 ${this.answered + 1} / ${this.total()} 题`, {
        fontSize: '13px',
        color: '#9fd67f'
      }).setOrigin(0.5, 0)
    )
    const stem = this.add
      .text(W / 2, 96, q.stem || '（无题干）', {
        fontSize: '13px',
        color: '#e8f0e0',
        align: 'left',
        wordWrap: { width: 400, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
    c.add(stem)

    let revealed = false
    const afterSubmit = (choice: number | null) => {
      const session = this.app.session
      const r = session.Submit(choice, this.app.save)
      this.app.persist()
      this.answered++
      this.showPlayResult(r.correct, r.manualReveal, this.answered >= this.total())
    }

    // 偷看答案（折叠展开，判负）
    const peek = this.add
      .text(
        W / 2,
        96 + stem.height + 16,
        '👁 偷看答案（将判负）',
        {
          fontSize: '12px',
          color: '#ffb86b',
          backgroundColor: '#3a2f16',
          padding: { x: 10, y: 4 }
        }
      )
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (revealed) return
        revealed = true
        this.app.quiz.RevealAnswer()
        const box = this.add.container(0, 0).setDepth(40)
        box.add(this.add.rectangle(W / 2, 260, 430, 130, 0x1c2a16, 1))
        const ans = this.add
          .text(W / 2 - 205, 220, `答案：${q.answer || '（无）'}${q.explanation ? '\n' + q.explanation : ''}`, {
            fontSize: '13px',
            color: '#bfe39a',
            wordWrap: { width: 400, useAdvancedWrap: true }
          })
          .setOrigin(0, 0)
        box.add(ans)
        peek.setVisible(false)
      })
    c.add(peek)

    let optTop = 96 + stem.height + 60
    if (this.app.quiz.IsSelfEvalType(q)) {
      const yes = this.add
        .text(W / 2, optTop, '我独立做对了 ✓', {
          fontSize: '14px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(0))
      const no = this.add
        .text(W / 2, optTop + 46, '没做对，看答案', {
          fontSize: '14px',
          color: '#ff9f9f',
          backgroundColor: '#3b2424',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(1))
      c.add([yes, no])
    } else if (q.options != null && q.options.length > 0) {
      q.options.forEach((opt, idx) => {
        const b = this.add
          .text(40, optTop + idx * 44, `${String.fromCharCode(65 + idx)}. ${opt}`, {
            fontSize: '13px',
            color: '#eaf5dc',
            backgroundColor: '#243b22',
            padding: { x: 10, y: 6 },
            wordWrap: { width: 380, useAdvancedWrap: true }
          })
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => afterSubmit(idx))
        c.add(b)
      })
    } else {
      const b = this.add
        .text(W / 2, optTop, '我独立做对了 ✓', {
          fontSize: '14px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(0))
      c.add(b)
    }
  }

  private showPlayResult(correct: boolean, manualReveal: boolean, isLast: boolean): void {
    const c = this.root()
    this.title(c, `闯关 ${this.curLevel?.name ?? ''}`, '放弃', () => this.abort())
    const burst = this.add.image(W / 2, 300, correct ? 'quiz/burst_correct' : 'quiz/burst_wrong').setDisplaySize(80, 80).setDepth(11)
    const msg = correct ? '答对了！' : manualReveal ? '查看了答案，本题计负。' : '答错了。'
    const msgText = this.add.text(W / 2, 380, msg, { fontSize: '16px', color: '#ffd75e' }).setOrigin(0.5)
    c.add([burst, msgText])
    const btnLabel = isLast ? '查看结算' : '下一题'
    const btn = this.add
      .text(W / 2, 460, btnLabel, {
        fontSize: '15px',
        color: '#eaf5dc',
        backgroundColor: '#2a4023',
        padding: { x: 18, y: 8 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (isLast) this.showResult()
        else this.showQuestion()
      })
    c.add(btn)
  }

  private abort(): void {
    this.app.session.Abort()
    this.curLevel = null
    this.showMap(this.chapterId, this.chapterName)
  }

  // ---------- 结算 ----------
  private showResult(): void {
    this.view = 'result'
    const save = this.app.save
    const r: LevelResult = this.app.session.Finish(save)
    this.app.persist()
    const c = this.root()
    this.title(c, '关卡结算', '地图', () => this.showMap(this.chapterId, this.chapterName))

    const medal = r.stars >= 3 ? 'challenge/medal_gold' : r.stars === 2 ? 'challenge/medal_silver' : r.stars === 1 ? 'challenge/medal_bronze' : null
    if (medal != null) c.add(this.add.image(W / 2, 220, medal).setDisplaySize(90, 90))
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)
    c.add(this.add.text(W / 2, 300, stars, { fontSize: '26px', color: '#ffd75e' }).setOrigin(0.5))
    const lines = [
      `答对 ${r.correct} / ${r.total}（${Math.round(r.rate * 100)}%）`
    ]
    if (r.cleared) lines.push('已通关，奖励已发放')
    else lines.push(`未达通关线（${Math.round(this.passPct())}%），再试一次`)
    const lv = this.curLevel
    if (lv != null && lv.isBoss && r.cleared) {
      const chapAll3 = this.allChapterThreeStars()
      if (chapAll3) lines.push('本章全 3 星，宝箱已开启！')
    }
    const body = this.add
      .text(W / 2, 350, lines.join('\n'), {
        fontSize: '15px',
        color: '#e8f0e0',
        align: 'center',
        lineSpacing: 8
      })
      .setOrigin(0.5)
    c.add(body)
    const btn = this.add
      .text(W / 2, 480, '返回地图', {
        fontSize: '15px',
        color: '#eaf5dc',
        backgroundColor: '#2a4023',
        padding: { x: 18, y: 8 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showMap(this.chapterId, this.chapterName))
    c.add(btn)
    void save
  }

  private passPct(): number {
    return this.curLevel != null ? Math.round(this.curLevel.passRate * 100) : 50
  }

  private allChapterThreeStars(): boolean {
    if (this.chapterId === '') return false
    const levels = this.app.bank.GetLevels(this.chapterId)
    if (levels.length === 0) return false
    for (const lv of levels) {
      const p = this.app.save.levels[lv.id]
      if (p === undefined || p.stars < 3) return false
    }
    return true
  }
}
