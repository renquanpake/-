#!/usr/bin/env node
// web-build-assets.mjs — 从 Unity 工程拷入 Web 版静态资源（构建步骤）
// 单一事实源：
//   题库  game/Assets/StreamingAssets/questionbank/*.json -> web/public/questionbank/
//   美术  game/Assets/Art/final/                           -> web/public/art/
// 用法：node tools/web-build-assets.mjs
import { cpSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const copies = [
  { src: join(root, 'game', 'Assets', 'StreamingAssets', 'questionbank'), dst: join(root, 'web', 'public', 'questionbank') },
  { src: join(root, 'game', 'Assets', 'Art', 'final'), dst: join(root, 'web', 'public', 'art') }
]

let files = 0
let bytes = 0

for (const { src, dst } of copies) {
  if (!existsSync(src)) {
    console.error(`missing source: ${src}`)
    process.exit(1)
  }
  mkdirSync(dst, { recursive: true })
  cpSync(src, dst, { recursive: true, force: true })
  ;(function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else {
        files += 1
        bytes += st.size
      }
    }
  })(dst)
}
console.log(`web asset build done (${files} files, ${(bytes / 1024).toFixed(0)} KiB)`)
