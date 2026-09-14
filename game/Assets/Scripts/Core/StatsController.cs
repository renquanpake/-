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
        public float correctRate;
        public int masteredKp;
        public int withered;
    }

    public struct ChallengeStat
    {
        public int clearedLevels;
        public int totalStars;
        public Dictionary<string, float> chapterRates; // chapterId -> 正确率
    }

    public struct DailyCount
    {
        public string date; // yyyy-MM-dd
        public int count;
    }

    public struct SubjectOverview
    {
        public string subject;
        public string subjectName;
        public int questionCount;
        public int chapterCount;
    }

    public class StatsController
    {
        public SubjectStat GetEnvStat(GameSave save)
        {
            int withered = 0;
            foreach (var c in save.crops)
                if (c.state == "withered") withered++;
            int total = save.envAnswers;
            return new SubjectStat
            {
                answered = total,
                correct = save.envCorrect,
                correctRate = total > 0 ? (float)save.envCorrect / total : 0f,
                masteredKp = save.mastered.Count,
                withered = withered,
            };
        }

        public ChallengeStat GetChallengeStat(GameSave save)
        {
            int cleared = 0, stars = 0;
            foreach (var kv in save.levels ?? new Dictionary<string, LevelProgress>())
            {
                if (kv.Value.cleared)
                {
                    cleared++;
                    stars += kv.Value.stars;
                }
            }
            var rates = new Dictionary<string, float>();
            foreach (var kv in save.chapterStats ?? new Dictionary<string, ChapterAnswerStat>())
            {
                rates[kv.Key] = kv.Value.total > 0 ? (float)kv.Value.correct / kv.Value.total : 0f;
            }
            return new ChallengeStat
            {
                clearedLevels = cleared,
                totalStars = stars,
                chapterRates = rates,
            };
        }

        // 最近 7 天每日答题数（R10.3）
        public List<DailyCount> Last7Days(GameSave save)
        {
            var daily = save.dailyAnswers ?? new Dictionary<string, int>();
            var list = new List<DailyCount>();
            for (int i = 6; i >= 0; i--)
            {
                string d = DateTime.Now.AddDays(-i).ToString("yyyy-MM-dd");
                list.Add(new DailyCount { date = d, count = daily.GetValueOrDefault(d) });
            }
            return list;
        }

        // R1.3：各科目题目数量与章节数量
        public List<SubjectOverview> GetBankOverview(QuestionBank bank)
        {
            var list = new List<SubjectOverview>();
            foreach (var s in bank.Subjects)
            {
                int qCount = 0, chCount = 0;
                foreach (var ch in s.chapters ?? new List<Chapter>()) chCount++;
                foreach (var q in s.questions ?? new List<Question>()) qCount++;
                list.Add(new SubjectOverview
                {
                    subject = s.subject,
                    subjectName = s.subjectName,
                    questionCount = qCount,
                    chapterCount = chCount,
                });
            }
            return list;
        }
    }
}
