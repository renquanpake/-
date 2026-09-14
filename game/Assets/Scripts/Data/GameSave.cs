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
        public long zeroedAtUnix;    // 最近一次清零时间（挽回药剂 48h 窗口）
        public int preZeroStreak;     // 清零前的 streak（挽回药剂恢复值）
    }

    [System.Serializable]
    public class ChapterAnswerStat
    {
        public int total;
        public int correct;
    }

    [System.Serializable]
    public class GameSave
    {
        public int schemaVersion = 3;

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

        // 答题日志（R10）
        public int envAnswers = 0;      // 环工浇水累计答题数
        public int envCorrect = 0;      // 环工浇水累计答对数
        public Dictionary<string, ChapterAnswerStat> chapterStats = new Dictionary<string, ChapterAnswerStat>(); // math 各章
        public Dictionary<string, int> dailyAnswers = new Dictionary<string, int>(); // yyyy-MM-dd -> 当日答题数（全科目）
        public long lastLegendaryDropUnix = 0; // 传说掉落限流（30 天 1 次）

        public void EnsureInvKey()
        {
            if (!inventory.ContainsKey("fruit")) inventory["fruit"] = 0;
            if (!inventory.ContainsKey("seed_common")) inventory["seed_common"] = 5;
            if (!inventory.ContainsKey("fertilizer")) inventory["fertilizer"] = 2;
            if (!inventory.ContainsKey("potion")) inventory["potion"] = 0;
        }

        public void EnsureV3Fields()
        {
            if (streak == null) streak = new StreakInfo();
            if (chapterStats == null) chapterStats = new Dictionary<string, ChapterAnswerStat>();
            if (dailyAnswers == null) dailyAnswers = new Dictionary<string, int>();
            if (levels == null) levels = new Dictionary<string, LevelProgress>();
            if (revealLog == null) revealLog = new Dictionary<string, RevealRecord>();
            if (recentDraws == null) recentDraws = new Dictionary<string, List<string>>();
            if (crops == null) crops = new List<CropState>();
            if (mastered == null) mastered = new List<string>();
            if (chapterChests == null) chapterChests = new List<string>();
            EnsureInvKey();
        }
    }
}
