// main.ts — 启动 Phaser（竖屏 480×800，等比缩放适配手机）
import Phaser from 'phaser'
import { Boot } from './scenes/Boot'
import { Farm } from './scenes/Farm'
import { Challenge } from './scenes/Challenge'
import { Stats } from './scenes/Stats'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 920,
  backgroundColor: '#1a2618',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [Boot, Farm, Challenge, Stats]
})

// PWA：仅生产构建注册 service worker（离线可开）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* 非 https 或旧浏览器，忽略 */
    })
  })
}

// 测试钩子：暴露 game 实例供自动化测试（playwright）定位 Phaser 交互对象
;(window as unknown as { __farm?: { game: Phaser.Game } }).__farm = { game }

export default game
