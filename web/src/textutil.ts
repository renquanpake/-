// textutil.ts — 题干文本排版工具：数学符号断行 + 超长自动降字号
import Phaser from 'phaser'

// 给数学符号两侧补空格，让词级断行在运算符处断开，
// 而不是把 "∂z/∂x"、"∑n=1" 这类无空格串逐字竖碎
export function breakMath(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[∂∑∫√∞≤≥±≈≠=+\-×÷*/^]/g, ' $& ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export interface StemSpec {
  x: number
  y: number
  width: number
  maxH: number
  fontSize?: number
  minFont?: number
  color?: string
}

// 题干构建：从 fontSize 起排，超过 maxH 就逐步降字号到 minFont（仍在界内才返回）
export function makeStem(scene: Phaser.Scene, text: string, s: StemSpec): Phaser.GameObjects.Text {
  const start = s.fontSize ?? 15
  const min = s.minFont ?? 12
  let size = start
  let t: Phaser.GameObjects.Text
  for (;;) {
    t = scene.add
      .text(s.x, s.y, text, {
        fontSize: `${size}px`,
        color: s.color ?? '#f2f7ea',
        align: 'left',
        lineSpacing: 6,
        wordWrap: { width: s.width, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
    if (t.height <= s.maxH || size <= min) return t
    t.destroy()
    size -= 1
  }
}
