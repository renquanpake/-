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

            Save = saveSystem.Load();
            questionBank.Init(Save);
            scheduler.Init(Save);
            economy.Init(Save);
            farm.Init(Save);
            quiz.Init();
        }

        public void SaveAndPersist() => saveSystem.Save(Save);

        public void GoToScene(GameScene s)
        {
            SaveAndPersist();
            Application.LoadScene((int)s);
        }
    }
}
