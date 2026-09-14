// ExtendedTests.cs — 补完功能单测（streak/经济掉落/统计/自评/存档迁移）
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using StudyFarm.Data;
using StudyFarm.Core;

namespace StudyFarm.Tests
{
    [TestFixture]
    public class StreakControllerTests
    {
        StreakController streak = new StreakController();

        GameSave NewSave()
        {
            var s = new GameSave();
            s.EnsureV3Fields();
            s.inventory["potion"] = 1;
            return s;
        }

        [Test]
        public void FirstActivity_StreakOneAndSigninReward()
        {
            var s = NewSave();
            int fruitBefore = s.fruit;
            streak.OnActive(s);
            Assert.AreEqual(1, s.streak.current);
            Assert.AreEqual(fruitBefore + 5, s.fruit, "签到奖励 +5");
        }

        [Test]
        public void NextDayActive_StreakIncrements()
        {
            var s = NewSave();
            s.streak.lastActiveDate = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            s.streak.current = 2;
            streak.OnActive(s);
            Assert.AreEqual(3, s.streak.current);
        }

        [Test]
        public void GapDays_ZeroThenRestartToOne()
        {
            var s = NewSave();
            s.streak.lastActiveDate = DateTime.Now.AddDays(-3).ToString("yyyy-MM-dd");
            s.streak.current = 5;
            s.streak.best = 5;
            streak.OnActive(s);
            Assert.AreEqual(1, s.streak.current, "断档后今天算第 1 天");
            Assert.AreEqual(5, s.streak.preZeroStreak, "记录清零前值");
            Assert.GreaterOrEqual(s.streak.zeroedAtUnix, 1);
            Assert.AreEqual(5, s.streak.best, "best 不变");
        }

        [Test]
        public void Rescue_RestoresPreZeroStreakWithin48h()
        {
            var s = NewSave();
            s.streak.preZeroStreak = 9;
            s.streak.zeroedAtUnix = DateTimeOffset.Now.ToUnixTimeSeconds() - 3600;
            s.streak.current = 1;
            s.streak.lastActiveDate = DateTime.Now.ToString("yyyy-MM-dd");
            Assert.IsTrue(streak.UseRescue(s), "48h 窗口内可用");
            Assert.AreEqual(9, s.streak.current, "恢复到清零前");
            Assert.AreEqual(0, s.inventory["potion"], "药剂扣 1");
            Assert.IsTrue(s.streak.rescueMonth == DateTime.Now.ToString("yyyy-MM"), "月度锁定");
        }

        [Test]
        public void Rescue_RejectedOutside48h()
        {
            var s = NewSave();
            s.streak.preZeroStreak = 9;
            s.streak.zeroedAtUnix = DateTimeOffset.Now.ToUnixTimeSeconds() - 72 * 3600;
            Assert.IsFalse(streak.UseRescue(s), "超 48h 不可用");
            Assert.AreEqual(1, s.inventory["potion"], "药剂不扣");
        }

        [Test]
        public void Rescue_RejectedWhenNoPotion()
        {
            var s = NewSave();
            s.inventory["potion"] = 0;
            s.streak.preZeroStreak = 9;
            s.streak.zeroedAtUnix = DateTimeOffset.Now.ToUnixTimeSeconds();
            Assert.IsFalse(streak.UseRescue(s), "无药剂不可用");
        }

        [Test]
        public void Rescue_MonthlyLimit()
        {
            var s = NewSave();
            s.streak.rescueMonth = DateTime.Now.ToString("yyyy-MM");
            s.streak.preZeroStreak = 9;
            s.streak.zeroedAtUnix = DateTimeOffset.Now.ToUnixTimeSeconds();
            Assert.IsFalse(streak.UseRescue(s), "当月已用过则拒绝");

            // 跨月后可再次使用
            s.streak.rescueMonth = "0000-00";
            s.streak.preZeroStreak = 4;
            Assert.IsTrue(streak.UseRescue(s), "跨月后不限");
        }

        [Test]
        public void Milestone7Days_30Fruit()
        {
            var s = NewSave();
            s.streak.current = 6;
            s.streak.lastActiveDate = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            int before = s.fruit;
            streak.OnActive(s);
            Assert.AreEqual(7, s.streak.current);
            Assert.AreEqual(before + 5 + 30, s.fruit, "签到 5 + 里程碑 30");
        }

        [Test]
        public void Milestone30Days_RareSeed()
        {
            var s = NewSave();
            s.streak.current = 29;
            s.streak.lastActiveDate = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            streak.OnActive(s);
            Assert.AreEqual(1, s.inventory.GetValueOrDefault("rare_seed"));
        }
    }

