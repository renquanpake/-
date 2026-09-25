// Stats.ts — 统计与存档管理场景
import Phaser from 'phaser'
import { App } from '../app'

const W = 480
const H = 920

export class Stats extends Phaser.Scene {
  private app!: App

  constructor() {
    super('Stats')
  }

  init() {
    this.app = this.registry.get('app') as App
  }

  create() {
    // 场景重入时清掉上一轮显示对象
    (this.children as unknown as { removeAll(deep?: boolean): void }).removeAll(true)
    const save = this.app.save
    const c = this.add.container(0, 0).setDepth(10)
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10160d, 0.9))
    this.add.image(W / 2, H / 2, 'tiles/grass').setDisplaySize(W, H).setDepth(0)

    c.add(
      this.add
        .text(12, 20, '← 返回', { fontSize: '13px', color: '#ff9f9f', backgroundColor: '#241a1a', padding: { x: 8, y: 4 } })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.app.persist()
          this.scene.start('Challenge')
        })
    )
    c.add(this.add.text(W / 2, 64, '📊 学习统计', { fontSize: '18px', color: '#eaf5dc' }).setOrigin(0.5, 0))

    const stats = this.app.stats
    let y = 100

    const section = (t: string) => {
      c.add(this.add.text(20, y, t, { fontSize: '14px', color: '#9fd67f' }).setOrigin(0, 0))
      y += 26
    }
    const line = (t: string, color = '#dfe9d0') => {
      c.add(this.add.text(28, y, t, { fontSize: '13px', color }).setOrigin(0, 0))
      y += 22
    }
    const gap = () => {
      y += 12
    }

    // 题库概况
    section('题库')
    for (const o of stats.GetBankOverview(this.app.bank)) {
      line(`${o.subjectName}：${o.chapterCount} 章 / ${o.questionCount} 题`)
    }
    gap()

    // 农工（浇水）
    section('环工浇水')
    const env = stats.GetEnvStat(save)
    line(`累计答题 ${env.answered}，正确 ${env.correct}（${Math.round(env.correctRate * 100)}%）`)
    line(`在长作物 ${save.crops.length}，蔫萎 ${env.withered}，已精通 ${env.masteredKp}`)
    gap()

    // 闯关
    section('闯关')
    const ch = stats.GetChallengeStat(save)
    line(`已通 ${ch.clearedLevels} 关，总星 ${ch.totalStars}`)
    for (const [chapId, rate] of Object.entries(ch.chapterRates)) {
      line(`${this.chapterName(chapId)} 正确率 ${Math.round(rate * 100)}%`, '#bfe39a')
    }
    gap()

    // 近 7 天
    section('近 7 天答题')
    const days = stats.Last7Days(save)
    const max = Math.max(1, ...days.map(d => d.count))
    const barW = 40
    days.forEach((d, i) => {
      const bx = 40 + i * (barW + 12)
      const bh = Math.round((d.count / max) * 90)
      const bar = this.add
        .rectangle(bx + barW / 2, y + 100 - bh / 2, barW, Math.max(4, bh), d.count > 0 ? 0x6fa84f : 0x2a3a24)
      c.add(bar)
      c.add(this.add.text(bx + barW / 2, y + 108, `${d.date.slice(5)}:${d.count}`, { fontSize: '10px', color: '#9fb48f' }).setOrigin(0.5, 0))
    })
    y += 140

    // 连击
    section('连击')
    line(`当前 ${save.streak.current} 天 / 最佳 ${save.streak.best} 天`, '#ff9f5e')
    gap()

    // 存档管理（R9）
    section('存档管理')
    const mkBtn = (x: number, by: number, label: string, color: string, onTap: () => void) => {
      const b = this.add
        .text(x, by, label, { fontSize: '13px', color: '#eaf5dc', backgroundColor: color, padding: { x: 12, y: 6 } })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap)
      c.add(b)
    }
    const by1 = y
    const by2 = y + 44
    mkBtn(20, by1, '导出存档', '#243b22', () => this.exportSave())
    mkBtn(150, by1, '重置存档', '#3b2424', () => this.resetSave())
    mkBtn(20, by2, '导入文件', '#1e3440', () => this.inputFile().click())
    mkBtn(150, by2, '粘贴导入', '#1e3440', () => this.pasteImport())
    y = by2 + 44
    const hint = this.add
      .text(20, y, '导出 = 复制到剪贴板 + 下载 JSON；导入 = 选择文件（.json/.txt）或粘贴 JSON 文本。导入/重置后自动刷新。', {
        fontSize: '11px',
        color: '#9fb48f',
        wordWrap: { width: 420, useAdvancedWrap: true }
      })
      .setOrigin(0, 0)
    c.add(hint)
  }

  private chapterName(chapId: string): string {
    for (const s of this.app.bank.Subjects) {
      for (const ch of s.chapters ?? []) {
        if (ch.id === chapId) return ch.name
      }
    }
    return chapId
  }

  private toast(msg: string): void {
    const t = this.add
      .text(W / 2, H - 80, msg, {
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

  private exportSave(): void {
    const json = this.app.saveSys.Export()
    navigator.clipboard
      ?.writeText(json)
      .then(() => this.toast('已复制到剪贴板，同时下载了 JSON 文件'))
      .catch(() => this.toast('复制失败，已下载 JSON 文件'))
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'studyfarm-save.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  private pasteImport(): void {
    const text = window.prompt('粘贴存档 JSON：')
    if (text == null || text.trim() === '') return
    if (this.app.saveSys.Import(text)) {
      this.toast('导入成功，刷新中…')
      setTimeout(() => location.reload(), 800)
    } else {
      this.toast('导入失败：JSON 解析或校验错误')
    }
  }

  private inputFile(): HTMLInputElement {
    let el = document.getElementById('save-file-input') as HTMLInputElement | null
    if (el == null) {
      el = document.createElement('input')
      el.type = 'file'
      el.accept = '.json,.txt'
      el.id = 'save-file-input'
      el.style.display = 'none'
      const input = el
      el.addEventListener('change', () => {
        const f = input.files?.[0]
        if (f == null) return
        f.text().then(t => {
          if (this.app.saveSys.Import(t)) {
            this.toast('导入成功，刷新中…')
            setTimeout(() => location.reload(), 800)
          } else {
            this.toast('导入失败')
          }
        })
      })
      document.body.appendChild(el)
    }
    return el
  }

  private resetSave(): void {
    if (!window.confirm('确定重置存档？所有进度将清空')) return
    for (const k of Object.keys(localStorage).filter(k => k.startsWith('studyfarm.'))) {
      localStorage.removeItem(k)
    }
    location.reload()
  }
}
