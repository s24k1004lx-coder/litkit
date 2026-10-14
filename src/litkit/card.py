"""文献カードの生成・読み書き・検証。Markdownファイルが常に正（single source of truth）。"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Optional

import frontmatter

from .config import CARDS_DIR
from .models import CardMeta, Depth


def card_path(card_id: str) -> Path:
    return CARDS_DIR / f"{card_id}.md"


def card_exists(card_id: str) -> bool:
    return card_path(card_id).exists()


def list_card_ids() -> list[str]:
    return [p.stem for p in CARDS_DIR.glob("*.md")]


def read_card(card_id: str) -> tuple[CardMeta, str]:
    """カードファイルを読み、(メタデータ, 本文markdown)を返す。"""
    p = card_path(card_id)
    post = frontmatter.load(str(p), encoding="utf-8")
    meta = CardMeta.from_frontmatter(dict(post.metadata))
    return meta, post.content


def read_all_cards() -> list[tuple[CardMeta, str]]:
    return [read_card(cid) for cid in list_card_ids()]


def write_card(meta: CardMeta, body: str) -> Path:
    """カードファイルを書き出す。既存ファイルを上書きする。"""
    p = card_path(meta.id)
    post = frontmatter.Post(body, **meta.to_frontmatter())
    p.write_text(frontmatter.dumps(post), encoding="utf-8")
    return p


def generate_card_body(meta: CardMeta, l2: str = "", l3: Optional[str] = None) -> str:
    """カードのMarkdown本文を生成する。L3は本文PDF取得時のみ渡す。"""
    sections = []

    sections.append("## L2：判断用要約")
    sections.append(l2 if l2 else "（未作成）")
    sections.append("")

    sections.append("## L3：精読要約")
    if l3 and meta.depth == Depth.FULL_TEXT:
        sections.append(l3)
    else:
        sections.append("（本文未取得のため未作成）")
    sections.append("")

    sections.append("## 自研究との関係")
    sections.append("（※ここは自分の解釈を書く領域。事実と混ぜない）")
    sections.append("")

    sections.append("## 引用候補")
    sections.append("")

    sections.append("## メモ・疑問")
    sections.append("")

    return "\n".join(sections)


def update_card_section(card_id: str, section_heading: str, new_content: str) -> None:
    """カードの特定セクションを更新する。"""
    meta, body = read_card(card_id)
    lines = body.split("\n")
    result = []
    in_target = False
    replaced = False

    for line in lines:
        if line.startswith("## ") and section_heading in line:
            result.append(line)
            result.append(new_content)
            in_target = True
            replaced = True
            continue
        if in_target and line.startswith("## "):
            in_target = False
        if not in_target:
            result.append(line)

    if not replaced:
        result.append(f"\n## {section_heading}")
        result.append(new_content)

    meta.updated = date.today()
    write_card(meta, "\n".join(result))


def validate_card(card_id: str) -> list[str]:
    """カードの整合性をチェックし、問題点のリストを返す。"""
    issues = []
    meta, body = read_card(card_id)

    if not meta.title:
        issues.append("タイトルが空")
    if not meta.id:
        issues.append("IDが空")
    if meta.depth == Depth.FULL_TEXT and "（本文未取得のため未作成）" in body:
        issues.append("depth=full_text だがL3が未作成")
    if meta.depth == Depth.ABSTRACT_ONLY and "### 背景と問い" in body:
        issues.append("depth=abstract_only だがL3相当の内容がある（禁止事項）")

    return issues
