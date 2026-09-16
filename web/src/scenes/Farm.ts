// Farm.ts — 农场主循环场景：播种 / 浇水答题 / 收获 / 蔫萎化肥
import Phaser from 'phaser'
import { App } from '../app'
import type { CropState, Question, KnowledgePoint } from '../core/types'
import { Scheduler } from '../core/Scheduler'

const W = 480
const H = 920
const PLOT = 130
const GAP = 18
const COLS = 3
const ORIGIN_X = (W - (COLS * PLOT + (COLS - 1) * GAP)) / 2
const ORIGIN_Y = 170

interface PlotObj {
  soil: Phaser.GameObjects.Image
  crop: Phaser.GameObjects.Image | null
  label: Phaser.GameObjects.Text
  marker: Phaser.GameObjects.Image | null
  zone: Phaser.GameObjects.Zone
}

export class Farm extends Phaser.Scene {
  static readonly FieldSlots = 6

  private app!: App
  private plots: PlotObj[] = []
  private fruit!: Phaser.GameObjects.Text
  private seed!: Phaser.GameObjects.Text
  private fert!: Phaser.GameObjects.Text
  private streak!: Phaser.GameObjects.Text
  private msg!: Phaser.GameObjects.Text
  private dueBadge!: Phaser.GameObjects.Text
  private picker: Phaser.GameObjects.Container | null = null
  private quiz: Phaser.GameObjects.Container | null = null

  constructor() {
    super('Farm')
  }

  init() {
    this.app = this.registry.get('app') as App
  }

