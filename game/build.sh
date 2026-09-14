# 学田 Study Farm — Android 本地构建脚本
# 在你本机已装好 Unity 6000.x LTS + Android Build Support 后执行
set -euo pipefail

# 切到仓库根（build.sh 在 game/ 下，仓库根在上一级）
cd "$(dirname "$0")/.."

# Unity 编辑器路径：用环境变量覆盖，默认给常见安装位置
UNITY_EDITOR="${UNITY_EDITOR:-/opt/unity6000/Editor/Unity}"

# 版本：从 game/ProjectSettings/ProjectVersion.txt 读 m_EditorVersion 的 major.minor
VER="$(grep -m1 'm_EditorVersion' game/ProjectSettings/ProjectVersion.txt 2>/dev/null | sed 's/.*"m_EditorVersion": *"//;s/".*//' || echo 'local')"

echo "==> 构建前置：校验题库"
node tools/validate-questionbank.mjs
echo "==> 题库校验通过"

echo "==> 检查 Unity 编辑器: $UNITY_EDITOR"
if [[ ! -x "$UNITY_EDITOR" ]]; then
  echo "未找到可执行 Unity 编辑器。设置 UNITY_EDITOR 环境变量指向你的 Unity 6000.x LTS 路径。"
  echo "Linux 示例: export UNITY_EDITOR=~/Unity/Editor/Unity"
  exit 1
fi

echo "==> 批处理构建 ARM64 APK（版本 ${VER}）"
cd game
"$UNITY_EDITOR" -batchmode -nographics -quit \
  -projectPath . \
  -executeMethod StudyFarm.Editor.BuildScript.BuildAndroid

APK="build/StudyFarm-${VER}-arm64.apk"
if [[ -f "$APK" ]]; then
  echo "==> APK 产出: $(pwd)/$APK"
  du -h "$APK"
else
  echo "构建失败：未找到 $APK。检查 Unity 日志（Editor.log）与授权状态。"
  exit 1
fi
