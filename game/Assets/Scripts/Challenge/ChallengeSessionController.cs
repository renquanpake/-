// ChallengeSessionController.cs — 一关的会话状态（题目序列、逐题结果、退出作废）
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;
using StudyFarm.Core;

namespace StudyFarm.Challenge
{
    public struct LevelResult
    {
        public int stars;     // 0=未通关 1/2/3
        public float rate;
        public int correct;
        public int total;
        public bool cleared;
    }

    public class ChallengeSessionController
    {
        Level level;
        int idx;
        int correct;
        bool aborted;
        readonly QuizController quiz;
        readonly EconomyController econ;

        public bool IsActive { get; private set; }
        public LevelResult LastResult;

        public ChallengeSessionController(QuizController quiz, EconomyController econ)
        {
            this.quiz = quiz;
            this.econ = econ;
        }

        public void Start(Level lv, GameSave save)
        {
            level = lv;
            idx = 0;
            correct = 0;
            aborted = false;
            IsActive = true;
            if (quiz != null) quiz.Context = "challenge";
            if (lv.questionIds.Count > 0)
                quiz.Present(QuestionBankStatic.Get(lv.questionIds[0]));
        }

        public void BindBank(QuestionBank bank) => QuestionBankStatic.Bind(bank);

        // 提交当前题
        public ChallengeAnswer Submit(int? choice, GameSave save)
        {
            var r = quiz.SubmitChallenge(choice, save);
            if (r.correct) correct++;
            idx++;
            if (idx < level.questionIds.Count)
                quiz.Present(QuestionBankStatic.Get(level.questionIds[idx]));
            return r;
        }

        // 结算（R11.6 星级：90/70/50）
        public LevelResult Finish(GameSave save)
        {
            int total = level.questionIds.Count;
            float rate = total > 0 ? (float)correct / total : 0f;
            int stars = 0;
            bool cleared = false;
            if (rate >= level.star3Rate) { stars = 3; cleared = true; }
            else if (rate >= level.star2Rate) { stars = 2; cleared = true; }
            else if (rate >= level.passRate) { stars = 1; cleared = true; }

            if (cleared)
            {
                int oldStars = save.levels.TryGetValue(level.id, out var progOld) ? progOld.stars : 0;
                bool firstClear = oldStars == 0;

                if (!save.levels.TryGetValue(level.id, out var prog))
                    save.levels[level.id] = new LevelProgress();
                else
                    prog = save.levels[level.id];
                prog.stars = Math.Max(prog.stars, stars);
                prog.bestRate = Math.Max(prog.bestRate, rate);
                prog.cleared = true;

                // 首通奖励（R11.7）
                if (firstClear)
                    econ.GrantLevelReward(save, level.reward);
                // 星级提升补差奖励（R11.7）
                else
                    econ.GrantLevelUpgrade(save, stars - oldStars);

                // 通关随机掉落（R8.1）
                econ.RandomDrop(save);

                // 章末宝箱：本章全部关卡（含 boss）3 星 → 发宝箱一次（R11.9）
                if (AllChapterThreeStars(save))
                {
                    string chapId = level.id.Substring(0, level.id.LastIndexOf('.'));
                    if (!save.chapterChests.Contains(chapId))
                    {
                        save.chapterChests.Add(chapId);
                        econ.GrantChapterChest(save);
                    }
                }
            }

            LastResult = new LevelResult { stars = stars, rate = rate, correct = correct, total = total, cleared = cleared };
            IsActive = false;
            quiz.Init();
            return LastResult;
        }

        // 本章全部关卡（含 boss）达 3 星
        bool AllChapterThreeStars(GameSave save)
        {
            if (level == null) return false;
            string chapId = level.id.Substring(0, level.id.LastIndexOf('.'));
            var levels = QuestionBankStatic.GetLevels(chapId);
            if (levels.Count == 0) return false;
            foreach (var lv in levels)
            {
                if (!save.levels.TryGetValue(lv.id, out var p) || p.stars < 3)
                    return false;
            }
            return true;
        }

        // 退出：整关作废（R11.8）
        public void Abort()
        {
            aborted = true;
            IsActive = false;
            quiz.Init();
        }

        public Question CurrentQuestion =>
            level != null && idx < level.questionIds.Count ? QuestionBankStatic.Get(level.questionIds[idx]) : null;
    }

    // 避免循环依赖，用静态桥接 QuestionBank 单例
    public static class QuestionBankStatic
    {
        static QuestionBank bank;
        public static void Bind(QuestionBank b) { bank = b; }
        public static Question Get(string id) => bank?.GetQuestion(id);
        public static List<Level> GetLevels(string chapterId) =>
            bank?.GetLevels(chapterId) ?? new List<Level>();
    }
}
