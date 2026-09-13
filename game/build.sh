# 学田 Study Farm — Android 构建脚本
# 依赖：Unity Hub + Unity 6000.x LTS (Linux) + Android Build Support (JDK/SDK/NDK)
set -euo pipefail
cd "$(dirname "$0")/.."

# 定位 Unity 编辑器（用户配置 UNITY_EDITOR 环境变量或默认路径）
UNITY_EDITOR="${UNITY_EDITOR:-/opt/unity6000/Editor/Unity}"
VER="$(grep -m1 '^version' ProjectSettings/ProjectVersion.txt | awk '{print $2}')"

echo "==> 构建前置：校验题库"
node tools/validate-questionbank.mjs
echo "==> 题库校验通过"

echo "==> 激活 Unity 授权（个人版，需 Unity 账号）"
# 失败时走手动激活文件：$UNITY_LICENSE（.lic 文件路径）
export UNITY_LICENSE="${UNITY_LICENSE:-}"

echo "==> 批处理构建 ARM64 APK"
"$UNITY_EDITOR" -batchmode -nographics -quit \
  -projectPath . \
  -executeMethod StudyFarm.Editor.BuildScript.BuildAndroid

APK="build/StudyFarm-$(grep -m1 '^version' ProjectSettings/ProjectVersion.txt | awk '{print $2}')-arm64.apk"
if [[ -f "$APK" ]]; then
  echo "==> APK 产出: $APK ($(du -h "$APK" | cut -f1))"
else
  echo "构建失败：未找到 $APK。检查 Unity 日志与授权状态。"
  exit 1
fi
