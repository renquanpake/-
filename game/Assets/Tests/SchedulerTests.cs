// SchedulerTests.cs — SM-2 Lite 间隔序列单测
using NUnit.Framework;
using StudyFarm.Data;

namespace StudyFarm.Tests
{
    [TestFixture]
    public class SchedulerTests
    {
        [Test]
        public void IntervalSequence_OnCorrect()
        {
            var s = new Core.Scheduler();
            var save = new GameSave();

            // 第一次答对：interval 0→1
            var p1 = s.OnAnswer("kp1", true, save);
            Assert.AreEqual(1, p1.newInterval);

            // 第二次答对：interval 1→3
            var p2 = s.OnAnswer("kp1", true, save);
            Assert.AreEqual(3, p2.newInterval);

            // 第三次答对：3 * ease(2.25) = 6.75 → 7
            var p3 = s.OnAnswer("kp1", true, save);
            Assert.AreEqual(7, p3.newInterval);
        }

        [Test]
        public void WrongAnswer_ResetsIntervalToOne()
        {
            var s = new Core.Scheduler();
            var save = new GameSave();
            s.OnAnswer("kp1", true, save);
            s.OnAnswer("kp1", true, save);
            var p = s.OnAnswer("kp1", false, save);
            Assert.AreEqual(1, p.newInterval);
            Assert.AreEqual(2.2f, p.newEase, 0.01f);
        }

        [Test]
        public void NextDue_AlwaysGreaterThanNow()
        {
            var s = new Core.Scheduler();
            var save = new GameSave();
            var p = s.OnAnswer("kp1", true, save);
            long now = System.DateTimeOffset.Now.ToUnixTimeSeconds();
            Assert.Greater(p.nextDueUnix, now);
        }

        [Test]
        public void GrowthReachesHarvest()
        {
            var s = new Core.Scheduler();
            var save = new GameSave();
            bool canHarvest = false;
            for (int i = 0; i < 5; i++)
            {
                var p = s.OnAnswer("kp1", true, save);
                canHarvest = p.canHarvest;
            }
            Assert.IsTrue(canHarvest);
        }

        [Test]
        public void EaseCappedAt28()
        {
            var s = new Core.Scheduler();
            var save = new GameSave();
            for (int i = 0; i < 20; i++)
                s.OnAnswer("kp1", true, save);
            var p = s.OnAnswer("kp1", true, save);
            Assert.LessOrEqual(p.newEase, 2.8f);
        }
    }

    [TestFixture]
    public class QuizControllerTests
    {
        [Test]
        public void ManualReveal_ForcesWrong()
        {
            var q = new Core.QuizController();
            var save = new GameSave();
            var question = new Question
            {
                id = "q1",
                type = "judge",
                stem = "test",
                answer = "0",
            };
            q.Present(question);
            q.RevealAnswer(); // 主动展开
            var r = q.Submit(0, save); // 即使选对了
            Assert.IsFalse(r.correct, "主动展开后强制判负");
            Assert.IsTrue(r.manualReveal);
        }

        [Test]
        public void JudgeQuestion_CorrectChoice()
        {
            var q = new Core.QuizController();
            var save = new GameSave();
            q.Present(new Question { id = "q1", type = "judge", answer = "1" });
            var r = q.Submit(1, save);
            Assert.IsTrue(r.correct);
        }
    }

    [TestFixture]
    public class SaveSystemTests
    {
        [Test]
        public void RoundTrip()
        {
            var sys = new Core.SaveSystem();
            var s = new GameSave();
            s.fruit = 100;
            s.crops.Add(new CropState { kpId = "kp1", growth = 3 });
            sys.Save(s);

            var loaded = sys.Load();
            Assert.AreEqual(100, loaded.fruit);
            Assert.AreEqual(1, loaded.crops.Count);
            Assert.AreEqual("kp1", loaded.crops[0].kpId);
        }
    }
}
