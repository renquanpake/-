# level_node.prefab — 章节地图关卡节点预制体清单（手建指引）

本预制体供 `LevelMapController` 使用。请在 Unity 里手建：

## 结构
```
level_node (GameObject)
  ├─ 组件: LevelNodeView   (Assets/Scripts/Challenge/LevelMapController.cs 里的 LevelNodeView 类)
  ├─ RectTransform (UI 容器, 宽 120 高 120)
  ├─ 子物体:
  │   ├─ NameText    (UI Text) → 绑定到 LevelNodeView.nameText
  │   ├─ StarText    (UI Text) → 绑定到 LevelNodeView.starText
  │   └─ LockIcon    (UI Image) → 绑定到 LevelNodeView.lockIcon (默认隐藏)
  └─ 节点背景 (UI Image, 圆形/方形)
       └─ 加 Button 组件, onClick → LevelNodeView.onClick（在 LevelMapController.RenderChapter 里会 AddListener）
```

## 保存
`Assets/Prefabs/level_node.prefab`

## 拖到 LevelMapController
`Challenge.unity` 里 LevelMapController 的 `levelNodePrefab` 字段拖入该预制体。
