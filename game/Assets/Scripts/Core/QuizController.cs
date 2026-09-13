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

        public Question Current { get => current; }
        public QuizPhase Phase { get => phase; }
        public bool ManualRevealed { get => manualRevealed; }

        public void Init()
        {
            phase = QuizPhase.ShowingQuestion;
            current = null;
            manualRevealed = false;
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

        // 提交作答。choice: 单选/判断题的选项索引；填空题传 null（文本作答简化为判通过）
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
                else
                {
                    // calc/blank/proof：v1 无法自动判分，manualReveal 强制负；否则默认不计分（counted）
                    correct = false;
                }
            }

            // 防作弊：主动展开过的题，最终判定恒为 wrong（Correctness Property 7）
            if (manualRevealed) correct = false;

            // 记录 reveal_log
            if (manualRevealed && save != null)
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

            phase = QuizPhase.Judged;

            return new ReviewResult
            {
                questionId = current?.id,
                correct = correct,
                manualReveal = manualRevealed,
                answerText = current?.answer,
                answerSource = current?.RawAnsSrc,
            };
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
