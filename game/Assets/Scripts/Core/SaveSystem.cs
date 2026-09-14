// SaveSystem.cs — 本地 JSON 存档，3 份自动备份
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    [Serializable]
    public class BackupManifest
    {
        public string path;
        public long timestamp;
    }

    public class SaveSystem
    {
        public string SavePath => Path.Combine(Application.persistentDataPath, "save.json");
        readonly string backupDir;
        const int MaxBackups = 3;

        public SaveSystem()
        {
            backupDir = Path.Combine(Application.persistentDataPath, "backups");
            Directory.CreateDirectory(backupDir);
        }

        public void Save(GameSave state)
        {
            try
            {
                state.schemaVersion = 3;
                state.EnsureV3Fields();
                string json = JsonUtility.ToJson(state);
                // 写前备份当前档
                if (File.Exists(SavePath))
                    MakeBackup();
                File.WriteAllText(SavePath, json);
            }
            catch (Exception e)
            {
                // 写失败：保留旧档，内存态继续运行（Error Handling 表）
                Debug.LogError("SaveSystem save failed: " + e.Message);
            }
        }

        public GameSave Load()
        {
            try
            {
                if (!File.Exists(SavePath))
                {
                    var s = new GameSave();
                    s.EnsureV3Fields();
                    return s;
                }
                string json = File.ReadAllText(SavePath);
                var loaded = JsonUtility.FromJson<GameSave>(json);
                loaded = Migrate(loaded);
                loaded.EnsureV3Fields();
                return loaded;
            }
            catch (Exception e)
            {
                Debug.LogError("SaveSystem load failed, rollback to latest backup: " + e.Message);
                return RollbackToBackup();
            }
        }

        public string Export()
        {
            var s = Load();
            return JsonUtility.ToJson(s);
        }

        public bool Import(string jsonText)
        {
            try
            {
                var s = JsonUtility.FromJson<GameSave>(jsonText);
                s = Migrate(s);
                s.EnsureV3Fields();
                Save(s);
                return true;
            }
            catch
            {
                return false;
            }
        }

        // 从文件导入（R9.3）：先校验 JSON 可解析再覆盖
        public bool ImportFromPath(string filePath)
        {
            try
            {
                if (!File.Exists(filePath)) return false;
                return Import(File.ReadAllText(filePath));
            }
            catch
            {
                return false;
            }
        }

        // 低版本档迁移（Correctness Property 4）
        GameSave Migrate(GameSave s)
        {
            if (s.schemaVersion < 2)
            {
                // v1 → v2：补 challenge/reveal_log 字段
                s.schemaVersion = 2;
                if (s.levels == null) s.levels = new System.Collections.Generic.Dictionary<string, LevelProgress>();
                if (s.revealLog == null) s.revealLog = new System.Collections.Generic.Dictionary<string, RevealRecord>();
            }
            if (s.schemaVersion < 3)
            {
                // v2 → v3：补答题日志/章节统计/传说限流/streak 清零时间
                s.schemaVersion = 3;
            }
            return s;
        }

        void MakeBackup()
        {
            long ts = DateTimeOffset.Now.ToUnixTimeSeconds();
            string dst = Path.Combine(backupDir, "save_" + ts + ".json");
            // 同秒内多次写档 → 文件名冲突，追加序号
            int n = 0;
            while (File.Exists(dst))
                dst = Path.Combine(backupDir, "save_" + ts + "_" + (++n) + ".json");
            File.Copy(SavePath, dst);
            PruneBackups();
        }

        GameSave RollbackToBackup()
        {
            // 按修改时间倒序取最新备份（兼容同秒多份的序号后缀）
            var files = new List<string>(Directory.GetFiles(backupDir, "save_*.json"));
            SortFilesByMtimeDesc(files);
            foreach (var f in files)
            {
                try
                {
                    var s = JsonUtility.FromJson<GameSave>(File.ReadAllText(f));
                    s = Migrate(s);
                    s.EnsureV3Fields();
                    File.Copy(f, SavePath, true);
                    return s;
                }
                catch { /* 继续找上一份 */ }
            }
            var fresh = new GameSave();
            fresh.EnsureV3Fields();
            return fresh;
        }

        // 文件列表按修改时间倒序（List 版本，避免 Array.Sort+index 兼容问题）
        static void SortFilesByMtimeDesc(List<string> files)
        {
            var sorted = files.OrderBy(f => new FileInfo(f).LastWriteTimeUtc.Ticks).Reverse().ToList();
            for (int i = 0; i < files.Count; i++)
                files[i] = sorted[i];
        }

        void PruneBackups()
        {
            // 按修改时间倒序，保留最新 MaxBackups 份
            var files = new List<string>(Directory.GetFiles(backupDir, "save_*.json"));
            SortFilesByMtimeDesc(files);
            for (int i = MaxBackups; i < files.Count; i++)
                File.Delete(files[i]);
        }
    }
}
