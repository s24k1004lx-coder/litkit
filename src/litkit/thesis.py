"""章立て管理・整合チェック。"""

from __future__ import annotations

import re
from pathlib import Path

from .config import THESIS_DIR, NOTES_DIR
from .card import card_exists, list_card_ids
from .claims import load_claims


def load_outline() -> str:
    outline_file = THESIS_DIR / "outline.md"
    if outline_file.exists():
        return outline_file.read_text(encoding="utf-8")
    return ""


def list_chapters() -> list[Path]:
    chapters_dir = THESIS_DIR / "chapters"
    if not chapters_dir.exists():
        return []
    return sorted(chapters_dir.glob("*.md"))


def check_all() -> dict[str, list[str]]:
    """整合チェック一式を実行する。"""
    results = {
        "unsupported_claims": [],
        "invalid_refs": [],
        "terminology": [],
        "figure_numbering": [],
    }

    # 根拠なし主張
    claims = load_claims()
    for claim in claims:
        if not claim.evidence_ids:
            results["unsupported_claims"].append(
                f"{claim.id}: {claim.text}"
            )

    # 本文中の引用IDが実在するか
    all_card_ids = set(list_card_ids())
    for chapter in list_chapters():
        text = chapter.read_text(encoding="utf-8")
        for match in re.finditer(r'\[([a-z_]+-[a-zA-Z0-9_]+)\]', text):
            ref_id = match.group(1)
            if ref_id not in all_card_ids:
                results["invalid_refs"].append(
                    f"{chapter.name}: [{ref_id}] が存在しないカードを参照"
                )

    # 用語の表記ゆれ
    glossary_file = NOTES_DIR / "glossary.md"
    if glossary_file.exists():
        glossary_text = glossary_file.read_text(encoding="utf-8")
        terms = {}
        for line in glossary_text.splitlines():
            match = re.match(r'\|\s*(.+?)\s*\|\s*(.+?)\s*\|', line)
            if match and match.group(1) not in ("用語", "---"):
                terms[match.group(1)] = match.group(2).strip()

        for chapter in list_chapters():
            text = chapter.read_text(encoding="utf-8")
            for term, canonical in terms.items():
                if term != canonical and term in text:
                    results["terminology"].append(
                        f"{chapter.name}: 「{term}」→「{canonical}」に統一すべき"
                    )

    # 図表番号の連番チェック
    for chapter in list_chapters():
        text = chapter.read_text(encoding="utf-8")
        fig_nums = [int(m.group(1)) for m in re.finditer(r'図\s*(\d+)', text)]
        table_nums = [int(m.group(1)) for m in re.finditer(r'表\s*(\d+)', text)]
        for nums, label in [(fig_nums, "図"), (table_nums, "表")]:
            if nums:
                expected = list(range(1, max(nums) + 1))
                if sorted(nums) != expected:
                    results["figure_numbering"].append(
                        f"{chapter.name}: {label}の番号が連番でない: {sorted(nums)}"
                    )

    return results
