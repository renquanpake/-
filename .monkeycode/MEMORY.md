# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content]

## Entries

[Project Knowledge Summary]
- Date: 2026-09-13
- Context: 用户基于仓库内考研 PDF 资料发起「学田 Study Farm」2D 养成学习游戏项目
- Category: Workflow & Collaboration
- Instructions:
  - 项目完整规划书位于 `.monkeycode/specs/study-farm/`（requirements.md + design.md），恢复上下文时优先重读这两个文件
  - 技术栈：Unity 6000.x LTS + C#，交付 Android APK（ARM64, minSdk 24），容器内 CLI 批处理自动构建
  - 纯离线单机，无后端；游戏工程位于仓库 `game/` 子目录，题库转换脚本位于 `tools/`
  - 美术：免费像素素材包为主体 + AI 生图补充；生图 key 由用户提供后放 `game/.env`（gitignore），占位符进 `.env.example`
  - 题库来源：仓库根目录 4 份 PDF（高数下笔记、750题、环境工程原理、环境工程学），全量转换为 JSON，构建前必须过 validate 脚本
  - 本仓库实际为公开仓库（用户以为是私密的），任何 key/凭据严禁提交进仓库

[User Instruction Summary]
- Date: 2026-09-13
- Context: 用户发起 Unity 游戏项目时的技术决策
- Instructions:
  - 用户指定 Unity C# 技术栈、容器内自动构建 APK、工程放 study 仓库 /game 子目录、纯离线单机、题库做全部 4 份 PDF
  - 生图模型 key 用户会后续提供，用于作物/装饰/图标生成
