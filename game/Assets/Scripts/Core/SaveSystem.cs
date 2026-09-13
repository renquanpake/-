// SaveSystem.cs — 本地 JSON 存档，3 份自动备份
using System;
using System.IO;
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
                state.EnsureInvKey();
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
                    s.EnsureInvKey();
                    return s;
                }
                string json = File.ReadAllText(SavePath);
                var s = JsonUtility.FromJson<GameSave>(json);
                s = Migrate(s);
                s.EnsureInvKey();
                return s;
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
                s.EnsureInvKey();
                Save(s);
                return true;
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
                s.levels ??= new System.Collections.Generic.Dictionary<string, LevelProgress>();
                s.revealLog ??= new System.Collections.Generic.Dictionary<string, RevealRecord>();
            }
            return s;
        }

        void MakeBackup()
        {
            long ts = DateTimeOffset.Now.ToUnixTimeSeconds();
            string dst = Path.Combine(backupDir, $"save_{ts}.json");
            File.Copy(SavePath, dst);
            PruneBackups();
        }

        GameSave RollbackToBackup()
        {
            var files = Directory.GetFiles(backupDir, "save_*.json");
            Array.Sort(files, (a, b) => b.CompareOrdinal(a)); // 最新在前（ts 越大越新）
            foreach (var f in files)
            {
                try
                {
                    var s = JsonUtility.FromJson<GameSave>(File.ReadAllText(f));
                    s = Migrate(s);
                    s.EnsureInvKey();
                    File.Copy(f, SavePath, true);
                    return s;
                }
                catch { /* 继续找上一份 */ }
            }
            var fresh = new GameSave();
            fresh.EnsureInvKey();
            return fresh;
        }

        void PruneBackups()
        {
            var files = Directory.GetFiles(backupDir, "save_*.json");
            Array.Sort(files, (a, b) => b.CompareOrdinal(a));
            for (int i = MaxBackups; i < files.Length; i++)
                File.Delete(files[i]);
        }
    }
}
