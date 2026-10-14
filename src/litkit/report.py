"""週次レポート生成。"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from .config import NOTES_DIR, CARDS_DIR
from .card import read_card, list_card_ids
from .claims import load_claims


def generate_weekly_report(target_date: date | None = None) -> str:
    if target_date is None:
        target_date = date.today()
    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=6)

    # 今週追加されたカード
    added_this_week = []
    read_this_week = []
    all_cards = list_card_ids()
    for cid in all_cards:
        meta, _ = read_card(cid)
        if week_start <= meta.added <= week_end:
            added_this_week.append(meta)
        if meta.updated >= week_start and meta.status.value == "read":
            read_this_week.append(meta)

    # 主張の状態
    claims = load_claims()
    total_claims = len(claims)
    supported = sum(1 for c in claims if c.evidence_ids)
    unsupported = total_claims - supported

    # 研究ログ
    daily_dir = NOTES_DIR / "daily"
    daily_entries = []
    if daily_dir.exists():
        for day_offset in range(7):
            day = week_start + timedelta(days=day_offset)
            day_file = daily_dir / f"{day.isoformat()}.md"
            if day_file.exists():
                daily_entries.append((day, day_file.read_text(encoding="utf-8")))

    # レポート組み立て
    lines = [
        f"# 週次レポート {week_start.isoformat()} 〜 {week_end.isoformat()}",
        "",
        "## 今週の数値",
        f"- 文献カード追加: {len(added_this_week)} 件",
        f"- 精読完了: {len(read_this_week)} 件",
        f"- 蓄積文献数: {len(all_cards)} 件",
        f"- 主張数: {total_claims} 件（根拠あり: {supported} / 根拠なし: {unsupported}）",
        "",
    ]

    if added_this_week:
        lines.append("## 今週追加した文献")
        for meta in added_this_week:
            depth = "精読済" if meta.depth.value == "full_text" else "アブストのみ"
            lines.append(f"- [{meta.id}] {meta.title} ({depth})")
        lines.append("")

    if read_this_week:
        lines.append("## 今週読了した文献")
        for meta in read_this_week:
            lines.append(f"- [{meta.id}] {meta.title}")
        lines.append("")

    if daily_entries:
        lines.append("## 研究ログ")
        for day, content in daily_entries:
            lines.append(f"### {day.isoformat()}")
            lines.append(content.strip())
            lines.append("")

    if unsupported > 0:
        lines.append("## 次週の課題")
        lines.append(f"- 根拠なしの主張が {unsupported} 件ある。文献を追加して補強する")
        lines.append("")

    # 保存
    report_dir = NOTES_DIR / "weekly"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{target_date.isoformat()}.md"
    report_text = "\n".join(lines)
    report_path.write_text(report_text, encoding="utf-8")

    return report_text
