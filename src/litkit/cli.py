"""litkit CLI エントリポイント。"""

from __future__ import annotations

import asyncio
import subprocess
import sys
import webbrowser
from datetime import date
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

from .config import load_research_context, CARDS_DIR, INBOX_DIR, PDF_DIR
from .models import SearchResult, Source, Depth, Status, Relevance, CardMeta, Lang
from .card import (
    card_exists, read_card, write_card, generate_card_body,
    list_card_ids, read_all_cards,
)
from .index import rebuild_index, index_card, search_cards
from .sources import ALL_ADAPTERS
from .ingest import (
    download_pdf, extract_text_from_pdf, extract_metadata_from_pdf,
    move_from_inbox, list_inbox,
)
from .cite import generate_reference_list
from .claims import check_claims, load_claims
from .thesis import check_all, load_outline
from .report import generate_weekly_report

app = typer.Typer(help="litkit — 卒業研究用 文献研究支援システム")
console = Console()

# 直近の検索結果を保持（preview/addで番号指定するため）
_last_results: list[SearchResult] = []


def _assess_relevance(text: str) -> Relevance:
    """CLAUDE.mdのキーワードとの近さで関連度を判定する。"""
    ctx = load_research_context()
    keywords = ctx["keywords_ja"] + ctx["keywords_en"]
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw.lower() in text_lower)
    if hits >= 3:
        return Relevance.HIGH
    if hits >= 1:
        return Relevance.MID
    return Relevance.LOW


def _make_card_id(result: SearchResult) -> str:
    prefix = result.source.value
    if result.doi:
        safe = result.doi.replace("/", "_").replace(".", "_")
        return f"{prefix}-{safe}"
    import hashlib
    h = hashlib.md5(result.title.encode()).hexdigest()[:12]
    return f"{prefix}-{h}"


@app.command()
def search(query: str, limit: int = 10):
    """横断検索し、L1一行要約つきの一覧を出す。"""
    results = asyncio.run(_search_all(query, limit))
    global _last_results
    _last_results = results

    if not results:
        console.print("[dim]検索結果がありませんでした。[/dim]")
        return

    table = Table(show_header=True, header_style="bold")
    table.add_column("#", style="dim", width=4)
    table.add_column("関連", width=4)
    table.add_column("入手", width=5)
    table.add_column("年", width=5)
    table.add_column("タイトル / L1要約")
    table.add_column("ソース", style="dim", width=8)

    for i, r in enumerate(results, 1):
        rel = _assess_relevance(f"{r.title} {r.abstract or ''}")
        r.relevance = rel
        rel_str = {"high": "[bold red]高[/]", "mid": "[yellow]中[/]", "low": "[dim]低[/]"}[rel.value]
        avail = f"[green]{r.availability}[/]" if r.availability == "PDF" else f"[dim]{r.availability}[/]"
        has = " ✓" if card_exists(_make_card_id(r)) else ""
        r.has_card = bool(has)

        title_line = f"{r.title}{has}"
        if r.l1:
            title_line += f"\n  └ {r.l1}"
        elif r.abstract:
            snippet = r.abstract[:120].replace("\n", " ")
            title_line += f"\n  └ {snippet}…"

        table.add_row(
            str(i), rel_str, avail,
            str(r.year or ""), title_line,
            f"[dim]{r.source.value}[/]",
        )

    console.print(table)

    # Google Scholar検索URL
    gs_url = f"https://scholar.google.com/scholar?q={query.replace(' ', '+')}"
    console.print(f"\n[dim]Google Scholar（手動）: {gs_url}[/dim]")


async def _search_all(query: str, limit: int) -> list[SearchResult]:
    """全ソースを並列検索して統合する。"""
    ctx = load_research_context()
    en_query = None
    if any(ord(c) > 0x3000 for c in query):
        en_keywords = ctx.get("keywords_en", [])
        if en_keywords:
            en_query = " ".join(en_keywords[:3])

    tasks = []
    for adapter_cls in ALL_ADAPTERS:
        adapter = adapter_cls()
        tasks.append(_safe_search(adapter, query, limit))
        if en_query:
            tasks.append(_safe_search(adapter, en_query, limit))

    all_results = await asyncio.gather(*tasks)

    # 統合・名寄せ
    merged: dict[str, SearchResult] = {}
    for results in all_results:
        for r in results:
            key = r.doi or f"{r.title[:50]}_{r.year}"
            if key not in merged:
                merged[key] = r

    return list(merged.values())[:limit * 3]


async def _safe_search(adapter, query: str, limit: int) -> list[SearchResult]:
    try:
        console.print(f"  [dim]{adapter.name} を検索中…[/dim]")
        return await adapter.search(query, limit)
    except Exception as e:
        console.print(f"  [dim]{adapter.name}: エラー ({e})[/dim]")
        return []


