// QuestionBank.cs — 题库加载与索引
using System;
using System.Linq;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public class QuestionBank : IQuestionBank
    {
        public Dictionary<string, Question> Questions = new Dictionary<string, Question>();
        public Dictionary<string, KnowledgePoint> KnowledgePoints = new Dictionary<string, KnowledgePoint>();
        public Dictionary<string, List<Level>> LevelsByChapter = new Dictionary<string, List<Level>>();
        public Dictionary<string, string> KpToChapter = new Dictionary<string, string>();
        public List<QuestionBankFile> Subjects = new List<QuestionBankFile>();
        readonly System.Random rng = new System.Random();

        public List<string> LoadErrors = new List<string>();

        public void Init(GameSave save)
        {
            var dir = Application.streamingAssetsPath + "/questionbank";
            if (!Directory.Exists(dir))
            {
                LoadErrors.Add("questionbank 目录不存在: " + dir);
                return;
            }
            foreach (var file in Directory.GetFiles(dir, "*.json"))
            {
                try
                {
                    string json = File.ReadAllText(file);
                var data = JsonUtility.FromJson<QuestionBankFile>(json);
                Subjects.Add(data);
                IndexSubject(data);
                }
                catch (Exception e)
                {
                    // R1.2：单文件损坏不阻塞其它科目
                    LoadErrors.Add(Path.GetFileName(file) + " 解析失败: " + e.Message);
                }
            }
        }

        void IndexSubject(QuestionBankFile d)
        {
            foreach (var q in d.questions ?? new List<Question>())
            {
                Questions[q.id] = q;
                if (!string.IsNullOrEmpty(q.kpId))
                {
                    if (KnowledgePoints.TryGetValue(q.kpId, out var kp))
                        kp.linkedQuestionCount++;
                }
            }
            foreach (var ch in d.chapters ?? new List<Chapter>())
            {
                if (ch.levels != null)
                    LevelsByChapter[ch.id] = ch.levels;
                if (ch.knowledgePoints != null)
                {
                    foreach (var kp in ch.knowledgePoints)
                    {
                        KnowledgePoints[kp.id] = kp;
                        KpToChapter[kp.id] = ch.id;
                    }
                }
            }
        }

        // R1.4：启动校验 source 完整性，缺失清单进启动日志
        public void LogSourceValidation()
        {
            var missing = new List<string>();
            foreach (var q in Questions.Values)
                if (q.source == null || !q.source.HasContent()) missing.Add("q " + q.id + " source 缺失");
            foreach (var kp in KnowledgePoints.Values)
                if (kp.source == null || !kp.source.HasContent()) missing.Add("kp " + kp.id + " source 缺失");
            if (missing.Count > 0)
            {
                LoadErrors.Add("source 校验失败 " + missing.Count + " 项: " + string.Join("; ", missing.GetRange(0, Math.Min(20, missing.Count))));
                Debug.LogWarning("QuestionBank source 校验缺失清单: " + LoadErrors[LoadErrors.Count - 1]);
            }
        }

        public string GetChapterOfKp(string kpId) =>
            KpToChapter.TryGetValue(kpId, out var c) ? c : null;

        // 农场抽题：kpId 题目池随机，排除近5次已用
        public Question DrawQuestion(string kpId, GameSave save)
        {
            var pool = new List<Question>();
            foreach (var q in Questions.Values)
                if (q.kpId == kpId && !q.needsReview) pool.Add(q);
            if (pool.Count == 0)
            {
                // 允许占位练习题（环工 needs_review 题可作练习）
                pool.Clear();
                foreach (var q in Questions.Values)
                    if (q.kpId == kpId) pool.Add(q);
            }
            if (pool.Count == 0) return null;

            List<string> recent = save.recentDraws != null && save.recentDraws.TryGetValue(kpId, out var r) ? r : null;
            // 近5次去重：优先从未用过的题中抽；全用过才从近5次外随机
            Question pick = null;
            var unused = pool.Where(q => recent == null || !recent.Contains(q.id)).ToList();
            if (unused.Count > 0)
                pick = unused[rng.Next(unused.Count)];
            else
                pick = pool[rng.Next(pool.Count)];
            if (save.recentDraws == null) save.recentDraws = new Dictionary<string, List<string>>();
            if (!save.recentDraws.ContainsKey(kpId)) save.recentDraws[kpId] = new List<string>();
            var list = save.recentDraws[kpId];
            list.Add(pick.id);
            while (list.Count > 5) list.RemoveAt(0);
            return pick;
        }

        public Question GetQuestion(string id) => Questions.TryGetValue(id, out var q) ? q : null;

        public List<Level> GetLevels(string chapterId) =>
            LevelsByChapter.TryGetValue(chapterId, out var l) ? l : new List<Level>();

        public KnowledgePoint GetMeta(string kpId) =>
            KnowledgePoints.TryGetValue(kpId, out var k) ? k : null;
    }

    public interface IQuestionBank
    {
        void Init(GameSave save);
        Question DrawQuestion(string kpId, GameSave save);
        Question GetQuestion(string id);
        List<Level> GetLevels(string chapterId);
        KnowledgePoint GetMeta(string kpId);
        string GetChapterOfKp(string kpId);
    }
}
