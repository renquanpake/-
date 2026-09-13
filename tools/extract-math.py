"""
extract-math.py — 从 750 题 PDF 提取题目 + 答案，输出 JSON。
用法：python3 tools/extract-math.py
输出：tools/extracted/math750.json
"""
import json
import os
import re
import warnings

warnings.filterwarnings("ignore")
from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "高等数学下册精选750题_文本版.pdf")
OUT = os.path.join(ROOT, "tools", "extracted", "math750.json")

BOOK = "高等数学下册精选750题"


def full_text():
    r = PdfReader(PDF)
    pages = []
    for i, p in enumerate(r.pages):
        t = p.extract_text() or ""
        # 去掉页眉 "目录 N"
        t = re.sub(r"^目录\s*\d+\s*$", "", t, flags=re.M).strip()
        pages.append((i + 1, t))
    return pages


def find_answer_section(pages):
    """找答案区起始页：'1 答案' 块出现的页面。"""
    for i, t in pages:
        if re.search(r"\n1\s*答案\s*\n", t):
            return i
    return None


def split_questions(pages, ans_page):
    """把题目区文本按题号切分。
    题目格式（两种）：
      'NN （基础题/中等题/综合题）'
      'NN 基础题/中等题/综合题'
    返回 {num: {stem, difficulty, page}}
    """
    q_re = re.compile(r"(\d{1,4})\s+[（(]?\s*(基础题|中等题|综合题)", re.M)
    qtext = "\n".join(t for i, t in pages if i < ans_page)
    matches = list(q_re.finditer(qtext))
    questions = {}
    for idx, m in enumerate(matches):
        num = int(m.group(1))
        diff = m.group(2)
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(qtext)
        stem = qtext[start:end].strip()
        # 去掉题号前缀
        stem = q_re.sub("", stem, count=1).strip()
        # 去掉章节标题混入（如 '第三节 平面与方程'）
        questions[num] = {"stem": stem, "difficulty": diff}
    return questions, qtext


def extract_answers(pages, ans_page):
    """从答案区提取 {num: solution_text}。
    答案块格式：'N 答案' 后跟 '解 ...' 直到下一个 'N 答案' 块或页尾。
    """
    atext = "\n".join(t for i, t in pages if i >= ans_page)
    blocks = list(re.finditer(r"\n(\d{1,4})\s*答案\s*\n", atext))
    answers = {}
    for idx, m in enumerate(blocks):
        num = int(m.group(1))
        start = m.end()
        end = blocks[idx + 1].start() if idx + 1 < len(blocks) else len(atext)
        sol = atext[start:end].strip()
        # 去掉 [图: ...] OCR 注释
        sol = re.sub(r"\[图:[^\]]*\]", "", sol).strip()
        answers[num] = sol
    return answers


def detect_type(stem):
    """判断题型：single（有 ABCD 选项）/ proof（证明题）/ calc（计算题）。"""
    if re.search(r"[（(]\s*A\s*[）)]", stem) and re.search(r"[（(]\s*D\s*[）)]", stem):
        return "single"
    if stem.startswith("证明") or "证明" in stem[:20]:
        return "proof"
    return "calc"


def diff_to_score(diff):
    return {"基础题": 1, "中等题": 2, "综合题": 3}.get(diff, 2)


def main():
    pages = full_text()
    ans_page = find_answer_section(pages)
    print(f"answer section starts at page {ans_page}")

    questions, _ = split_questions(pages, ans_page)
    answers = extract_answers(pages, ans_page)
    print(f"questions: {len(questions)}, answers: {len(answers)}")

    matched = 0
    out = []
    for num in sorted(questions.keys()):
        q = questions[num]
        has_ans = num in answers
        if has_ans:
            matched += 1
        out.append({
            "num": num,
            "stem": q["stem"][:2000],
            "difficulty": diff_to_score(q["difficulty"]),
            "diff_label": q["difficulty"],
            "type": detect_type(q["stem"]),
            "has_answer": has_ans,
            "answer_text": answers.get(num, "")[:2000],
            "needs_review": not has_ans,
        })

    match_rate = matched / len(out) * 100 if out else 0
    print(f"match rate: {matched}/{len(out)} = {match_rate:.1f}%")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"book": BOOK, "total": len(out), "matched": matched,
                   "match_rate": round(match_rate, 2), "questions": out},
                  f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
