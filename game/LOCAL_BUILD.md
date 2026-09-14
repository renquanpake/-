# 学田 Study Farm — 本机构建指南

> 容器内装不了 Unity 编辑器，所以 T6 的 APK 由**你本机**执行。
> 本指南让你装好 Unity 后，一条命令出 APK。

## 0. 前置：你本机要装什么

1. **Unity Hub**（最新版）
2. **Unity 6000.x LTS** 编辑器，安装时勾选：
   - Android Build Support（含 OpenJDK / NDK / IL2CPP）
   - Universal Render Pipeline（URP）
   - 勾选 C# 编译工具链
3. Unity 账号登录后，个人版授权自动完成

## 1. 把仓库克隆到你本机

```bash
git clone <你的仓库地址> study
cd study
```

## 2. 用 Unity Hub 打开工程

1. Hub → 添加 → 选 `game/` 目录
2. Hub 会提示安装 Unity 6000.x + Android 模块（若没装过）
3. 双击工程图标打开 Unity 编辑器，等它导入完成（首次几分钟）

## 3. 编辑器内做 3 件事（一次性）

### 3.1 生成并检查 5 个场景

仓库已含 `game/Assets/Scenes/{Boot,Farm,Challenge,Shop,Stats}.unity` 骨架
（`node tools/gen-scenes.mjs` 生成，脚本 .meta 已预生成、场景 m_Script 已引用真实 guid，
导入后控制器应自动挂载）。导入 Unity 后：

1. 逐个打开场景，确认根节点存在且挂载了对应脚本（Inspector 可见；
   若显示 Missing Script，先重跑 `node tools/gen-scenes.mjs`，仍不行再手动拖脚本）
2. 结构自检：`python3 tools/check-unity-yaml.py`（校验 block/引用/guid 完整性，0 error 即可）
2. `levelNodePrefab` 预制体需手建：按 `Assets/Prefabs/level_node.prefab_README.md` 指引
   拖出 `Assets/Prefabs/level_node.prefab`（含 `LevelNodeView` 组件 + Name/Star/Lock 三个子 UI）
3. 把预制体拖给 `Challenge.unity` 里 `LevelMapController.levelNodePrefab`
4. 各 Controller 的 `[SerializeField]` 引用在 Inspector 里拖好（GameManager 的 6 个子系统、
   QuizUI 的文本/按钮等）

| 场景文件 | 挂载脚本 |
|---------|---------|
| `Boot.unity` | `GameManager`（设为 DontDestroyOnLoad） |
| `Farm.unity` | `FarmController` |
| `Challenge.unity` | `LevelMapController` + `QuizUI` |
| `Shop.unity` | `EconomyController`（商店 UI） |
| `Stats.unity` | `StatsController`（统计 UI） |

### 3.2 设产品版本号

`File > Build Settings` 里 `Version` 填 `1.0.0`（或你要的版本），
`Package Name` 填 `com.study.farm`。

### 3.3 跑一次单测（可选但建议）

`Window > Package Manager > General > General Tests` 面板，点绿色 Play，
确认 `SchedulerTests` / `QuizControllerTests` / `SaveSystemTests` / `ExtendedTests`（streak/经济/统计/自评/迁移）全绿。

## 4. 出 APK（两条路任选）

### 路 A：编辑器菜单（最简单）
1. 前置钩子（题库校验 + 场景骨架 + 场景 YAML 检查）：
```bash
node tools/validate-questionbank.mjs
node tools/gen-scenes.mjs
python3 tools/check-unity-yaml.py
```
2. `Unity 菜单栏 > StudyFarm > Build Android APK`

### 路 B：命令行（可脚本化 / CI）
```bash
export UNITY_EDITOR=/你的/Unity/6000.x/Editor/Unity   # Linux 示例
./game/build.sh
```
- 脚本先跑 `node tools/validate-questionbank.mjs`（题库校验），失败即停
- 再调 Unity 批处理出 `game/build/StudyFarm-{ver}-arm64.apk`

## 5. 冒烟验证

APK 装到你 Android 设备（minSdk 24）后，按 `game/SMOKE_TEST.md` 的 10 段清单逐条打勾。

## 常见问题

- **导入后 C# 报错**：先确认 5 个场景都已创建并保存（BuildScript 引用的 5 个 `.unity` 路径必须存在）。
- **控制器显示 Missing Script**：脚本 `.meta` 已预生成（确定性 guid），场景 m_Script 已引用真实 guid；
  若仍缺失，运行 `node tools/gen-scenes.mjs` 重新生成场景并刷新 Unity（Assets → Refresh），仍不行再手动拖脚本。
- **授权失败**：Unity Hub 右上角登录账号；批处理构建授权失败会打印激活指引，按提示下载 `.lic` 放 `~/.local/share/unity3d/`。
- **APK 体积超 150MB**：Build Settings 勾 `Compression (Lazily)`、IL2CPP + ARM64，关调试符号。
