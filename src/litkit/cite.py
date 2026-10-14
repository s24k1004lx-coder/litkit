"""BibTeX・参考文献リスト出力。"""

from __future__ import annotations

import re
from pathlib import Path

from .card import read_card, list_card_ids
from .config import THESIS_DIR
from .models import CardMeta, Lang


def to_bibtex(meta: CardMeta) -> str:
    entry_type = "article"
    key = meta.id.replace("-", "_")
    fields = []
    fields.append(f"  title = {{{meta.title}}}")
    if meta.authors:
        fields.append(f"  author = {{{' and '.join(meta.authors)}}}")
    if meta.year:
        fields.append(f"  year = {{{meta.year}}}")
    if meta.venue:
        fields.append(f"  journal = {{{meta.venue}}}")
    if meta.doi:
        fields.append(f"  doi = {{{meta.doi}}}")
    if meta.url:
        fields.append(f"  url = {{{meta.url}}}")
    return f"@{entry_type}{{{key},\n" + ",\n".join(fields) + "\n}"


def to_japanese_reference(meta: CardMeta) -> str:
    """日本語論文慣例の参考文献形式。"""
    parts = []
    if meta.authors:
        parts.append("・".join(meta.authors))
    if meta.year:
        parts.append(f"({meta.year})")
    parts.append(f"「{meta.title}」")
    if meta.venue:
        parts.append(f"『{meta.venue}』")
    if meta.doi:
        parts.append(f"DOI: {meta.doi}")
    return " ".join(parts)


def to_apa_reference(meta: CardMeta) -> str:
    """英語論文向けAPA風の参考文献形式。"""
    parts = []
    if meta.authors:
        parts.append(", ".join(meta.authors))
    if meta.year:
        parts.append(f"({meta.year}).")
    parts.append(f"{meta.title}.")
    if meta.venue:
        parts.append(f"*{meta.venue}*.")
    if meta.doi:
        parts.append(f"https://doi.org/{meta.doi}")
    return " ".join(parts)


def generate_reference_list(used_only: bool = False) -> str:
    """参考文献リストを生成する。"""
    card_ids = list_card_ids()

    if used_only:
        used_ids = _extract_used_ids()
        card_ids = [cid for cid in card_ids if cid in used_ids]

    refs_ja = []
    refs_en = []
    bibtex_entries = []

    for cid in sorted(card_ids):
        meta, _ = read_card(cid)
        bibtex_entries.append(to_bibtex(meta))
        if meta.lang == Lang.JA:
            refs_ja.append(to_japanese_reference(meta))
        else:
            refs_en.append(to_apa_reference(meta))

    lines = ["# 参考文献", ""]
    if refs_ja:
        lines.append("## 日本語文献")
        for ref in sorted(refs_ja):
            lines.append(f"- {ref}")
        lines.append("")
    if refs_en:
        lines.append("## 英語文献")
        for ref in sorted(refs_en):
            lines.append(f"- {ref}")
        lines.append("")

    lines.append("## BibTeX")
    lines.append("```bibtex")
    lines.extend(bibtex_entries)
    lines.append("```")

    return "\n".join(lines)


def _extract_used_ids() -> set[str]:
    """原稿中で引用されているカードIDを抽出する。"""
    used = set()
    chapters_dir = THESIS_DIR / "chapters"
    if not chapters_dir.exists():
        return used
    for md_file in chapters_dir.glob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        for match in re.finditer(r'\[([a-z_]+-[a-zA-Z0-9_]+)\]', text):
            used.add(match.group(1))
    return used
