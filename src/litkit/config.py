from pathlib import Path
from functools import lru_cache

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[2]
LITERATURE_DIR = ROOT / "literature"
CARDS_DIR = LITERATURE_DIR / "cards"
PDF_DIR = LITERATURE_DIR / "pdf"
INBOX_DIR = LITERATURE_DIR / "inbox"
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
INDEX_DB = DATA_DIR / "index.db"
THESIS_DIR = ROOT / "thesis"
NOTES_DIR = ROOT / "notes"
CLAUDE_MD = ROOT / "CLAUDE.md"

for d in [CARDS_DIR, PDF_DIR, INBOX_DIR, DATA_DIR, CACHE_DIR,
          THESIS_DIR / "chapters", NOTES_DIR / "daily", NOTES_DIR / "reviews"]:
    d.mkdir(parents=True, exist_ok=True)


@lru_cache
def load_research_context() -> dict:
    """CLAUDE.mdから研究文脈（キーワード等）を読み込む。テーマ変更時はここだけ反映される。"""
    text = CLAUDE_MD.read_text(encoding="utf-8")
    section = ""
    in_context = False
    ja_keywords: list[str] = []
    en_keywords: list[str] = []
    theme = ""

    for line in text.splitlines():
        if line.startswith("## 研究の文脈"):
            in_context = True
            continue
        if in_context and line.startswith("## "):
            break
        if in_context:
            if line.startswith("テーマ："):
                theme = line.removeprefix("テーマ：").strip()
            elif "関連キーワード：" in line:
                rest = line.split("関連キーワード：", 1)[1]
                ja_keywords.extend(k.strip() for k in rest.split("/") if k.strip())
            elif "英語側：" in line:
                rest = line.split("英語側：", 1)[1]
                en_keywords.extend(k.strip() for k in rest.split("/") if k.strip())
            elif line.startswith("　　　　　　　　"):
                tokens = [k.strip() for k in line.split("/") if k.strip()]
                if any(ord(c) > 127 for c in line):
                    ja_keywords.extend(tokens)
                else:
                    en_keywords.extend(tokens)

    return {
        "theme": theme,
        "keywords_ja": ja_keywords,
        "keywords_en": en_keywords,
    }
