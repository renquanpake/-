// Boot.ts — 预载贴图 + 拉取题库 + 组装 App，然后进农场场景
import Phaser from 'phaser'
import type { QuestionBankFile } from '../core/types'
import { App } from '../app'

// M3 用到的贴图（按需加载，非全量）
const ART = [
  'tiles/grass',
  'tiles/soil_dry',
  'tiles/soil_watered',
  'tiles/fence_wood',
  'crops/env_oxygen_tree_s1',
  'crops/env_oxygen_tree_s2',
  'crops/env_oxygen_tree_s3',
  'crops/math_epic_pi_tree',
  'crops/math_legendary_medal_plant',
  'quiz/answer_card',
  'quiz/burst_correct',
  'quiz/burst_wrong',
  'ui/fruit',
  'ui/seed',
  'ui/fertilizer',
  'ui/withered_mark',
  'ui/water_drop',
  'ui/streak_flame',
  'ui/check_green',
  'ui/cross_red',
  'ui/star_gold',
  'ui/gift_box',
  'challenge/lvl_node_plain',
  'challenge/lvl_node_boss',
  'challenge/lvl_flag',
  'challenge/medal_gold',
  'challenge/medal_silver',
  'challenge/medal_bronze',
  'ui/lock',
  'buildings/chest'
]

export class Boot extends Phaser.Scene {
  create() {
    for (const key of ART) {
      this.load.image(key, `art/${key}.png`)
    }

    this.load.on(Phaser.Loader.Events.COMPLETE, async () => {
      try {
        const banks = await Promise.all(
          ['math', 'env'].map(async subject => {
            const res = await fetch(`questionbank/${subject}.json`)
            if (!res.ok) throw new Error(`${subject}.json HTTP ${res.status}`)
            return (await res.json()) as QuestionBankFile
          })
        )
        this.registry.set('app', new App(banks))
        this.scene.start('Farm')
      } catch (err) {
        console.error('boot failed:', err)
        this.add
          .text(16, 16, '题库加载失败：' + String(err), {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#ff6b6b',
            wordWrap: { width: 440, useAdvancedWrap: true }
          })
          .setOrigin(0)
      }
    })

    this.add
      .text(20, 20, '学田 StudyFarm · 加载中…', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#e8f0e0'
      })
      .setOrigin(0)
    this.load.start()
  }
}
