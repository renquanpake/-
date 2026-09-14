// QuizController.cs — 答题核心（农场 + 闯关共用），含答案折叠状态机
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public enum QuizPhase { ShowingQuestion, ManualRevealed, Judged }

    public struct ReviewResult
    {
        public string questionId;
        public bool correct;
        public bool manualReveal; // 主动展开 → 强制判负
        public string answerText;
        public Source answerSource;
        public string explanation;
    }

    public struct ChallengeAnswer
    {
        public string questionId;
        public bool correct;
        public bool counted;      // 是否计入完成度
        public bool manualReveal;
    }

    public class QuizController
    {
        QuizPhase phase = QuizPhase.ShowingQuestion;
        Question current;
        bool manualRevealed = false;
        int combo = 0; // 连对计数（R3.4 暴击）

        // 上下文：farm（浇水）/ challenge（闯关），决定统计归属
        public string Context = "farm";
        public IQuestionBank BankRef;

        // 委托：连对 3 题暴击（GameManager 接线 econ.GrantCrit）
        public Action OnCrit;
        // 委托：答题提交完成（GameManager 接线 streak.OnActive + 存档）
        public Action<bool> OnAnswerSubmitted;

        public Question Current { get => current; }
        public QuizPhase Phase { get => phase; }
        public bool ManualRevealed { get => manualRevealed; }
        public int Combo { get => combo; }

        public void Init()
        {
            phase = QuizPhase.ShowingQuestion;
            current = null;
            manualRevealed = false;
            combo = 0;
        }

        public void Present(Question q)
        {
            current = q;
            phase = QuizPhase.ShowingQuestion;
            manualRevealed = false;
        }

        // 玩家主动展开答案（SHOWING_QUESTION → MANUAL_REVEALED，该题强制判负）
        public void RevealAnswer()
        {
            if (phase != QuizPhase.ShowingQuestion) return;
            manualRevealed = true;
            phase = QuizPhase.ManualRevealed;
        }

        public bool IsSelfEvalType(Question q) =>
            q != null && (q.type == "calc" || q.type == "blank" || q.type == "multi");

        public static bool IsSelfEvalStatic(Question q) =>
            q != null && (q.type == "calc" || q.type == "blank" || q.type == "multi");

        // 提交作答。
        // 客观题（single/judge）：choice 为选项索引。
        // 自评题（calc/blank/multi，v1 无机器判分）：choice 0=我独立做对，1=未做对（看答案学习）。
        // 返回判定结果，自动展开答案（→ JUDGED）
        public ReviewResult Submit(int? choice, GameSave save)
        {
            bool correct = false;
            if (current != null)
            {
                if (current.type == "judge")
                {
                    // 判断题：选项0=对 选项1=错；answer="0"/"1"
                    correct = choice.HasValue && current.answer.Trim() == choice.Value.ToString();
                }
                else if (current.type == "single")
                {
                    correct = choice.HasValue && int.TryParse(current.answer.Trim(), out int ai) && choice.Value == ai;
                }
                else if (IsSelfEvalType(current))
                {
                    // 自评模式：玩家对照折叠答案自评（v1 计算/证明/填空无机器判分）
                    correct = choice.HasValue && choice.Value == 0;
                }
            }

            // 防作弊：主动展开过的题，最终判定恒为 wrong（Correctness Property 7）
            if (manualRevealed) correct = false;

            // 连对计数与暴击（R3.4：连对 3 题 +1 果实）
            if (correct && !manualRevealed)
            {
                combo++;
                if (combo % 3 == 0 && OnCrit != null) OnCrit();
            }
            else
            {
                combo = 0;
            }

            // 记录 reveal_log
            if (manualRevealed && save != null && current != null)
            {
                if (save.revealLog == null) save.revealLog = new Dictionary<string, RevealRecord>();
                if (!save.revealLog.TryGetValue(current.id, out var rec))
                {
                    rec = new RevealRecord();
                    save.revealLog[current.id] = rec;
                }
                rec.count++;
                rec.last = DateTime.Now.ToString("yyyy-MM-dd");
            }

            // 答题日志（R10）
            if (save != null && current != null)
                RecordAnswerLog(save, current, correct);

            phase = QuizPhase.Judged;

            var result = new ReviewResult
            {
                questionId = current?.id,
                correct = correct,
                manualReveal = manualRevealed,
                answerText = current?.answer,
                explanation = current?.explanation,
                answerSource = current?.answerSource,
            };

            if (OnAnswerSubmitted != null) OnAnswerSubmitted(correct);
            return result;
        }

        void RecordAnswerLog(GameSave save, Question q, bool correct)
        {
            save.EnsureV3Fields();
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            save.dailyAnswers[today] = save.dailyAnswers.GetValueOrDefault(today) + 1;

            if (Context == "farm")
            {
                save.envAnswers++;
                if (correct) save.envCorrect++;
            }
            else
            {
                // 闯关：按章节统计（R10.2）
                string chapId = null;
                if (!string.IsNullOrEmpty(q.kpId) && BankRef != null)
                    chapId = BankRef.GetChapterOfKp(q.kpId);
                if (chapId != null)
                {
                    if (!save.chapterStats.TryGetValue(chapId, out var st))
                    {
                        st = new ChapterAnswerStat();
                        save.chapterStats[chapId] = st;
                    }
                    st.total++;
                    if (correct) st.correct++;
                }
            }
        }

        public ChallengeAnswer SubmitChallenge(int? choice, GameSave save)
        {
            var r = Submit(choice, save);
            return new ChallengeAnswer
            {
                questionId = r.questionId,
                correct = r.correct,
                counted = true,
                manualReveal = r.manualReveal,
            };
        }

        public void Next(Question q, GameSave save)
        {
            Present(q);
        }
    }
}