@app.command()
def preview(numbers: list[int], compare: bool = False):
    """選んだ論文のL2判断用要約を表示する。"""
    if not _last_results:
        console.print("[red]先に search を実行してください。[/red]")
        raise typer.Exit(1)

    selected = []
    for n in numbers:
        if n < 1 or n > len(_last_results):
            console.print(f"[red]番号 {n} は範囲外です。[/red]")
            continue
        selected.append(_last_results[n - 1])

    if compare and len(selected) > 1:
        _show_comparison(selected)
    else:
        for r in selected:
            _show_preview(r)


def _show_preview(r: SearchResult):
    rel = _assess_relevance(f"{r.title} {r.abstract or ''}")
    avail = "自動取得可" if r.is_open_access else "本文取得不可"
    source_info = f"{r.source.value}"
    if r.is_open_access:
        source_info += " オープンアクセス"

    lines = [
        f"[bold]{r.title}[/bold]",
        f"    {', '.join(r.authors) if r.authors else '著者不明'} ({r.year or '年不明'}) {r.venue or ''}",
        f"    DOI: {r.doi or 'なし'}   本文: {avail}({source_info})",
    ]
    console.print(Panel("\n".join(lines), border_style="bright_blue"))

    if r.abstract:
        console.print("\n[bold]■ 何の研究か[/bold]")
        console.print(r.abstract[:500])
    else:
        console.print("\n[bold]■ 何の研究か[/bold]")
        console.print("（アブストラクト未取得）")

    stars = "★" * min(rel_to_stars(rel), 5) + "☆" * (5 - min(rel_to_stars(rel), 5))
    console.print(f"\n[bold]■ 読むべきか[/bold]")
    console.print(f"推奨度：{stars}")
    console.print(f"関連度：{rel.value}")

    console.print(f"\n[bold]■ 情報の範囲[/bold]")
    console.print("アブストラクトのみに基づく（本文未取得）")
    console.print()


def rel_to_stars(rel: Relevance) -> int:
    return {"high": 4, "mid": 3, "low": 1}[rel.value]


def _show_comparison(results: list[SearchResult]):
    table = Table(show_header=True, title="論文比較")
    table.add_column("項目", style="bold")
    for r in results:
        table.add_column(r.title[:30] + "…" if len(r.title) > 30 else r.title)

    table.add_row("著者", *[", ".join(r.authors[:2]) for r in results])
    table.add_row("年", *[str(r.year or "?") for r in results])
    table.add_row("掲載誌", *[r.venue or "?" for r in results])
    table.add_row("入手可否", *[r.availability for r in results])
    table.add_row("関連度", *[_assess_relevance(f"{r.title} {r.abstract or ''}").value for r in results])

    console.print(table)


@app.command()
def add(identifier: str):
    """文献を取り込み、カードを生成する。DOI, URL, 検索結果番号, PDFパスのいずれかを指定。"""
    result = asyncio.run(_resolve_identifier(identifier))
    if result is None:
        console.print("[red]文献情報を取得できませんでした。[/red]")
        raise typer.Exit(1)

    card_id = _make_card_id(result)
    if card_exists(card_id):
        console.print(f"[yellow]カード {card_id} は既に存在します。[/yellow]")
        raise typer.Exit(0)

    # PDF取得を試みる
    pdf_path = None
    full_text = None
    if result.pdf_url and result.is_open_access:
        try:
            console.print("[dim]PDFをダウンロード中…[/dim]")
            pdf_path = asyncio.run(download_pdf(result.pdf_url, f"{card_id}.pdf"))
            full_text = extract_text_from_pdf(pdf_path)
            console.print("[green]PDF取得・本文抽出完了[/green]")
        except Exception as e:
            console.print(f"[yellow]PDF取得失敗: {e}[/yellow]")

    depth = Depth.FULL_TEXT if full_text else Depth.ABSTRACT_ONLY
    rel = _assess_relevance(f"{result.title} {result.abstract or ''}")

    meta = CardMeta(
        id=card_id,
        title=result.title,
        authors=result.authors,
        year=result.year,
        venue=result.venue,
        doi=result.doi,
        url=result.url,
        source=result.source,
        lang=result.lang,
        pdf=f"literature/pdf/{card_id}.pdf" if pdf_path else None,
        status=Status.UNREAD,
        depth=depth,
        tags=[],
        relevance=rel,
        l1=result.l1 or (result.abstract[:120] if result.abstract else None),
        abstract=result.abstract,
    )

    l2 = result.abstract[:500] if result.abstract else "（アブストラクト未取得）"
    body = generate_card_body(meta, l2=l2)
    write_card(meta, body)
    index_card(card_id)

    console.print(f"[green]カード作成: {card_id} ({depth.value})[/green]")
    console.print(f"  タイトル: {meta.title}")
    console.print(f"  深度: {'精読要約あり' if depth == Depth.FULL_TEXT else 'アブストのみ'}")