  create() {
    this.add.image(W / 2, H / 2, 'tiles/grass').setDisplaySize(W, H).setDepth(0)

    // 地块
    for (let i = 0; i < Farm.FieldSlots; i++) {
      const { x, y } = this.plotPos(i)
      const cx = x + PLOT / 2
      const cy = y + PLOT / 2
      const soil = this.add.image(cx, cy + 12, 'tiles/soil_dry').setDisplaySize(PLOT - 8, PLOT - 8).setDepth(1)
      const label = this.add.text(cx, y + PLOT - 20, '', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#f2f8e8',
        align: 'center',
        wordWrap: { width: PLOT - 16, useAdvancedWrap: true }
      })
        .setOrigin(0.5)
        .setDepth(3)
      const zone = this.add.zone(cx, cy, PLOT, PLOT).setDepth(5).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => this.onPlot(i))
      this.plots.push({ soil, crop: null, label, marker: null, zone })
    }

    // HUD
    this.add.rectangle(0, 29, W, 58, 0x0c130a, 0.6).setOrigin(0, 0).setDepth(9)
    this.add.text(12, 8, '', { fontSize: '13px', color: '#e8f0e0' }).setDepth(10)
    this.fruit = this.add.text(12, 40, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd75e' }).setDepth(10)
    this.seed = this.add.text(120, 40, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#bfe39a' }).setDepth(10)
    this.fert = this.add.text(230, 40, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#8fd3ff' }).setDepth(10)
    this.streak = this.add.text(340, 40, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ff9f5e' }).setDepth(10)
    this.dueBadge = this.add.text(W - 12, 40, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#7fffd4',
      align: 'right'
    }).setOrigin(1, 0).setDepth(10)

    this.msg = this.add.text(W / 2, H - 120, '点绿色空地块播种，点作物浇水答题', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#dfe9d0',
      align: 'center',
      wordWrap: { width: 440, useAdvancedWrap: true }
    }).setOrigin(0.5, 1).setDepth(10)

    // 化肥按钮
    this.add.text(12, H - 96, '🧪 化肥', { fontFamily: 'sans-serif', fontSize: '13px', color: '#8fd3ff' }).setDepth(10)
    const fertBtn = this.add.text(74, H - 96, '恢复最蔫的一块', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#dfe9d0',
      backgroundColor: '#243b22',
      padding: { x: 8, y: 4 }
    }).setDepth(10).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.useFertilizer())

    // 导航
    const nav = (x: number, label: string, scene: string) =>
      this.add
        .text(x, H - 64, label, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#eaf5dc',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setDepth(10)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.app.persist()
          this.scene.start(scene)
        })
    nav(12, '🗺 闯关', 'Challenge')
    nav(110, '📊 统计', 'Stats')

    this.refresh()
    void fertBtn
  }

  private plotPos(i: number): { x: number; y: number } {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      x: ORIGIN_X + col * (PLOT + GAP),
      y: ORIGIN_Y + row * (PLOT + GAP)
    }
  }

  private cropKey(crop: CropState): string {
    const meta = this.app.bank.GetMeta(crop.kpId)
    const rar = meta?.cropRarity ?? 'common'
    if (rar === 'legendary') return 'crops/math_legendary_medal_plant'
    if (rar === 'epic' || rar === 'rare') return 'crops/math_epic_pi_tree'
    // ponytail: 全部 common 作物共用一张树纹理，需要区分再加每 kp 作物
    const stage = crop.growth < 2 ? 1 : crop.growth < 4 ? 2 : 3
    return `crops/env_oxygen_tree_s${stage}`
  }

  private isWithered(c: CropState): boolean {
    return this.app.sched.IsWithered(c) && c.state === 'growing'
  }

  private onPlot(i: number) {
    const save = this.app.save
    const crop = save.crops[i]
    if (crop == null) {
      this.openPicker()
      return
    }
    if (crop.growth >= Scheduler.HarvestGrowth && crop.state !== 'mastered') {
      this.harvest(i)
      return
    }
    if (this.isWithered(crop)) {
      if (this.useFertilizerAt(i)) return
      this.setMsg('化肥不足，无法恢复这块蔫萎的作物')
      return
    }
    this.openQuiz(crop.kpId)
  }

  private harvest(i: number) {
    const save = this.app.save
    const crop = save.crops[i]
    if (crop == null) return
    const meta = this.app.bank.GetMeta(crop.kpId)
    const rarity = meta?.cropRarity ?? 'common'
    const r = this.app.farm.Harvest(save, crop.kpId, rarity, this.app.econ)
    if (r.ok) {
      this.app.persist()
      this.setMsg(`收获！+${r.fruit} 果实（${rarity}）`)
      this.refresh()
    }
  }

  private useFertilizer(): boolean {
    // 找最该救的：优先已蔫萎
    const save = this.app.save
    let target = -1
    for (let i = 0; i < save.crops.length; i++) {
      if (this.isWithered(save.crops[i])) {
        target = i
        break
      }
    }
    if (target === -1) {
      this.setMsg('没有蔫萎的作物，不用化肥')
      return false
    }
    return this.useFertilizerAt(target)
  }

  private useFertilizerAt(i: number): boolean {
    const save = this.app.save
    const crop = save.crops[i]
    if (crop == null) return false
    if (this.app.farm.UseFertilizer(save, crop.kpId, this.app.sched)) {
      this.app.persist()
      this.setMsg('已用化肥，作物恢复生长')
      this.refresh()
      return true
    }
    this.setMsg('化肥不足（去商店购买）')
    return false
  }

  private setMsg(t: string): void {
    this.msg.setText(t)
  }

  private refresh(): void {
    const save = this.app.save
    for (let i = 0; i < Farm.FieldSlots; i++) {
      const p = this.plots[i]
      const crop = save.crops[i]
      // 旧作物图
      if (p.crop != null) {
        p.crop.destroy()
        p.crop = null
      }
      if (p.marker != null) {
        p.marker.destroy()
        p.marker = null
      }
      if (crop == null) {
        p.soil.setTexture('tiles/soil_dry')
        p.label.setText('空地块')
        continue
      }
      p.soil.setTexture('tiles/soil_watered')
      const meta = this.app.bank.GetMeta(crop.kpId)
      p.label.setText((meta?.name ?? crop.kpId).slice(0, 12))
      const key = this.cropKey(crop)
      const src = this.textures.get(key).getSourceImage() as unknown as { width: number; height: number }
      const ch = 68
      p.crop = this.add
        .image(this.plotPos(i).x + PLOT / 2, this.plotPos(i).y + PLOT * 0.42, key)
        .setDisplaySize((ch * src.width) / src.height, ch)
        .setDepth(2)
      const cx = this.plotPos(i).x + PLOT / 2
      const cy = this.plotPos(i).y + PLOT * 0.4
      if (crop.growth >= Scheduler.HarvestGrowth && crop.state !== 'mastered') {
        p.marker = this.add.image(cx + 34, cy - 30, 'ui/star_gold').setDepth(4).setDisplaySize(22, 22)
      } else if (this.isWithered(crop)) {
        p.marker = this.add.image(cx + 34, cy - 30, 'ui/withered_mark').setDepth(4).setDisplaySize(22, 22)
      } else if (this.app.sched.GetDueKnowledgePoints(save).includes(crop.kpId) || crop.nextDue === 0) {
        p.marker = this.add.image(cx + 34, cy - 30, 'ui/water_drop').setDepth(4).setDisplaySize(20, 20)
      }
    }

    this.fruit.setText(`果实 ${save.fruit}`)
    this.seed.setText(`种子 ${save.inventory['seed_common'] ?? 0}`)
    this.fert.setText(`化肥 ${save.inventory['fertilizer'] ?? 0}`)
    this.streak.setText(`连击 ${save.streak.current}`)
    this.dueBadge.setText(`待浇水 ${this.app.farm.DueCount(save, this.app.sched)}`)
  }

  // ---------- 播种选择器 ----------
  private openPicker(): void {
    if (this.picker != null) return
    const save = this.app.save
    if (save.crops.length >= Farm.FieldSlots) {
      this.setMsg('农田已满（6 块），先收获或浇水')
      return
    }
    const planted = new Set(save.crops.map(c => c.kpId))
    const all: KnowledgePoint[] = Object.values(this.app.bank.KnowledgePoints)
    const avail = all.filter(k => !planted.has(k.id)).slice(0, 8)
    if (avail.length === 0) {
      this.setMsg('没有可播种的知识点')
      return
    }

    const c = this.add.container(0, 0).setDepth(20)
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.6).setScrollFactor(1))
    c.add(
      this.add.rectangle(W / 2, H / 2 - 40, 420, 300, 0x1c2a16, 1)
    )
    c.add(this.add.text(W / 2, H / 2 - 140, '播种 · 选一个知识点', { fontSize: '16px', color: '#e8f0e0' }).setOrigin(0.5))
    c.add(this.add.text(W / 2, H / 2 - 118, `（还有 ${avail.length} 个可选，前 8 个）`, { fontSize: '11px', color: '#9fb48f' }).setOrigin(0.5))

    avail.forEach((kp, idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const bx = W / 2 - 190 + col * 200
      const by = H / 2 - 80 + row * 54
      const card = this.add.rectangle(bx + 90, by + 22, 185, 44, 0x2a4023, 1)
      const t = this.add
        .text(bx + 8, by + 4, `#${idx + 1} ${kp.name}`.slice(0, 20), {
          fontSize: '12px',
          color: '#eaf5dc',
          wordWrap: { width: 150, useAdvancedWrap: true }
        })
      const rarity = this.add.text(bx + 8, by + 26, `稀有度 ${kp.cropRarity}`, { fontSize: '10px', color: '#9fb48f' })
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const r = this.app.farm.Plant(save, kp.id)
        this.closePicker()
        if (r.ok) {
          this.app.persist()
          this.setMsg(r.msg)
          this.refresh()
        } else {
          this.setMsg(r.msg)
        }
      })
      c.add([card, t, rarity])
    })

    const close = this.add
      .text(W / 2, H / 2 + 120, '×  关闭', { fontSize: '14px', color: '#ff9f9f', backgroundColor: '#241a1a', padding: { x: 10, y: 4 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.closePicker())
    c.add(close)

    this.picker = c
  }

  private closePicker(): void {
    if (this.picker != null) {
      this.picker.destroy(true)
      this.picker = null
    }
  }

  // ---------- 答题（浇水） ----------
  private openQuiz(kpId: string): void {
    const save = this.app.save
    const q: Question | null = this.app.bank.DrawQuestion(kpId, save)
    if (q == null) {
      this.setMsg('这个知识点暂时没有题目')
      return
    }
    const quiz = this.app.quiz
    quiz.Context = 'farm'
    quiz.Present(q)

    const c = this.add.container(0, 0).setDepth(30)
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.6))

    const isSelfEval = quiz.IsSelfEvalType(q)
    const top = 56
    let title = '浇水 · 答题'
    if (q.needsReview) title += '（练习题）'
    c.add(this.add.text(W / 2, top, title, { fontSize: '15px', color: '#9fd67f' }).setOrigin(0.5, 0))
    c.add(
      this.add
        .text(W / 2, top + 26, `${q.type} · 难度 ${q.difficulty}`, { fontSize: '11px', color: '#9fb48f' })
        .setOrigin(0.5, 0)
    )

    const stemTop = top + 52
    const stem = this.add
      .text(W / 2, stemTop, q.stem || '（无题干，直接作答）', {
        fontSize: '13px',
        color: '#e8f0e0',
        align: 'left',
        wordWrap: { width: 400, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
    c.add(stem)

    const actionTop = stemTop + stem.height + 18
    const actionH = isSelfEval ? 96 : q.options != null ? Math.min(q.options.length, 4) * 46 + 8 : 48
    const panelH = Math.min(top + 52 + stem.height + 18 + actionH + 170, H - top - 16)
    c.add(this.add.rectangle(W / 2, top + panelH / 2, 434, panelH, 0x1c2a16, 0.96))

    let answered = false

    const showResult = (choice: number | null) => {
      if (answered) return
      answered = true
      const result = quiz.Submit(choice, save)
      if (q.kpId) this.app.sched.OnAnswer(q.kpId, result.correct, save)
      this.app.persist()

      const fbTop = actionTop + actionH + 16
      const burst = this.add
        .image(W / 2, fbTop, result.correct ? 'quiz/burst_correct' : 'quiz/burst_wrong')
        .setDisplaySize(56, 56)
        .setOrigin(0.5, 0)
        .setDepth(31)
      c.add(burst)
      let detail = result.correct ? '答对了，作物长大一格！' : '答错 / 查看了答案，间隔重置。'
      if (result.answerText != null && result.answerText !== '') detail += `\n答案：${result.answerText}`
      if (result.explanation != null && result.explanation !== '') detail += `\n解析：${result.explanation}`
      const feedback = this.add
        .text(W / 2, fbTop + 64, detail, {
          fontSize: '13px',
          color: '#ffd75e',
          align: 'left',
          wordWrap: { width: 380, useAdvancedWrap: true }
        })
        .setOrigin(0.5, 0)
        .setDepth(31)
      c.add(feedback)

      const btn = this.add
        .text(W / 2, top + panelH - 44, '知道了', {
          fontSize: '14px',
          color: '#eaf5dc',
          backgroundColor: '#2a4023',
          padding: { x: 14, y: 6 }
        })
        .setOrigin(0.5)
        .setDepth(31)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.closeQuiz()
          this.setMsg(result.correct ? '浇水成功！' : '下次注意，作物会进入复习')
          this.refresh()
        })
      c.add(btn)
    }

    if (isSelfEval) {
      const yes = this.add
        .text(W / 2, actionTop, '我独立做对了 ✓', {
          fontSize: '14px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => showResult(0))
      const no = this.add
        .text(W / 2, actionTop + 46, '没做对，看答案学习', {
          fontSize: '14px',
          color: '#ff9f9f',
          backgroundColor: '#3b2424',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => showResult(1))
      c.add([yes, no])
    } else if (q.options != null && q.options.length > 0) {
      q.options.slice(0, 4).forEach((opt, idx) => {
        const b = this.add
          .text(24, actionTop + idx * 46, `${String.fromCharCode(65 + idx)}. ${opt}`, {
            fontSize: '13px',
            color: '#eaf5dc',
            backgroundColor: '#243b22',
            padding: { x: 10, y: 6 },
            wordWrap: { width: 380, useAdvancedWrap: true }
          })
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => showResult(idx))
        c.add(b)
      })
    } else {
      const b = this.add
        .text(W / 2, actionTop, '我独立做对了 ✓', {
          fontSize: '14px',
          color: '#bfe39a',
          backgroundColor: '#243b22',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => showResult(0))
      c.add(b)
    }

    const close = this.add
      .text(W - 16, 20, '×', { fontSize: '22px', color: '#ff9f9f' })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.closeQuiz())
    c.add(close)

    this.quiz = c
  }

  private closeQuiz(): void {
    if (this.quiz != null) {
      this.quiz.destroy(true)
      this.quiz = null
    }
  }
}
