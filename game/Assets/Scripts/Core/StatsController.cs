// StatsController.cs — 简版统计（R10）
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public struct SubjectStat
    {
        public int answered;
        public int correct;
        public int masteredKp;
        public int withered;
    }

    public struct ChallengeStat
    {
        public int clearedLevels;
        public int totalStars;
        public Dictionary<string, float> chapterRates;
    }

    public struct DailyCount
    {
        public string date; // yyyy-MM-dd
        public int count;
    }

    public class StatsController
    {
        public SubjectStat GetEnvStat(GameSave save)
        {
            int withered = 0;
            foreach (var c in save.crops)
                if (c.state == "withered") withered++;
            return new SubjectStat
            {
                answered = 0, // v1 简化，实际需作答日志
                correct = 0,
                masteredKp = save.mastered.Count,
                withered = withered,
            };
        }

        public ChallengeStat GetChallengeStat(GameSave save)
        {
            int cleared = 0, stars = 0;
            foreach (var kv in save.levels)
            {
                if (kv.Value.cleared)
                {
                    cleared++;
                    stars += kv.Value.stars;
                }
            }
            return new ChallengeStat
            {
                clearedLevels = cleared,
                totalStars = stars,
                chapterRates = new Dictionary<string, float>(),
            };
        }

        // 最近 7 天每日答题数（v1 简化：用 reveal_log 时间戳近似）
        public List<DailyCount> Last7Days(GameSave save)
        {
            var list = new List<DailyCount>();
            for (int i = 6; i >= 0; i--)
            {
                string d = DateTime.Now.AddDays(-i).ToString("yyyy-MM-dd");
                int c = 0;
                foreach (var kv in save.revealLog)
                    if (kv.Value.last == d) c++;
                list.Add(new DailyCount { date = d, count = c });
            }
            return list;
        }
    }
}