    [TestFixture]
    public class EconomyControllerTests
    {
        [Test]
        public void RandomDrop_LegendaryLimitedToOncePer30Days()
        {
            var econ = new EconomyController();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.lastLegendaryDropUnix = DateTimeOffset.Now.ToUnixTimeSeconds();

            // 限流期内无论如何 roll 都不会出传说
            for (int i = 0; i < 200; i++)
            {
                string d = econ.RandomDrop(s);
                Assert.IsFalse(d == "legendary_seed", "30 天限流期内不得出传说");
            }

            // 31 天前掉过传说 → 允许再出
            s.lastLegendaryDropUnix = DateTimeOffset.Now.AddDays(-31).ToUnixTimeSeconds();
            s.inventory.Clear();
            bool got = false;
            for (int i = 0; i < 500; i++)
            {
                if (econ.RandomDrop(s) == "legendary_seed") { got = true; break; }
            }
            Assert.IsTrue(got, "限流期外应能出传说");
            Assert.AreEqual(1, s.inventory["legendary_seed"], "掉落写入 inventory");
        }

        [Test]
        public void BuySeed_BalanceUnchangedWhenInsufficient()
        {
            var econ = new EconomyController();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.fruit = 3;
            int invBefore = s.inventory["seed_common"];
            Assert.IsFalse(econ.BuySeed(s));
            Assert.AreEqual(3, s.fruit, "余额不变");
            Assert.AreEqual(invBefore, s.inventory["seed_common"], "库存不变");
        }

        [Test]
        public void GrantLevelUpgrade_PaysPerStar()
        {
            var econ = new EconomyController();
            var s = new GameSave();
            s.EnsureV3Fields();
            econ.GrantLevelUpgrade(s, 2);
            Assert.AreEqual(40, s.fruit, "每升 1 星 +20");
        }

        [Test]
        public void GrantHarvest_AddsYieldByRarity()
        {
            var econ = new EconomyController();
            var s = new GameSave();
            s.EnsureV3Fields();
            econ.GrantHarvest(s, "kp1", "rare");
            Assert.AreEqual(40, s.fruit);
            Assert.IsTrue(s.mastered.Contains("kp1"));
        }
    }

    [TestFixture]
    public class QuizControllerExtTests
    {
        [Test]
        public void SelfEvalCalc_Choice0CountsCorrect()
        {
            var quiz = new QuizController();
            var s = new GameSave();
            s.EnsureV3Fields();
            quiz.Present(new Question { id = "c1", type = "calc", stem = "求 2+2", answer = "4" });
            var r = quiz.Submit(0, s);
            Assert.IsTrue(r.correct, "自评做对 → 计对");
            var r2 = quiz.Submit(1, s);
            Assert.IsFalse(r2.correct, "自评未做对 → 计错");
        }

        [Test]
        public void Combo3TriggersCrit()
        {
            var quiz = new QuizController();
            int crits = 0;
            quiz.OnCrit = () => crits++;
            var s = new GameSave();
            s.EnsureV3Fields();
            for (int i = 0; i < 3; i++)
                quiz.Submit(0, s); // judge 题默认判对路径：用 single
            // 重新走 3 连对（single）
            quiz.Init();
            for (int i = 0; i < 3; i++)
            {
                quiz.Present(new Question { id = "q" + i, type = "single", answer = "0" });
                quiz.Submit(0, s);
            }
            Assert.AreEqual(1, crits);
        }

        [Test]
        public void FarmContext_LogsEnvAnswers()
        {
            var quiz = new QuizController();
            quiz.Context = "farm";
            var s = new GameSave();
            s.EnsureV3Fields();
            quiz.Present(new Question { id = "e1", type = "judge", answer = "1", kpId = "env.ch01.kp01" });
            quiz.Submit(1, s);
            Assert.AreEqual(1, s.envAnswers);
            Assert.AreEqual(1, s.envCorrect);
            Assert.AreEqual(1, s.dailyAnswers[DateTime.Now.ToString("yyyy-MM-dd")]);
        }

        [Test]
        public void ChallengeContext_LogsChapterStats()
        {
            var bank = new QuestionBank();
            var quiz = new QuizController();
            quiz.Context = "challenge";
            quiz.BankRef = bank;
            // 直接给 bank 塞 kp→chapter 映射（不读文件）
            bank.KpToChapter["math.ch08.kp01"] = "math.ch08";
            var s = new GameSave();
            s.EnsureV3Fields();
            quiz.Present(new Question { id = "m1", type = "single", answer = "0", kpId = "math.ch08.kp01" });
            quiz.Submit(0, s);
            quiz.Present(new Question { id = "m2", type = "single", answer = "9", kpId = "math.ch08.kp01" });
            quiz.Submit(0, s);
            var st = s.chapterStats["math.ch08"];
            Assert.AreEqual(2, st.total);
            Assert.AreEqual(1, st.correct);
        }