async def _resolve_identifier(identifier: str) -> SearchResult | None:
    # 検索結果番号
    try:
        num = int(identifier)
        if _last_results and 1 <= num <= len(_last_results):
            return _last_results[num - 1]
    except ValueError:
        pass

    # PDFパス
    p = Path(identifier)
    if p.exists() and p.suffix.lower() == ".pdf":
        pdf_meta = extract_metadata_from_pdf(p)
        dest = move_from_inbox(p) if p.parent == INBOX_DIR else p
        return SearchResult(
            title=pdf_meta.get("title", p.stem),
            authors=[a for a in pdf_meta.get("author", "").split(",") if a.strip()],
            doi=pdf_meta.get("doi"),
            source=Source.MANUAL,
            lang=Lang.JA,
            is_open_access=True,
        )

    # DOI
    if identifier.startswith("10.") or "doi.org" in identifier:
        from .sources.crossref import CrossRefAdapter
        adapter = CrossRefAdapter()
        return await adapter.fetch_metadata(identifier)

    # URL
    if identifier.startswith("http"):
        from .sources.web import WebAdapter
        adapter = WebAdapter()
        return await adapter.fetch_metadata(identifier)

    return None


@app.command()
def inbox():
    """inbox内のPDFを一括処理する。"""
    pdfs = list_inbox()
    if not pdfs:
        console.print("[dim]inbox にPDFがありません。[/dim]")
        return

    console.print(f"[bold]{len(pdfs)} 件のPDFを処理します。[/bold]")
    for pdf_path in pdfs:
        console.print(f"\n処理中: {pdf_path.name}")
        try:
            pdf_meta = extract_metadata_from_pdf(pdf_path)
            title = pdf_meta.get("title") or pdf_path.stem
            doi = pdf_meta.get("doi")

            result = SearchResult(
                title=title,
                authors=[a for a in pdf_meta.get("author", "").split(",") if a.strip()],
                doi=doi,
                source=Source.MANUAL,
                lang=Lang.JA,
                is_open_access=True,
            )

            # DOIがあればCrossRefで書誌補完
            if doi:
                from .sources.crossref import CrossRefAdapter
                adapter = CrossRefAdapter()
                cr_result = asyncio.run(adapter.fetch_metadata(doi))
                if cr_result:
                    result = cr_result
                    result.source = Source.MANUAL

            card_id = _make_card_id(result)
            dest = move_from_inbox(pdf_path)
            full_text = extract_text_from_pdf(dest)

            meta = CardMeta(
                id=card_id,
                title=result.title,
                authors=result.authors,
                year=result.year,
                venue=result.venue,
                doi=result.doi,
                url=result.url,
                source=result.source,
                lang=result.lang,
                pdf=f"literature/pdf/{dest.name}",
                status=Status.UNREAD,
                depth=Depth.FULL_TEXT,
                tags=[],
                relevance=_assess_relevance(f"{result.title} {result.abstract or ''}"),
                l1=result.abstract[:120] if result.abstract else None,
            )

            l2 = result.abstract[:500] if result.abstract else "（PDF本文から生成予定）"
            body = generate_card_body(meta, l2=l2)
            write_card(meta, body)
            index_card(card_id)
            console.print(f"  [green]→ {card_id}[/green]")
        except Exception as e:
            console.print(f"  [red]エラー: {e}[/red]")

    console.print(f"\n[bold green]完了。[/bold green]")


@app.command()
def upgrade(card_id: str):
    """アブストのみのカードを、後から入手したPDFでL3に昇格する。"""
    if not card_exists(card_id):
        console.print(f"[red]カード {card_id} が見つかりません。[/red]")
        raise typer.Exit(1)

    pdf_path = PDF_DIR / f"{card_id}.pdf"
    if not pdf_path.exists():
        inbox_pdfs = list(INBOX_DIR.glob("*.pdf"))
        if inbox_pdfs:
            console.print(f"[yellow]inbox に {len(inbox_pdfs)} 件のPDFがあります。[/yellow]")
            console.print(f"対象PDFを literature/pdf/{card_id}.pdf に配置してから再実行してください。")
        else:
            console.print(f"[red]PDF が見つかりません。literature/inbox/ に置いてください。[/red]")
        raise typer.Exit(1)

    meta, old_body = read_card(card_id)
    full_text = extract_text_from_pdf(pdf_path)

    meta.depth = Depth.FULL_TEXT
    meta.pdf = f"literature/pdf/{card_id}.pdf"
    meta.updated = date.today()

    l2 = ""
    if "## L2：判断用要約" in old_body:
        parts = old_body.split("## L2：判断用要約")
        if len(parts) > 1:
            l2_part = parts[1].split("## ")[0]
            l2 = l2_part.strip()

    body = generate_card_body(meta, l2=l2)
    write_card(meta, body)
    index_card(card_id)
    console.print(f"[green]カード {card_id} をL3に昇格しました。[/green]")


