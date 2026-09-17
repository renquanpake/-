// Challenge.ts — 数学闯关场景：选章 → 关卡地图 → 逐题答题 → 星级结算
import Phaser from 'phaser'
import { App } from '../app'
import { LevelMapController, LevelNodeModel } from '../core/LevelMapController'
import type { Level } from '../core/types'
import type { LevelResult } from '../core/ChallengeSessionController'
import { breakMath, makeStem } from '../textutil'

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
    // 场景重入时清掉上一轮显示对象，防止残留与重复
    (this.children as unknown as { removeAll(deep?: boolean): void }).removeAll(true)
    this.viewRoot = null
    this.curLevel = null
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
    const nodes = this.mapCtl.RenderChapter(chapterId, chapterName)
    this.title(c, `${chapterName}（${nodes.length} 关）`, '章节', () => this.showChapters())
    nodes.forEach((node, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const cx = W / 2 - 110 + col * 220
      const cy = 160 + row * 140
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
      .text(cx, cy + 52, (node.level.name || `第${index}关`).slice(0, 14), {
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

    // 卡片面板（先加矩形再放文字，避免盖住内容；短内容垂直居中）
    const isSelfEval = this.app.quiz.IsSelfEvalType(q)
    const actionH = isSelfEval ? 100 : q.options != null ? Math.min(q.options.length, 4) * 50 + 10 : 52
    const stem0 = makeStem(this, q.stem ? breakMath(q.stem) : '（无题干）', {
      x: W / 2,
      y: 0,
      width: 396,
      maxH: 320
    })
    const panelH = Math.min(36 + stem0.height + 18 + 44 + actionH + 80, H - 76)
    const top = Math.max(64, Math.round((H - panelH) / 2))
    stem0.destroy()
    const panel = this.add.rectangle(W / 2, top + panelH / 2, 434, panelH, 0x1c2a16, 0.97)
    c.add(panel)
    c.add(
      this.add
        .text(W / 2, top + 8, `第 ${this.answered + 1} / ${this.total()} 题`, {
          fontSize: '13px',
          color: '#9fd67f'
        })
        .setOrigin(0.5, 0)
    )

    const stemTop = top + 36
    const stem = makeStem(this, q.stem ? breakMath(q.stem) : '（无题干）', {
      x: W / 2,
      y: stemTop,
      width: 396,
      maxH: 320
    })
    c.add(stem)

    let revealed = false
    const afterSubmit = (choice: number | null) => {
      const session = this.app.session
      const r = session.Submit(choice, this.app.save)
      this.app.persist()
      this.answered++
      this.showPlayResult(r.correct, r.manualReveal, this.answered >= this.total())
    }

    const actionTop = stemTop + stem.height + 18
    const optTop = actionTop + 44

    // 偷看答案（内联展开，不再盖题干）
    const peek = this.add
      .text(W / 2, actionTop, '👁 偷看答案（将判负）', {
        fontSize: '12px',
        color: '#ffb86b',
        backgroundColor: '#3a2f16',
        padding: { x: 10, y: 4 }
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
    c.add(peek)

    // 选项 / 自评按钮（偷看后收起，换"提交"）
    const actionBtns: Phaser.GameObjects.Text[] = []
    if (isSelfEval) {
      const yes = this.add
        .text(W / 2, optTop, '我独立做对了 ✓', {
          fontSize: '15px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(0))
      const no = this.add
        .text(W / 2, optTop + 50, '没做对，看答案', {
          fontSize: '15px',
          color: '#ff9f9f',
          backgroundColor: '#3b2424',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(1))
      actionBtns.push(yes, no)
      c.add([yes, no])
    } else if (q.options != null && q.options.length > 0) {
      q.options.slice(0, 4).forEach((opt, idx) => {
        const b = this.add
          .text(24, optTop + idx * 50, `${String.fromCharCode(65 + idx)}. ${breakMath(opt)}`, {
            fontSize: '14px',
            color: '#eaf5dc',
            backgroundColor: '#243b22',
            padding: { x: 10, y: 6 },
            wordWrap: { width: 384, useAdvancedWrap: true }
          })
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => afterSubmit(idx))
        actionBtns.push(b)
        c.add(b)
      })
    } else {
      const b = this.add
        .text(W / 2, optTop, '我独立做对了 ✓', {
          fontSize: '15px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(0))
      actionBtns.push(b)
      c.add(b)
    }

    peek.on('pointerdown', () => {
      if (revealed) return
      revealed = true
      this.app.quiz.RevealAnswer()
      for (const b of actionBtns) b.setVisible(false)
      const ans = makeStem(
        this,
        breakMath(`答案：${q.answer || '（无）'}${q.explanation ? '\n解析：' + q.explanation : ''}`),
        { x: W / 2, y: optTop, width: 384, maxH: 160, fontSize: 13, minFont: 12, color: '#bfe39a' }
      )
      c.add(ans)
      const go = this.add
        .text(W / 2, optTop + ans.height + 20, '提交（已判负）', {
          fontSize: '15px',
          color: '#eaf5dc',
          backgroundColor: '#2a4023',
          padding: { x: 14, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => afterSubmit(null))
      c.add(go)
      peek.setVisible(false)
    })
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
