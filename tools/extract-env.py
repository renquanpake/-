"""
extract-env.py — 从环工教材 PDF 提取知识点结构（章节/节 → 知识点，含页码出处），
并生成占位判断题（标记 needs_review，供农场练习模式运转）。
输出：tools/extracted/env.json
"""
import json
import os
import re
import warnings

warnings.filterwarnings("ignore")
from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENP = os.path.join(ROOT, "环境工程学_第三版_chunks_ocr.pdf")
EPP = os.path.join(ROOT, "环境工程原理_全文.pdf")
OUT = os.path.join(ROOT, "tools", "extracted", "env.json")


def parse_env_engineering():
    """从环工第三版目录提取章节/节结构。OCR 质量有限，用宽松正则。"""
    r = PdfReader(ENP)
    toc = "\n".join((r.pages[i].extract_text() or "") for i in range(min(8, len(r.pages))))
    # 去掉目录里的省略号/点线，保留章节名
    toc = re.sub(r"[…·.。]{2,}", " ", toc)
    toc = toc.replace("\n", " ")

    chapters = []
    # 章：第X章 名称 数字（页码）。名称可能含中文字符
    ch_re = re.compile(r"第([一二三四五六七八九十]+)章\s*([^\d第]{2,40}?)(\d{1,4})")
    # 去重（目录+正文重复）
    seen_ch = set()
    for cm in ch_re.finditer(toc):
        cn = "第" + cm.group(1) + "章"
        if cn in seen_ch:
            continue
        seen_ch.add(cn)
        raw = re.sub(r"\s+", "", cm.group(2))
        # 去掉尾部粘连的小节名（若含'节'字说明跨了，截断）
        raw = re.split(r"第[一二三四五六七八九十]节", raw)[0]
        chap_name = raw.strip()[:30]
        if not chap_name:
            continue
        chapters.append({"num": cn, "name": chap_name, "page": int(cm.group(3))})

    # 节：第X节 名称 数字
    sec_re = re.compile(r"第([一二三四五六七八九十]+)节\s*([^\d第]{2,40}?)(\d{1,4})")
    # 按章分配节（按出现顺序归到最近的章）
    sec_all = []
    for sm in sec_re.finditer(toc):
        raw = re.sub(r"\s+", "", sm.group(2))
        sec_all.append({"num": "第" + sm.group(1) + "节", "name": raw[:30], "page": int(sm.group(3))})
    # 简化：把所有节挂到"水质与水体自净"以外的最近章较难，v1 全部挂到第一章作为示例
    if chapters:
        chapters[0]["sections"] = sec_all[:12]
        for c in chapters[1:]:
            c["sections"] = []
    return chapters


def parse_env_principle():
    """环工原理全文（笔记）只有 1 页，提取章节名作为知识点。"""
    r = PdfReader(EPP)
    t = r.pages[0].extract_text() or ""
    # 章节行：'第一章 绪论' 或 '第X章 ...'
    items = []
    for m in re.finditer(r"第([一二三四五六七八九十]+)\s*章\s*([^\n|｜\d]{2,30})", t):
        items.append({"num": "第" + m.group(1) + "章", "name": m.group(2).strip()})
    # 小节：'第一节 常用物理量'
    for m in re.finditer(r"第([一二三四五六七八九十]+)\s*节\s*([^\n|｜\d]{2,30})", t):
        items.append({"num": "第" + m.group(1) + "节", "name": m.group(2).strip()})
    return items


def to_knowledge_points(env_chapters, principle_items, book):
    kps = []
    idx = 0
    for ch in env_chapters:
        if ch["sections"]:
            for sec in ch["sections"]:
                idx += 1
                kps.append({
                    "id": f"env.kp{idx:03d}",
                    "chapter": f"{ch['num']} {ch['name']}",
                    "name": sec["name"],
                    "summary": f"{ch['num']}「{ch['name']}」下「{sec['name']}」核心概念，详见教材 P{sec['page']}。",
                    "crop_rarity": "common",
                    "source": {"book": book, "chapter": f"{ch['num']} {ch['name']}", "page": f"P{sec['page']}"},
                })
        else:
            idx += 1
            kps.append({
                "id": f"env.kp{idx:03d}",
                "chapter": f"{ch['num']} {ch['name']}",
                "name": ch["name"],
                "summary": f"{ch['num']}「{ch['name']}」章节要点，详见教材 P{ch['page']}。",
                "crop_rarity": "common",
                "source": {"book": book, "chapter": f"{ch['num']} {ch['name']}", "page": f"P{ch['page']}"},
            })
    # 环工原理章节
    for it in principle_items:
        idx += 1
        kps.append({
            "id": f"envp.kp{idx:03d}",
            "chapter": it["num"],
            "name": it["name"],
            "summary": f"环境工程原理「{it['name']}」知识点，见教材笔记。",
            "crop_rarity": "common",
            "source": {"book": "环境工程原理（第3版）笔记", "chapter": it["num"], "page": "笔记"},
        })
    return kps


def make_placeholder_questions(kps):
    """为每个知识点生成占位判断题（needs_review=true，农场练习模式）。"""
    qs = []
    for i, kp in enumerate(kps):
        qs.append({
            "id": f"env.q{i + 1:04d}",
            "kp_id": kp["id"],
            "type": "judge",
            "stem": f"判断题：{kp['name']}是{kp['chapter']}中的重要知识点。（待校对）",
            "options": [],
            "answer": 0,
            "explanation": f"该题占位待生成，见{kp['source'].get('book', '环工教材')} {kp['source'].get('chapter', '')}。",
            "difficulty": 1,
            "source": kp["source"],
            "answer_source": kp["source"],
            "needs_review": True,
        })
    return qs


def main():
    env_chapters = parse_env_engineering()
    principle_items = parse_env_principle()
    print(f"环工第三版 章节: {len(env_chapters)}, 节: {sum(len(c['sections']) for c in env_chapters)}")
    print(f"环工原理 知识点: {len(principle_items)}")

    kps = to_knowledge_points(env_chapters, principle_items, "环境工程学（第三版）")
    qs = make_placeholder_questions(kps)
    print(f"知识点: {len(kps)}, 占位题: {len(qs)}")

    out = {
        "subject": "env",
        "subject_name": "环境工程",
        "version": 1,
        "source_book": "环境工程学（第三版）+ 环境工程原理（第3版）笔记",
        "knowledge_points": kps,
        "questions": qs,
        "note": "环工题目为占位判断题（needs_review），供农场练习模式运转；高质量题目待后续 AI 生成替换。",
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
