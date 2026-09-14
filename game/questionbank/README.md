# 本目录已弃用（2026-09-14）

题库 JSON 的正式位置是 `game/Assets/StreamingAssets/questionbank/`。
本目录为 Unity 工程创建前的过渡产物，文件保留仅作历史参考，构建管线
（build-questionbank.mjs / validate-questionbank.mjs）已不再读写本目录。

请勿再向本目录提交修改；需要变更题库时：
1. 修改 `tools/extract-*.py` 或 `tools/build-questionbank.mjs`
2. 运行 `node tools/build-questionbank.mjs`（输出到 StreamingAssets）
3. 运行 `node tools/validate-questionbank.mjs` 校验

旧目录下两份 JSON 为 snake_case 键（如 kp_id），与 Unity JsonUtility 的
camelCase 匹配规则不一致，无法被运行时正确加载，切勿再使用。
