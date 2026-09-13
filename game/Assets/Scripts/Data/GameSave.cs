// GameSave.cs — 存档数据结构（persistentDataPath/save.json）
using System.Collections.Generic;
using UnityEngine;

namespace StudyFarm.Data
{
    [System.Serializable]
    public class LevelProgress
    {
        public int stars;
        public float bestRate;
        public bool cleared;
    }

    [System.Serializable]
    public class CropState
    {
        public string kpId;
        public int growth;          // 0..5
        public int interval;        // 复习间隔（天）
        public float ease;         // SM-2 ease
        public long nextDue;       // unix 秒
        public string state;       // growing / due / withered / harvestable / mastered
    }

    [System.Serializable]
    public class RevealRecord
    {
        public int count;
        public string last;
    }

    [System.Serializable]
    public class StreakInfo
    {
        public int current;
        public int best;
        public string lastActiveDate; // yyyy-MM-dd
        public bool rescueUsedThisMonth;
        public string rescueMonth;
    }

    [System.Serializable]
    public class GameSave
    {
        public int schemaVersion = 2;

        // 农场
        public List<CropState> crops = new List<CropState>();
        public Dictionary<string, int> inventory = new Dictionary<string, int>(); // fruit/seed/fertilizer/potion
        public int fruit = 0;
        public StreakInfo streak = new StreakInfo();

        // 闯关
        public Dictionary<string, LevelProgress> levels = new Dictionary<string, LevelProgress>();
        public List<string> chapterChests = new List<string>();

        // 答案展开日志
        public Dictionary<string, RevealRecord> revealLog = new Dictionary<string, RevealRecord>();

        // 图鉴
        public List<string> mastered = new List<string>();

        // 近5次抽题历史（农场抽题去重）
        public Dictionary<string, List<string>> recentDraws = new Dictionary<string, List<string>>();

        public void EnsureInvKey()
        {
            if (!inventory.ContainsKey("fruit")) inventory["fruit"] = 0;
            if (!inventory.ContainsKey("seed_common")) inventory["seed_common"] = 5;
            if (!inventory.ContainsKey("fertilizer")) inventory["fertilizer"] = 2;
            if (!inventory.ContainsKey("potion")) inventory["potion"] = 0;
        }
    }
}
