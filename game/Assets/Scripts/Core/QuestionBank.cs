// QuestionBank.cs — 题库加载与索引
using System;
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
                q.RawSrc = q.source;
                q.RawAnsSrc = q.answerSource;
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
                        KnowledgePoints[kp.id] = kp;
                }
            }
        }

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
            Question pick = null;
            for (int tries = 0; tries < 10; tries++)
            {
                pick = pool[rng.Next(pool.Count)];
                if (recent == null || !recent.Contains(pick.id)) break;
            }
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
    }
}
