"""FastAPI API層。CLIと同じコア関数を薄く包むだけ。"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from .config import load_research_context, CARDS_DIR, ROOT
from .card import (
    read_card, write_card, list_card_ids, card_exists,
    read_all_cards, update_card_section,
)
from .index import rebuild_index, search_cards, get_all_cards_meta, index_card
from .sources import ALL_ADAPTERS
from .models import SearchResult, Relevance, Depth
from .claims import load_claims, check_claims
from .thesis import check_all
from .report import generate_weekly_report
from .cite import generate_reference_list
from .translate import translate_batch_to_ja
from . import preview

app = FastAPI(title="litkit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:7777"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _mount_frontend():
    web_dist = ROOT / "web" / "dist"
    if web_dist.exists():
        app.mount("/", StaticFiles(directory=str(web_dist), html=True), name="frontend")

@app.on_event("startup")
def _startup():
    _mount_frontend()


def _assess_relevance(text: str) -> str:
    ctx = load_research_context()
    keywords = ctx["keywords_ja"] + ctx["keywords_en"]
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw.lower() in text_lower)
    if hits >= 3:
        return "high"
    if hits >= 1:
        return "mid"
    return "low"


@app.get("/api/stats")
def get_stats():
    cards = list_card_ids()
    all_meta = []
    full_text_count = 0
    abstract_only_count = 0
    this_week = []
    today = date.today()
    week_start = today.isoformat()[:10]

    for cid in cards:
        meta, _ = read_card(cid)
        all_meta.append(meta)
        if meta.depth.value == "full_text":
            full_text_count += 1
        else:
            abstract_only_count += 1
        if str(meta.added) >= week_start:
            this_week.append(cid)

    claims = load_claims()
    total_claims = len(claims)
    supported = sum(1 for c in claims if c.evidence_ids)
    coverage = round(supported / total_claims * 100) if total_claims else 0

    unread_high = sum(
        1 for m in all_meta
        if m.status.value == "unread" and m.relevance and m.relevance.value == "high"
    )

    return {
        "total_cards": len(cards),
        "full_text": full_text_count,
        "abstract_only": abstract_only_count,
        "added_this_week": len(this_week),
        "claim_coverage": coverage,
        "unsupported_claims": total_claims - supported,
        "unread_high_relevance": unread_high,
    }


@app.get("/api/cards")
def get_cards(
    status: str | None = None,
    depth: str | None = None,
    relevance: str | None = None,
    tag: str | None = None,
):
    result = []
    for cid in list_card_ids():
        meta, body = read_card(cid)
        d = meta.to_frontmatter()
        if status and d.get("status") != status:
            continue
        if depth and d.get("depth") != depth:
            continue
        if relevance and d.get("relevance") != relevance:
            continue
        if tag and tag not in d.get("tags", []):
            continue
        result.append(d)
    return result


@app.get("/api/cards/{card_id}")
def get_card(card_id: str):
    if not card_exists(card_id):
        raise HTTPException(404, f"Card {card_id} not found")
    meta, body = read_card(card_id)
    return {**meta.to_frontmatter(), "body": body}


class MemoUpdate(BaseModel):
    content: str

@app.put("/api/cards/{card_id}/memo")
def update_memo(card_id: str, data: MemoUpdate):
    if not card_exists(card_id):
        raise HTTPException(404)
    update_card_section(card_id, "メモ・疑問", data.content)
    return {"ok": True}


def _result_to_dict(r: SearchResult, l1_override: str | None = None) -> dict:
    from .cli import _make_card_id
    rel = _assess_relevance(f"{r.title} {r.abstract or ''}")
    cid = _make_card_id(r)
    l1 = l1_override or r.l1
    if not l1 and r.abstract:
        l1 = r.abstract[:120].replace("\n", " ")
    return {
        "title": r.title,
        "authors": r.authors,
        "year": r.year,
        "venue": r.venue,
        "doi": r.doi,
        "url": r.url,
        "source": r.source.value,
        "lang": r.lang.value,
        "abstract": r.abstract,
        "pdf_url": r.pdf_url,
        "is_open_access": r.is_open_access,
        "availability": r.availability,
        "relevance": rel,
        "has_card": card_exists(cid),
        "l1": l1,
    }


def _is_english(text: str) -> bool:
    """テキストがASCII主体（＝英語）かどうか判定する。"""
    if not text:
        return False
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    return ascii_chars / len(text) > 0.8


async def _translate_l1_batch(results: list[SearchResult]) -> list[str | None]:
    """英語アブストラクトをまとめて日本語に翻訳する。"""
    en_indices = []
    snippets = []
    for i, r in enumerate(results):
        if r.abstract and not r.l1 and _is_english(r.abstract[:200]):
            en_indices.append(i)
            snippets.append(r.abstract[:200].replace("\n", " "))

    translations: list[str | None] = [None] * len(results)
    if snippets:
        batch_result = await translate_batch_to_ja(snippets)
        for idx, en_i in enumerate(en_indices):
            t = batch_result[idx]
            if t:
                translations[en_i] = t[:120]
    return translations


def _dedup_key(r: SearchResult) -> str:
    return r.doi or f"{r.title[:50]}_{r.year}"


@app.get("/api/search")
async def api_search(q: str, limit: int = 10):
    ctx = load_research_context()
    en_query = None
    if any(ord(c) > 0x3000 for c in q):
        en_keywords = ctx.get("keywords_en", [])
        if en_keywords:
            en_query = " ".join(en_keywords[:3])

    tasks_list = []
    for adapter_cls in ALL_ADAPTERS:
        adapter = adapter_cls()
        tasks_list.append(_safe_search_api(adapter, q, limit))
        if en_query:
            tasks_list.append(_safe_search_api(adapter, en_query, limit))

    all_results = await asyncio.gather(*tasks_list)

    flat: list[SearchResult] = []
    seen_keys: set[str] = set()
    for batch in all_results:
        for r in batch:
            key = _dedup_key(r)
            if key not in seen_keys:
                seen_keys.add(key)
                flat.append(r)

    translations = await _translate_l1_batch(flat)
    merged = [_result_to_dict(r, translations[i]) for i, r in enumerate(flat)]

    return {
        "results": merged,
        "en_query": en_query,
        "count": len(merged),
    }


@app.get("/api/search/stream")
async def api_search_stream(q: str, limit: int = 10):
    """SSEストリーミング検索。ソースごとに結果を逐次返す。"""
    ctx = load_research_context()
    en_query = None
    if any(ord(c) > 0x3000 for c in q):
        en_keywords = ctx.get("keywords_en", [])
        if en_keywords:
            en_query = " ".join(en_keywords[:3])

    tasks: list[tuple[str, asyncio.Task]] = []
    for adapter_cls in ALL_ADAPTERS:
        adapter = adapter_cls()
        task = asyncio.create_task(_safe_search_api(adapter, q, limit))
        tasks.append((adapter.name, task))
        if en_query:
            task_en = asyncio.create_task(_safe_search_api(adapter, en_query, limit))
            tasks.append((f"{adapter.name}(en)", task_en))

    async def event_stream():
        if en_query:
            yield f"event: meta\ndata: {json.dumps({'en_query': en_query}, ensure_ascii=False)}\n\n"

        seen: set[str] = set()
        pending = {t: name for name, t in tasks}

        while pending:
            done, _ = await asyncio.wait(
                pending.keys(), timeout=0.1, return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                source_name = pending.pop(task)
                batch = task.result()
                new_results = []
                for r in batch:
                    key = _dedup_key(r)
                    if key not in seen:
                        seen.add(key)
                        new_results.append(r)
                if new_results:
                    translations = await _translate_l1_batch(new_results)
                    items = [_result_to_dict(r, translations[i]) for i, r in enumerate(new_results)]
                    yield f"event: results\ndata: {json.dumps({'source': source_name, 'items': items}, ensure_ascii=False)}\n\n"

        yield f"event: done\ndata: {json.dumps({'count': len(seen)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _safe_search_api(adapter, query, limit):
    try:
        return await adapter.search(query, limit)
    except Exception:
        return []


class AbstractRequest(BaseModel):
    urls: list[str]


class SummarizeRequest(BaseModel):
    title: str
    abstract: str = ""
    urls: list[str] = []


class TranslateRequest(BaseModel):
    text: str


@app.post("/api/preview/abstract")
async def api_preview_abstract(req: AbstractRequest):
    """要旨が取れなかった論文のPDF本文から要旨を抜き出す。"""
    found = await preview.abstract_from_pdf(req.urls)
    if not found:
        raise HTTPException(404, "PDFから要旨を取得できませんでした")
    return found


@app.get("/api/preview/enrich")
async def api_preview_enrich(title: str, doi: str | None = None):
    try:
        return await preview.semantic_scholar_enrich(doi, title)
    except preview.PreviewError as e:
        raise HTTPException(e.code, str(e))


@app.get("/api/preview/similar")
async def api_preview_similar(title: str, doi: str | None = None):
    try:
        found = await preview.similar_works(doi, title)
    except Exception:
        raise HTTPException(502, "関連論文の取得に失敗しました")
    return {"results": [_result_to_dict(r) for r in found]}


@app.post("/api/preview/summarize")
async def api_preview_summarize(req: SummarizeRequest):
    try:
        return {"summary": await preview.ai_summary(req.title, req.abstract, req.urls)}
    except preview.PreviewError as e:
        raise HTTPException(e.code, str(e))


@app.post("/api/preview/translate")
async def api_preview_translate(req: TranslateRequest):
    text = req.text[:6000]
    translated = await preview.translate_long(text)
    if translated is None:
        raise HTTPException(502, "翻訳に失敗しました")
    return {"text": translated}


@app.get("/api/claims")
def api_claims():
    claims = load_claims()
    return [{"id": c.id, "text": c.text, "evidence_ids": c.evidence_ids,
             "section": c.section, "status": c.status} for c in claims]


@app.get("/api/claims/check")
def api_claims_check():
    return check_claims()


@app.get("/api/check")
def api_check():
    return check_all()


@app.get("/api/cite")
def api_cite(used_only: bool = False):
    return {"text": generate_reference_list(used_only=used_only)}


@app.get("/api/weekly")
def api_weekly():
    return {"text": generate_weekly_report()}


@app.get("/api/tags")
def api_tags():
    tags: dict[str, int] = {}
    for cid in list_card_ids():
        meta, _ = read_card(cid)
        for t in meta.tags:
            tags[t] = tags.get(t, 0) + 1
    return [{"tag": t, "count": c} for t, c in sorted(tags.items(), key=lambda x: -x[1])]


@app.get("/api/timeline")
def api_timeline():
    entries = []
    for cid in list_card_ids():
        meta, _ = read_card(cid)
        entries.append({
            "id": meta.id,
            "title": meta.title,
            "date": meta.added.isoformat(),
            "type": "add",
        })
    entries.sort(key=lambda x: x["date"], reverse=True)
    return entries[:20]


@app.post("/api/reindex")
def api_reindex():
    count = rebuild_index()
    return {"indexed": count}
