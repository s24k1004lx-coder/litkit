"""主張↔根拠のリンク管理。thesis/claims.md の読み書き。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from .config import THESIS_DIR
from .card import card_exists


CLAIMS_FILE = THESIS_DIR / "claims.md"


@dataclass
class Claim:
    id: str
    text: str
    evidence_ids: list[str]
    section: str
    status: str  # "根拠あり" | "根拠なし"


def load_claims() -> list[Claim]:
    if not CLAIMS_FILE.exists():
        return []
    text = CLAIMS_FILE.read_text(encoding="utf-8")
    claims = []
    for line in text.splitlines():
        match = re.match(r'\|\s*(C-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|', line)
        if match and match.group(1) != "ID":
            evidence = [e.strip() for e in match.group(3).split(",") if e.strip() and e.strip() != "—"]
            claims.append(Claim(
                id=match.group(1),
                text=match.group(2),
                evidence_ids=evidence,
                section=match.group(4),
                status=match.group(5).strip("* "),
            ))
    return claims


def save_claims(claims: list[Claim]) -> None:
    lines = ["# 主張リスト", "", "| ID | 主張 | 根拠カードID | 章節 | 状態 |", "|----|------|------------|------|------|"]
    for c in claims:
        ev = ", ".join(c.evidence_ids) if c.evidence_ids else "—"
        status = c.status
        if status == "根拠なし":
            status = "**根拠なし**"
        lines.append(f"| {c.id} | {c.text} | {ev} | {c.section} | {status} |")
    CLAIMS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def check_claims() -> list[dict]:
    """根拠なしの主張と、存在しないカードIDを指す主張を検出する。"""
    issues = []
    for claim in load_claims():
        if not claim.evidence_ids:
            issues.append({"claim": claim, "issue": "根拠なし"})
        else:
            for eid in claim.evidence_ids:
                if not card_exists(eid):
                    issues.append({"claim": claim, "issue": f"カード {eid} が存在しない"})
    return issues


def next_claim_id() -> str:
    claims = load_claims()
    if not claims:
        return "C-001"
    nums = [int(c.id.split("-")[1]) for c in claims]
    return f"C-{max(nums) + 1:03d}"