        [Test]
        public void ManualReveal_SelfEvalStillForcedWrong()
        {
            var quiz = new QuizController();
            var s = new GameSave();
            s.EnsureV3Fields();
            quiz.Present(new Question { id = "c1", type = "calc", answer = "4" });
            quiz.RevealAnswer();
            var r = quiz.Submit(0, s); // 自评做对也强制负
            Assert.IsFalse(r.correct, "主动展开后自评做对仍判负");
            Assert.IsTrue(r.manualReveal);
        }
    }

    [TestFixture]
    public class StatsControllerTests
    {
        [Test]
        public void EnvStat_UsesRealLog()
        {
            var stats = new StatsController();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.envAnswers = 10;
            s.envCorrect = 7;
            s.crops.Add(new CropState { kpId = "k1", state = "withered" });
            var st = stats.GetEnvStat(s);
            Assert.AreEqual(10, st.answered);
            Assert.AreEqual(7, st.correct);
            Assert.AreEqual(0.7, st.correctRate, 0.001);
            Assert.AreEqual(1, st.withered);
        }

        [Test]
        public void ChallengeStat_ChapterRates()
        {
            var stats = new StatsController();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.chapterStats["math.ch08"] = new ChapterAnswerStat { total = 10, correct = 9 };
            s.levels["math.ch08.lv01"] = new LevelProgress { stars = 3, cleared = true };
            s.levels["math.ch08.lv02"] = new LevelProgress { stars = 1, cleared = true };
            var st = stats.GetChallengeStat(s);
            Assert.AreEqual(2, st.clearedLevels);
            Assert.AreEqual(4, st.totalStars);
            Assert.AreEqual(0.9, st.chapterRates["math.ch08"], 0.001);
        }

        [Test]
        public void Last7Days_ReadsDailyAnswers()
        {
            var stats = new StatsController();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.dailyAnswers[DateTime.Now.ToString("yyyy-MM-dd")] = 5;
            s.dailyAnswers[DateTime.Now.AddDays(-2).ToString("yyyy-MM-dd")] = 3;
            var days = stats.Last7Days(s);
            Assert.AreEqual(7, days.Count);
            Assert.AreEqual(5, days[6].count, "今天 5");
            int total = days.Sum(d => d.count);
            Assert.AreEqual(8, total);
        }
    }

    [TestFixture]
    public class SaveSystemMigrationTests
    {
        [Test]
        public void V2Save_MigratesToV3()
        {
            var sys = new SaveSystem();
            // 手工造一个 v2 档（无 v3 字段）
            var v2 = new GameSave();
            v2.schemaVersion = 2;
            v2.fruit = 42;
            v2.crops.Add(new CropState { kpId = "k1", growth = 2 });
            string v2Json = UnityEngine.JsonUtility.ToJson(v2);
            // 注入低版本 schemaVersion（ToJson 后手动改数字）
            v2Json = v2Json.Replace("\"schemaVersion\":3", "\"schemaVersion\":2");
            System.IO.File.WriteAllText(sys.SavePath, v2Json);

            var loaded = sys.Load();
            Assert.AreEqual(3, loaded.schemaVersion, "迁移到 v3");
            Assert.AreEqual(42, loaded.fruit);
            Assert.IsNotNull(loaded.chapterStats, "v3 字段初始化");
            Assert.IsNotNull(loaded.dailyAnswers, "v3 字段初始化");
            Assert.AreEqual(1, loaded.crops.Count);
        }

        [Test]
        public void CorruptSave_RollsBackToBackup()
        {
            var sys = new SaveSystem();
            var s = new GameSave();
            s.EnsureV3Fields();
            s.fruit = 100;
            sys.Save(s); // 建立备份
            System.IO.File.WriteAllText(sys.SavePath, "{corrupt json");
            var loaded = sys.Load();
            Assert.AreEqual(100, loaded.fruit, "回滚到最近备份");
        }
    }

    [TestFixture]
    public class QuestionBankTests
    {
        [Test]
        public void LoadsRealQuestionBanks()
        {
            // 读真实 StreamingAssets 题库（stub 里已拷贝）
            var bank = new QuestionBank();
            var s = new GameSave();
            s.EnsureV3Fields();
            bank.Init(s);
            Assert.AreEqual(0, bank.LoadErrors.Count, "无加载错误: " + string.Join(";", bank.LoadErrors));
            Assert.GreaterOrEqual(bank.Questions.Count, 705);
            // camelCase 键解析验证（关键回归：snake_case 会导致 kpId 全空）
            var kpsWithLink = bank.Questions.Values.Count(q => !string.IsNullOrEmpty(q.kpId));
            Assert.AreEqual(bank.Questions.Count, kpsWithLink, "所有题 kpId 非空");
            // 关卡引用
            var levels = bank.GetLevels("math.ch08");
            Assert.GreaterOrEqual(levels.Count, 1);
            int totalQ = levels.Sum(l => l.questionIds.Count);
            Assert.GreaterOrEqual(totalQ, 10);
            // 章节映射
            Assert.AreEqual("math.ch08", bank.GetChapterOfKp("math.ch08.kp01"));
        }