@app.command()
def ask(question: str):
    """蓄積文献に基づいて質問に回答する（出典必須）。"""
    results = search_cards(question, limit=10)
    if not results:
        console.print("[yellow]蓄積文献中に該当なし。[/yellow]")
        console.print("検索クエリ案:")
        ctx = load_research_context()
        for kw in ctx["keywords_ja"][:3]:
            console.print(f"  litkit search \"{kw}\"")
        return

    console.print(f"[bold]関連文献 {len(results)} 件に基づく回答:[/bold]\n")
    for r in results:
        depth_note = ""
        if r.get("depth") == "abstract_only":
            depth_note = "（アブストのみに基づく）"
        console.print(f"  [{r['id']}] {r['title']} {depth_note}")
        if r.get("l1"):
            console.print(f"    → {r['l1']}")
    console.print()


@app.command()
def review(theme: str):
    """指定テーマの小レビューを生成する。"""
    results = search_cards(theme, limit=20)
    if not results:
        console.print("[yellow]関連文献が見つかりません。[/yellow]")
        return

    today = date.today().isoformat()
    review_dir = Path("notes/reviews")
    review_dir.mkdir(parents=True, exist_ok=True)
    safe_theme = theme.replace(" ", "_").replace("/", "_")
    out_path = review_dir / f"{safe_theme}_{today}.md"

    lines = [f"# 文献レビュー: {theme}", f"生成日: {today}", ""]
    lines.append("## 関連文献一覧")
    for r in results:
        depth = "精読済" if r.get("depth") == "full_text" else "アブストのみ"
        lines.append(f"- [{r['id']}] {r['title']} ({depth})")
    lines.append("")
    lines.append("## 論点の整理")
    lines.append("（カード内容を基に手動で補完する）")
    lines.append("")
    lines.append("## 未解明な点")
    lines.append("（自研究の立ち位置を明確化する）")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    console.print(f"[green]レビュー生成: {out_path}[/green]")


@app.command("claims")
def claims_cmd(check: bool = False):
    """主張の根拠チェック。"""
    if check:
        issues = check_claims()
        if not issues:
            console.print("[green]すべての主張に根拠があります。[/green]")
            return
        for item in issues:
            claim = item["claim"]
            console.print(f"[red]{claim.id}[/red]: {claim.text}")
            console.print(f"  問題: {item['issue']}")
    else:
        claims = load_claims()
        if not claims:
            console.print("[dim]主張が登録されていません。thesis/claims.md を編集してください。[/dim]")
            return
        table = Table(show_header=True)
        table.add_column("ID")
        table.add_column("主張")
        table.add_column("根拠")
        table.add_column("状態")
        for c in claims:
            style = "red" if not c.evidence_ids else ""
            table.add_row(c.id, c.text, ", ".join(c.evidence_ids) or "—", c.status, style=style)
        console.print(table)


@app.command("check")
def check_cmd():
    """整合チェック一式を実行する。"""
    results = check_all()
    total = 0
    for category, issues in results.items():
        if issues:
            labels = {
                "unsupported_claims": "根拠なし主張",
                "invalid_refs": "無効な引用",
                "terminology": "表記ゆれ",
                "figure_numbering": "図表番号",
            }
            console.print(f"\n[bold]{labels.get(category, category)}[/bold]")
            for issue in issues:
                console.print(f"  [yellow]⚠[/yellow] {issue}")
                total += 1

    if total == 0:
        console.print("[green]問題は検出されませんでした。[/green]")
    else:
        console.print(f"\n[yellow]計 {total} 件の問題[/yellow]")


@app.command()
def cite(used_only: bool = False):
    """参考文献リストを出力する。"""
    text = generate_reference_list(used_only=used_only)
    console.print(text)


@app.command()
def weekly():
    """週次レポートを生成する。"""
    text = generate_weekly_report()
    console.print(text)


@app.command("reindex")
def reindex():
    """FTS索引を再構築する。"""
    count = rebuild_index()
    console.print(f"[green]{count} 件のカードを索引化しました。[/green]")


@app.command()
def ui():
    """Web UIを起動する。"""
    import uvicorn
    console.print("[bold]litkit Web UI を起動します…[/bold]")
    console.print("  → http://localhost:7777")
    webbrowser.open("http://localhost:7777")
    uvicorn.run("litkit.api:app", host="127.0.0.1", port=7777, reload=True)


if __name__ == "__main__":
    app()
