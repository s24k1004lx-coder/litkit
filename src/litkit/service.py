"""文献の取り込み・昇格・質問・レビューのコア処理。CLI と Web API の両方から使う。"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from .card import card_exists, generate_card_body, read_card, write_card
from .config import INBOX_DIR, NOTES_DIR, PDF_DIR, load_research_context
from .index import index_card, search_cards
from .ingest import (
    download_pdf, extract_metadata_from_pdf, extract_text_from_pdf, list_inbox, move_from_inbox,
)
from .models import CardMeta, Depth, Lang, Relevance, SearchResult, Source, Status

CARD_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")


class ServiceError(Exception):
    """利用者に理由をそのまま見せてよいエラー。"""

    def __init__(self, message: str, code: int = 400):
        super().__init__(message)
        self.code = code


@dataclass
class AddOutcome:
    card_id: str
    created: bool
    depth: Depth
    title: str
    pdf_error: str | None = None


def assess_relevance(text: str) -> Relevance:
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


def make_card_id(result: SearchResult) -> str:
    prefix = result.source.value
    if result.doi:
        safe = result.doi.replace("/", "_").replace(".", "_")
        return f"{prefix}-{safe}"
    h = hashlib.md5(result.title.encode()).hexdigest()[:12]
    return f"{prefix}-{h}"


def is_public_http_url(url: str) -> bool:
    """http(s) かつ、社内・ローカルのアドレスではないか。サーバーに任意URLを取りに行かせないための確認。"""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except (OSError, ValueError):
        return False


def result_from_dict(d: dict) -> SearchResult:
    """Web から送られた検索結果 dict を SearchResult に戻す。"""
    title = (d.get("title") or "").strip()
    if not title:
        raise ServiceError("タイトルがない論文は取り込めません")
    try:
        source = Source(d.get("source") or Source.WEB.value)
        lang = Lang(d.get("lang") or Lang.JA.value)
    except ValueError:
        raise ServiceError("ソースまたは言語の指定が不正です")
    year = d.get("year")
    return SearchResult(
        title=title,
        authors=[str(a) for a in (d.get("authors") or [])],
        year=year if isinstance(year, int) else None,
        venue=d.get("venue") or None,
        doi=d.get("doi") or None,
        url=d.get("url") or None,
        source=source,
        lang=lang,
        abstract=d.get("abstract") or None,
        pdf_url=d.get("pdf_url") or None,
        is_open_access=d.get("is_open_access"),
        l1=d.get("l1") or None,
    )


async def add_result(result: SearchResult) -> AddOutcome:
    """検索結果1件をカード化する。既にあれば作らず created=False を返す。"""
    card_id = make_card_id(result)
    if card_exists(card_id):
        meta, _ = read_card(card_id)
        return AddOutcome(card_id, False, meta.depth, meta.title)

    pdf_path: Path | None = None
    pdf_error: str | None = None
    if result.pdf_url and result.is_open_access:
        try:
            if not is_public_http_url(result.pdf_url):
                raise ServiceError("PDFのURLが不正です")
            pdf_path = await download_pdf(result.pdf_url, f"{card_id}.pdf")
            extract_text_from_pdf(pdf_path)
        except Exception as e:
            pdf_path = None
            pdf_error = str(e) if isinstance(e, ServiceError) else type(e).__name__
            (PDF_DIR / f"{card_id}.pdf").unlink(missing_ok=True)

    depth = Depth.FULL_TEXT if pdf_path else Depth.ABSTRACT_ONLY
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
        relevance=assess_relevance(f"{result.title} {result.abstract or ''}"),
        l1=result.l1 or (result.abstract[:120] if result.abstract else None),
        abstract=result.abstract,
    )
    l2 = result.abstract[:500] if result.abstract else "（アブストラクト未取得）"
    write_card(meta, generate_card_body(meta, l2=l2))
    index_card(card_id)
    return AddOutcome(card_id, True, depth, meta.title, pdf_error)


async def fetch_by_identifier(identifier: str) -> SearchResult | None:
    """DOI または URL から書誌情報を取得する。"""
    identifier = identifier.strip()
    if identifier.startswith("10.") or "doi.org" in identifier:
        from .sources.crossref import CrossRefAdapter
        return await CrossRefAdapter().fetch_metadata(identifier)
    if identifier.startswith("http"):
        if not is_public_http_url(identifier):
            raise ServiceError("このURLは取り込めません")
        from .sources.web import WebAdapter
        return await WebAdapter().fetch_metadata(identifier)
    return None


async def add_identifier(identifier: str) -> AddOutcome:
    result = await fetch_by_identifier(identifier)
    if result is None:
        raise ServiceError("文献情報を取得できませんでした。DOI（10.…）か http(s) のURLを指定してください", 404)
    return await add_result(result)


async def add_pdf_from_inbox(pdf_path: Path) -> AddOutcome:
    """inbox のPDF1件をカード化し、PDFを literature/pdf/ へ移す。既にカードがあれば何もしない。"""
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
    if doi:
        from .sources.crossref import CrossRefAdapter
        try:
            cr_result = await CrossRefAdapter().fetch_metadata(doi)
        except Exception:
            cr_result = None
        if cr_result:
            result = cr_result
            result.source = Source.MANUAL

    card_id = make_card_id(result)
    if card_exists(card_id):
        meta, _ = read_card(card_id)
        return AddOutcome(card_id, False, meta.depth, meta.title)

    dest = move_from_inbox(pdf_path)
    extract_text_from_pdf(dest)
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
        relevance=assess_relevance(f"{result.title} {result.abstract or ''}"),
        l1=result.abstract[:120] if result.abstract else None,
    )
    l2 = result.abstract[:500] if result.abstract else "（PDF本文から生成予定）"
    write_card(meta, generate_card_body(meta, l2=l2))
    index_card(card_id)
    return AddOutcome(card_id, True, Depth.FULL_TEXT, meta.title)


def safe_pdf_name(filename: str) -> str:
    """アップロードされたファイル名から、保存してよい名前を作る（パス成分は捨てる）。"""
    stem = Path(filename.replace("\\", "/")).stem
    stem = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", stem).strip(" .")[:120] or "upload"
    return f"{stem}.pdf"


def save_to_inbox(filename: str, data: bytes) -> Path:
    if not data.startswith(b"%PDF"):
        raise ServiceError("PDFファイルではありません")
    name = safe_pdf_name(filename)
    dest = INBOX_DIR / name
    n = 2
    while dest.exists() or (PDF_DIR / dest.name).exists():
        dest = INBOX_DIR / f"{Path(name).stem}_{n}.pdf"
        n += 1
    dest.write_bytes(data)
    return dest


def inbox_files() -> list[dict]:
    return [{"name": p.name, "size": p.stat().st_size} for p in list_inbox()]


def upgrade_card(card_id: str) -> None:
    """literature/pdf/<id>.pdf を根拠に、アブストのみのカードを本文ありに昇格する。"""
    if not CARD_ID_RE.match(card_id) or not card_exists(card_id):
        raise ServiceError(f"カード {card_id} が見つかりません", 404)
    pdf_path = PDF_DIR / f"{card_id}.pdf"
    if not pdf_path.exists():
        raise ServiceError("PDFが見つかりません。先にPDFを取り込んでください", 404)

    meta, old_body = read_card(card_id)
    extract_text_from_pdf(pdf_path)

    meta.depth = Depth.FULL_TEXT
    meta.pdf = f"literature/pdf/{card_id}.pdf"
    meta.updated = date.today()

    l2 = ""
    if "## L2：判断用要約" in old_body:
        parts = old_body.split("## L2：判断用要約")
        if len(parts) > 1:
            l2 = parts[1].split("## ")[0].strip()

    write_card(meta, generate_card_body(meta, l2=l2))
    index_card(card_id)


def upgrade_with_pdf_bytes(card_id: str, data: bytes) -> None:
    if not CARD_ID_RE.match(card_id) or not card_exists(card_id):
        raise ServiceError(f"カード {card_id} が見つかりません", 404)
    if not data.startswith(b"%PDF"):
        raise ServiceError("PDFファイルではありません")
    dest = PDF_DIR / f"{card_id}.pdf"
    existed = dest.exists()
    backup = dest.read_bytes() if existed else None
    dest.write_bytes(data)
    try:
        upgrade_card(card_id)
    except Exception:
        if backup is not None:
            dest.write_bytes(backup)
        else:
            dest.unlink(missing_ok=True)
        raise


def ask_cards(question: str, limit: int = 10) -> list[dict]:
    """質問に関連するカードを返す。根拠はカードIDで示す。アブストのみは但し書きフラグを付ける。"""
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "l1": r.get("l1"),
            "depth": r.get("depth"),
            "abstract_only": r.get("depth") == "abstract_only",
        }
        for r in search_cards(question, limit=limit)
    ]


def make_review(theme: str) -> tuple[Path, str] | None:
    """テーマに関連するカードの一覧から小レビューの雛形を作って保存する。該当なしなら None。"""
    results = search_cards(theme, limit=20)
    if not results:
        return None

    today = date.today().isoformat()
    review_dir = NOTES_DIR / "reviews"
    review_dir.mkdir(parents=True, exist_ok=True)
    safe_theme = re.sub(r'[\\/:*?"<>|\s]+', "_", theme).strip("_")[:80] or "review"
    out_path = review_dir / f"{safe_theme}_{today}.md"

    lines = [f"# 文献レビュー: {theme}", f"生成日: {today}", "", "## 関連文献一覧"]
    for r in results:
        depth = "精読済" if r.get("depth") == "full_text" else "アブストのみ"
        lines.append(f"- [{r['id']}] {r['title']} ({depth})")
    lines += ["", "## 論点の整理", "（カード内容を基に手動で補完する）", "",
              "## 未解明な点", "（自研究の立ち位置を明確化する）"]
    text = "\n".join(lines)
    out_path.write_text(text, encoding="utf-8")
    return out_path, text
