// LevelMapController.cs — 章节地图渲染与路由（节点/星级/boss 锁定态）
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using StudyFarm.Data;
using StudyFarm.Core;

namespace StudyFarm.Challenge
{
    public class LevelMapController : MonoBehaviour
    {
        [Header("UI")]
        [SerializeField] Transform levelRoot;
        [SerializeField] GameObject levelNodePrefab;
        [SerializeField] Text chapterTitle;

        readonly Dictionary<string, LevelNodeView> nodes = new Dictionary<string, LevelNodeView>();
        QuestionBank bank;
        GameSave save;

        public void Init(QuestionBank b, GameSave s)
        {
            bank = b;
            save = s;
        }

        // 渲染某一章的关卡节点
        public void RenderChapter(string chapterId, string chapterName)
        {
            chapterTitle.text = chapterName;
            foreach (var t in nodes.Values) if (t != null) Destroy(t.gameObject);
            nodes.Clear();

            var levels = bank.GetLevels(chapterId);
            int x = 40;
            foreach (var lv in levels)
            {
                var go = Instantiate(levelNodePrefab, levelRoot);
                var v = go.GetComponent<LevelNodeView>();
                v.Init(lv, GetProgress(lv.id), IsBossUnlocked(chapterId, levels), lv.isBoss);
                v.transform.localPosition = new Vector3(x, 0, 0);
                v.onClick.AddListener(() => { EnterLevel(lv); });
                nodes[lv.id] = v;
                x += 120;
            }
        }

        // 章节全 3 星 → 解锁 boss 关与章末宝箱（R11.9）
        bool IsBossUnlocked(string chapterId, List<Level> levels)
        {
            foreach (var lv in levels)
            {
                if (lv.isBoss) continue;
                if (!save.levels.TryGetValue(lv.id, out var p) || p.stars < 3)
                    return false;
            }
            return true;
        }

        LevelProgress GetProgress(string levelId) =>
            save.levels.TryGetValue(levelId, out var p) ? p : new LevelProgress();

        // 进入关卡：未解锁（前关未通关）则拒绝
        public bool EnterLevel(Level lv)
        {
            // boss 关需章节解锁
            if (lv.isBoss)
            {
                var levels = bank.GetLevels(lv.id.Substring(0, lv.id.LastIndexOf('.')));
                if (!IsBossUnlocked(levels[0].id, levels)) return false;
            }
            var quiz = Core.GameManager.I?.Quiz;
            var econ = Core.GameManager.I?.Econ;
            var session = ChallengeSessionControllerStatic.GetOrCreate(quiz, econ);
            session.Start(lv, save);
            Core.GameManager.I.GoToScene(GameScene.Challenge);
            return true;
        }
    }

    public class LevelNodeView : MonoBehaviour
    {
        [SerializeField] Text nameText;
        [SerializeField] Text starText;
        [SerializeField] Image lockIcon;
        Level level;
        public UnityEngine.Events.UnityEvent onClick;

        public void Init(Level lv, LevelProgress prog, bool bossUnlocked, bool isBoss)
        {
            level = lv;
            nameText.text = lv.name;
            starText.text = "★".Repeat(prog.stars) + "☆".Repeat(3 - prog.stars);
            bool locked = isBoss && !bossUnlocked;
            if (lockIcon != null) lockIcon.gameObject.SetActive(locked);
        }
    }

    public static class ChallengeSessionControllerStatic
    {
        static ChallengeSessionController session;
        public static ChallengeSessionController GetOrCreate(QuizController q, EconomyController e)
        {
            if (session == null) session = new ChallengeSessionController(q, e);
            return session;
        }
        public static void Start(Level lv, GameSave s) => session?.Start(lv, s);
    }

    public static class StringExt
    {
        public static string Repeat(this string s, int n)
        {
            if (n <= 0) return "";
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < n; i++) sb.Append(s);
            return sb.ToString();
        }
    }
}
