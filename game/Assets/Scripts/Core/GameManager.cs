// GameManager.cs — 全局单例状态，场景切换路由
using UnityEngine;
using StudyFarm.Data;
using StudyFarm.Core;

namespace StudyFarm.Core
{
    public enum GameScene { Boot, Farm, Challenge, Shop, Stats }

    public class GameManager : MonoBehaviour
    {
        public static GameManager I { get; private set; }

        [SerializeField] SaveSystem saveSystem;
        [SerializeField] QuestionBank questionBank;
        [SerializeField] Scheduler scheduler;
        [SerializeField] EconomyController economy;
        [SerializeField] FarmController farm;
        [SerializeField] QuizController quiz;

        public StreakController Streak { get; private set; }
        public StatsController Stats { get; private set; }

        public GameSave Save { get; private set; }
        public QuestionBank Bank { get => questionBank; }
        public Scheduler Sched { get => scheduler; }
        public EconomyController Econ { get => economy; }
        public FarmController Farm { get => farm; }
        public QuizController Quiz { get => quiz; }

        void Awake()
        {
            if (I != null) { Destroy(gameObject); return; }
            I = this;
            DontDestroyOnLoad(gameObject);

            // 子系统未挂引用时自动创建（编辑器里忘拖引用也能跑）
            if (saveSystem == null) saveSystem = new SaveSystem();
            if (questionBank == null) questionBank = new QuestionBank();
            if (scheduler == null) scheduler = new Scheduler();
            if (economy == null) economy = new EconomyController();
            if (farm == null) farm = new FarmController();
            if (quiz == null) quiz = new QuizController();
            Streak = new StreakController();
            Stats = new StatsController();

            Save = saveSystem.Load();

            // 题库加载（R1.1/R1.2）
            questionBank.Init(Save);
            questionBank.LogSourceValidation(); // R1.4 source 缺失清单
            if (questionBank.LoadErrors.Count > 0)
                Debug.LogWarning("题库加载警告:\n" + string.Join("\n", questionBank.LoadErrors));

            // 把题库单例绑定给闯关会话静态桥
            var session = StudyFarm.Challenge.ChallengeSessionControllerStatic.GetOrCreate(quiz, economy);
            session.BindBank(questionBank);

            // 暴击 / 签到接线
            quiz.BankRef = questionBank;
            quiz.OnCrit = () =>
            {
                economy.GrantCrit(Save);
                SaveAndPersist();
            };
            quiz.OnAnswerSubmitted = (ok) =>
            {
                Streak.OnActive(Save); // R7.1 浇水与闯关答题均计入活跃
                SaveAndPersist();
            };

            scheduler.Init(Save);
            scheduler.MarkWithered(Save); // R4.3 启动时置蔫萎态
            economy.Init(Save);
            farm.Init(Save);
            quiz.Init();

            if (questionBank.LoadErrors.Count > 0)
                SaveAndPersist();
        }

        public void SaveAndPersist() => saveSystem.Save(Save);

        public void GoToScene(GameScene s)
        {
            SaveAndPersist();
            Application.LoadScene((int)s);
        }
    }
}
