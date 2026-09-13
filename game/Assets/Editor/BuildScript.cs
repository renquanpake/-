// BuildScript.cs — Unity 批处理构建 Android APK
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.Android;
using UnityEngine;

namespace StudyFarm.Editor
{
    public static class BuildScript
    {
        [MenuItem("StudyFarm/Build Android APK")]
        public static void BuildAndroid()
        {
            BuildAndRun(BuildTarget.Android);
        }

        public static void BuildAndRun(BuildTarget target)
        {
            string outPath = $"build/StudyFarm-{Application.version}-arm64.apk";
            System.IO.Directory.CreateDirectory("build");

            var options = new BuildPlayerOptions
            {
                scenes = new[]
                {
                    "Assets/Scenes/Boot.unity",
                    "Assets/Scenes/Farm.unity",
                    "Assets/Scenes/Challenge.unity",
                    "Assets/Scenes/Shop.unity",
                    "Assets/Scenes/Stats.unity",
                },
                targetPlatform = target,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None,
                locationPathName = outPath,
            };

            // Android IL2CPP ARM64
            EditorUserSettings.SetAndroidBuildSubtarget((int)AndroidBuildSubtarget.Armv7);
            BuildPipeline.BuildPlayer(options);

            Debug.Log($"APK built: {outPath}");
        }
    }
}
#endif
