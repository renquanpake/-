// AnswerInput.ts — DOM 答案输入框（叠加在 Phaser 画布上，viewport fixed 定位）
import type Phaser from 'phaser'

export class AnswerInput {
  readonly el: HTMLInputElement
  private readonly game: Phaser.Game

  constructor(scene: Phaser.Scene) {
    this.game = scene.game
    this.el = document.createElement('input')
    this.el.type = 'text'
    this.el.placeholder = '把你的答案写在这里，如 √3/3 或 2x+2y+3z=9'
    this.el.maxLength = 120
    this.el.autocomplete = 'off'
    this.el.style.cssText =
      'position:fixed;display:none;box-sizing:border-box;height:36px;padding:0 8px;' +
      "font-family:inherit;color:#eaf5dc;background:#10160d;border:1px solid #4a6a3a;" +
      'border-radius:6px;outline:none;z-index:60;'
    document.body.appendChild(this.el)
    // 回车提交交给场景按钮，输入框本身只做键盘捕获
    this.el.addEventListener('blur', () => this.hide())
  }

  // Phaser 逻辑坐标 → CSS 像素（考虑 FIT 缩放与居中偏移）
  private toCss(cx: number, cy: number): { x: number; y: number; scale: number } {
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / this.game.scale.gameSize.width
    return { x: rect.left + cx * scale, y: rect.top + cy * scale, scale }
  }

  show(cx: number, cy: number, widthLogical: number): void {
    const p = this.toCss(cx, cy)
    this.el.style.left = `${p.x}px`
    this.el.style.top = `${p.y}px`
    this.el.style.width = `${widthLogical * p.scale}px`
    this.el.style.fontSize = `${14 * p.scale}px`
    this.el.value = ''
    this.el.style.display = 'block'
  }

  hide(): void {
    this.el.style.display = 'none'
    this.el.blur()
  }

  value(): string {
    return this.el.value.trim()
  }

  destroy(): void {
    this.hide()
    this.el.remove()
  }
}
