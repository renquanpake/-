// QuizUI.cs — 答题界面：题面渲染、选项交互、答案折叠、提交
using UnityEngine;
using UnityEngine.UI;
using StudyFarm.Data;
using StudyFarm.Core;

namespace StudyFarm.UI
{
    public class QuizUI : MonoBehaviour
    {
        [Header("显示")]
        [SerializeField] Text stemText;
        [SerializeField] Text optionA;
        [SerializeField] Text optionB;
        [SerializeField] Text optionC;
        [SerializeField] Text optionD;
        [SerializeField] Button optionBtnA;
        [SerializeField] Button optionBtnB;
        [SerializeField] Button optionBtnC;
        [SerializeField] Button optionBtnD;
        [SerializeField] Text answerPanel;
        [SerializeField] Button revealBtn;      // 主动展开答案（折叠态可见）
        [SerializeField] Button nextBtn;

        QuizController quiz;
        GameManager gm;
        int? pendingChoice;

        public void Bind(QuizController q, GameManager g)
        {
            quiz = q;
            gm = g;
        }

        public void ShowQuestion(Question q)
        {
            stemText.text = q.stem;
            var opts = q.options ?? new System.Collections.Generic.List<string>();

            bool selfEval = Core.QuizController.IsSelfEvalStatic(q);
            if (selfEval)
            {
                // 计算/证明/填空自评模式（v1 无机器判分）
                optionA.text = "A. 我已独立做对";
                optionB.text = "B. 未做对（对照答案学习）";
                optionC.text = "";
                optionD.text = "";
                optionBtnA.gameObject.SetActive(true);
                optionBtnB.gameObject.SetActive(true);
                optionBtnC.gameObject.SetActive(false);
                optionBtnD.gameObject.SetActive(false);
            }
            else
            {
                optionA.text = opts.Count > 0 ? "A. " + opts[0] : "";
                optionB.text = opts.Count > 1 ? "B. " + opts[1] : "";
                optionC.text = opts.Count > 2 ? "C. " + opts[2] : "";
                optionD.text = opts.Count > 3 ? "D. " + opts[3] : "";
                optionBtnA.gameObject.SetActive(true);
                optionBtnB.gameObject.SetActive(true);
                optionBtnC.gameObject.SetActive(opts.Count > 2);
                optionBtnD.gameObject.SetActive(opts.Count > 3);
            }

            revealBtn.gameObject.SetActive(true);
            nextBtn.gameObject.SetActive(false);
            answerPanel.text = "";
            pendingChoice = null;

            optionBtnA.onClick.AddListener(() => OnOption(0));
            optionBtnB.onClick.AddListener(() => OnOption(1));
            optionBtnC.onClick.AddListener(() => OnOption(2));
            optionBtnD.onClick.AddListener(() => OnOption(3));
        }

        void OnOption(int i)
        {
            if (quiz.Phase != QuizPhase.ShowingQuestion) return;
            pendingChoice = i;
            // 等待"提交"或直接提交（v1：点选项即提交）
            DoSubmit(i);
        }

        void DoSubmit(int choice)
        {
            var r = quiz.Submit(choice, gm.Save);
            // 自动展开答案+解析+出处
            answerPanel.text = BuildAnswerPanel(r);
            revealBtn.gameObject.SetActive(false);
            nextBtn.gameObject.SetActive(true);
        }

        // 玩家主动展开（防作弊：该题强制判负）
        public void OnReveal()
        {
            if (quiz.Phase != QuizPhase.ShowingQuestion) return;
            quiz.RevealAnswer();
            var r = quiz.Submit(null, gm.Save); // 强制提交为 manualReveal
            answerPanel.text = BuildAnswerPanel(r) + "\n[已查看答案，本题不计分]";
            revealBtn.gameObject.SetActive(false);
            nextBtn.gameObject.SetActive(true);
        }

        string BuildAnswerPanel(ReviewResult r)
        {
            var s = new System.Text.StringBuilder();
            s.AppendLine("答案：").Append(r.answerText ?? "（无书面答案，待校对）");
            if (!string.IsNullOrWhiteSpace(r.explanation))
                s.Append("\n解析：").Append(r.explanation);
            if (r.answerSource != null && !string.IsNullOrEmpty(r.answerSource.page))
                s.Append("\n出处：").Append(r.answerSource.book).Append(' ').Append(r.answerSource.page);
            return s.ToString();
        }
    }
}
