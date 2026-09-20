// QuestionModels.cs — 题库数据模型（对应 StreamingAssets/questionbank/*.json）
using System.Collections.Generic;

namespace StudyFarm.Data
{
    [System.Serializable]
    public class Source
    {
        public string book;
        public string chapter;
        public string section;
        public string page;
        public int no;
        public bool HasContent() => !string.IsNullOrEmpty(book);
    }

    public class Question
    {
        public string id;
        public int num;
        public string kpId;
        public string type;   // single / multi / judge / blank / calc / proof
        public string stem;
        public List<string> options;
        public string answer;
        public string answerKey; // 机判键：答案首行结论（可空，空则自评）
        public string explanation;
        public int difficulty;
        public Source source;
        public Source answerSource;
        public bool needsReview;
    }

    public class KnowledgePoint
    {
        public string id;
        public string name;
        public string summary;
        public string cropRarity; // common / rare / epic / legendary
        public Source source;
        public int linkedQuestionCount;
    }

    public class Level
    {
        public string id;
        public string name;
        public List<string> questionIds;
        public float passRate;
        public float star3Rate;
        public float star2Rate;
        public bool isBoss;
        public LevelReward reward;
    }

    public struct LevelReward
    {
        public int fruit;
        public int seeds;
    }

    public class Chapter
    {
        public string id;
        public string name;
        public List<Level> levels;
        public List<KnowledgePoint> knowledgePoints;
    }

    public class QuestionBankFile
    {
        public string subject;
        public string subjectName;
        public int version;
        public string sourceBook;
        public List<Chapter> chapters;
        public List<Question> questions;
    }
}