        [Test]
        public void DrawQuestion_RespectsRecentExclusion()
        {
            var bank = new QuestionBank();
            var s = new GameSave();
            s.EnsureV3Fields();
            bank.Init(s);
            // 挑一个有 3+ 道题的 kp（每题池大小 >= 3 时近 5 次去重才有可观察差异）
            string kpId = null;
            var poolSize = new Dictionary<string, int>();
            foreach (var q in bank.Questions.Values)
            {
                if (!string.IsNullOrEmpty(q.kpId))
                    poolSize[q.kpId] = poolSize.GetValueOrDefault(q.kpId) + 1;
            }
            foreach (var kv in poolSize)
            {
                if (kv.Value >= 3) { kpId = kv.Key; break; }
            }
            if (kpId == null)
            {
                // 每个 kp 只挂 1 题 → 去重语义退化为反复抽同一题，仅验证可抽题
                kpId = bank.Questions.Values.First().kpId;
                var q = bank.DrawQuestion(kpId, s);
                Assert.IsNotNull(q, "题池非空");
                return;
            }
            var ids = new List<string>();
            for (int i = 0; i < 30; i++)
            {
                var q = bank.DrawQuestion(kpId, s);
                if (q != null) ids.Add(q.id);
            }
            int pool = poolSize[kpId];
            Assert.AreEqual(30, ids.Count, "题池非空");
            // 近 5 次去重：同一题被抽中后 5 轮内不会再出现，单题最多约 6 次
            int maxFreq = ids.GroupBy(x => x).Max(g => g.Count());
            Assert.LessOrEqual(maxFreq, 7);
        }
    }

    [TestFixture]
    public class ChallengeSessionTests
    {
        [Test]
        public void StarUpgrade_PaysDiff()
        {
            var quiz = new QuizController();
            var econ = new EconomyController();
            var session = new Challenge.ChallengeSessionController(quiz, econ);
            Challenge.QuestionBankStatic.Bind(null);

            var s = new GameSave();
            s.EnsureV3Fields();

            var lv = new Data.Level
            {
                id = "math.ch08.lv01",
                name = "第1关",
                questionIds = new System.Collections.Generic.List<string> { "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10" },
                passRate = 0.5f, star2Rate = 0.7f, star3Rate = 0.9f,
                isBoss = false,
                reward = new Data.LevelReward { fruit = 30, seeds = 2 },
            };

            // 首通 90% → 3 星
            s.levels[lv.id] = new Data.LevelProgress { stars = 3, cleared = true }; // 模拟已有 3 星
            var lv2 = new Data.Level
            {
                id = "math.ch08.lv02",
                name = "第2关",
                questionIds = new System.Collections.Generic.List<string> { "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10" },
                passRate = 0.5f, star2Rate = 0.7f, star3Rate = 0.9f,
                reward = new Data.LevelReward { fruit = 30, seeds = 2 },
            };
            s.levels[lv2.id] = new Data.LevelProgress { stars = 1, cleared = true };
            int fruitBefore = s.fruit;
            // 直接走 Finish 前准备：先 Start 关卡
            session.Start(lv2, s);
            // 答对 8/10 → 2 星（补差 1 星 +20）
            for (int i = 0; i < 8; i++)
                session.Submit(0, s); // single 题 answer 未知，q1 未入 bank → correct=false 全 0
            // 全部判错 → rate 0 → 未通关，不发奖励。改为 mock bank：
            var bank = new QuestionBank();
            for (int i = 1; i <= 10; i++)
                bank.Questions["q" + i] = new Data.Question { id = "q" + i, type = "single", answer = "0", kpId = "math.ch08.kp01" };
            bank.KpToChapter["math.ch08.kp01"] = "math.ch08";
            Challenge.QuestionBankStatic.Bind(bank);
            quiz.BankRef = bank;
            session.Start(lv2, s);
            for (int i = 0; i < 8; i++) session.Submit(0, s);
            for (int i = 0; i < 2; i++) session.Submit(1, s); // 答错
            var res = session.Finish(s);
            Assert.AreEqual(2, res.stars);
            Assert.AreEqual(0.8f, res.rate, 0.001);
            Assert.IsTrue(s.levels[lv2.id].cleared);
            Assert.AreEqual(2, s.levels[lv2.id].stars, "2 星 > 旧 1 星");
            // 补差奖励 = (2-1)*20 = 20
            Assert.AreEqual(fruitBefore + 20, s.fruit, "星级提升补差 +20（含首通? 旧档已 cleared，只发补差）");
        }
    }
}
