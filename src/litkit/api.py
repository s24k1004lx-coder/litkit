"""FastAPI API層。CLIと同じコア関数を薄く包むだけ。"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import JSONResponse, PlainTextResponse, StreamingResponse

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
from . import auth, preview, service

app = FastAPI(title="litkit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:7777"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """LITKIT_PASSWORD が設定されていれば /api/ を保護する。画面本体(静的ファイル)はログイン画面のため公開。"""
    pw = auth.password()
    if not pw:
        # パスワード無しでトンネル経由の公開を許さない（Cloudflare を通ったリクエストは拒否）
        if auth.is_proxied_by_cloudflare(request):
            return PlainTextResponse(
                "認証が設定されていないため、外部からのアクセスは拒否しています。"
                ".env に LITKIT_PASSWORD を設定して litkit を再起動してください。",
                status_code=403,
            )
        return await call_next(request)

    path = request.url.path
    # 自動生成のAPIドキュメントも /api/ の外にあるので、まとめて保護する
    protected = (path.startswith("/api/") and not path.startswith("/api/auth/")) or path in {"/docs", "/redoc", "/openapi.json"}
    if protected:
        if not auth.verify_token(pw, request.cookies.get(auth.COOKIE)):
            return JSONResponse({"detail": "ログインが必要です"}, status_code=401)
    return await call_next(request)


class LoginRequest(BaseModel):
    password: str


@app.get("/api/auth/status")
def auth_status(request: Request):
    pw = auth.password()
    return {
        "required": bool(pw),
        "authenticated": (not pw) or auth.verify_token(pw, request.cookies.get(auth.COOKIE)),
    }


@app.post("/api/auth/login")
async def auth_login(req: LoginRequest, request: Request):
    pw = auth.password()
    if not pw:
        return {"ok": True}
    key = auth.client_key(request)
    if not auth.throttle.allowed(key):
        raise HTTPException(429, "試行回数が多すぎます。しばらく待ってからやり直してください")
    if not auth.check_password(pw, req.password):
        auth.throttle.fail(key)
        await asyncio.sleep(0.5)  # 総当たりを遅くする
        raise HTTPException(401, "パスワードが違います")
    auth.throttle.reset(key)
    response = JSONResponse({"ok": True})
    response.set_cookie(
        auth.COOKIE, auth.make_token(pw),
        max_age=auth.SESSION_SECONDS, httponly=True, samesite="strict",
        secure=auth.is_secure_request(request), path="/",
    )
    return response


@app.post("/api/auth/logout")
def auth_logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(auth.COOKIE, path="/")
    return response


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


def _select_adapters(sources: str | None):
    """sources はカンマ区切りの Source 値（例: "jstage,cinii"）。空なら全ソース。"""
    if not sources:
        return [cls() for cls in ALL_ADAPTERS]
    wanted = {s.strip() for s in sources.split(",") if s.strip()}
    return [cls() for cls in ALL_ADAPTERS if cls.source.value in wanted]


def _english_query(q: str) -> str | None:
    """日本語クエリのときは、研究の文脈の英語キーワードでも並行して検索する。"""
    if any(ord(c) > 0x3000 for c in q):
        en_keywords = load_research_context().get("keywords_en", [])
        if en_keywords:
            return " ".join(en_keywords[:3])
    return None


@app.get("/api/sources")
def api_sources():
    return [{"id": cls.source.value, "name": cls.name} for cls in ALL_ADAPTERS]


@app.get("/api/search")
async def api_search(
    q: str, limit: int = 10, sources: str | None = None,
    page: int = Query(1, ge=1), year_from: int | None = None, year_to: int | None = None,
):
    en_query = _english_query(q)
    adapters = _select_adapters(sources)

    tasks_list = []
    for adapter in adapters:
        tasks_list.append(_safe_search_api(adapter, q, limit, page, year_from, year_to))
        if en_query:
            tasks_list.append(_safe_search_api(adapter, en_query, limit, page, year_from, year_to))

    all_results = await asyncio.gather(*tasks_list)

    flat: list[SearchResult] = []
    errors: list[dict] = []
    seen_keys: set[str] = set()
    for batch, error in all_results:
        if error:
            errors.append(error)
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
        "errors": errors,
    }


@app.get("/api/search/stream")
async def api_search_stream(
    q: str, limit: int = 10, sources: str | None = None,
    page: int = Query(1, ge=1), year_from: int | None = None, year_to: int | None = None,
):
    """SSEストリーミング検索。ソースごとに結果を逐次返す。失敗したソースは error 付きで通知する。"""
    en_query = _english_query(q)
    adapters = _select_adapters(sources)

    tasks: list[tuple[str, asyncio.Task]] = []
    for adapter in adapters:
        task = asyncio.create_task(_safe_search_api(adapter, q, limit, page, year_from, year_to))
        tasks.append((adapter.name, task))
        if en_query:
            task_en = asyncio.create_task(_safe_search_api(adapter, en_query, limit, page, year_from, year_to))
            tasks.append((f"{adapter.name}(en)", task_en))

    async def event_stream():
        if en_query:
            yield f"event: meta\ndata: {json.dumps({'en_query': en_query}, ensure_ascii=False)}\n\n"

        seen: set[str] = set()
        has_more = False
        pending = {t: name for name, t in tasks}

        while pending:
            done, _ = await asyncio.wait(
                pending.keys(), timeout=0.1, return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                source_name = pending.pop(task)
                batch, error = task.result()
                # 上限ぴったり返したソースがあれば、次のページがある可能性が高い
                has_more = has_more or len(batch) >= limit
                new_results = []
                for r in batch:
                    key = _dedup_key(r)
                    if key not in seen:
                        seen.add(key)
                        new_results.append(r)
                items = []
                if new_results:
                    translations = await _translate_l1_batch(new_results)
                    items = [_result_to_dict(r, translations[i]) for i, r in enumerate(new_results)]
                payload = {"source": source_name, "items": items}
                if error:
                    payload["error"] = error["message"]
                yield f"event: results\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        yield f"event: done\ndata: {json.dumps({'count': len(seen), 'has_more': has_more, 'page': page})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _safe_search_api(adapter, query, limit, page=1, year_from=None, year_to=None):
    """(結果, エラー) を返す。1ソースの失敗で全体を止めない。"""
    try:
        return await adapter.search(query, limit, page=page, year_from=year_from, year_to=year_to), None
    except Exception as e:
        # RuntimeError はアダプタが理由を日本語で付けたもの。それ以外は型名だけ出す（URL等を漏らさない）
        reason = str(e) if isinstance(e, RuntimeError) else type(e).__name__
        return [], {"source": adapter.name, "message": f"{adapter.name}: 取得に失敗しました（{reason}）"}


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


# ---- 取り込み・昇格・質問・レビュー（CLI の add / inbox / upgrade / ask / review に相当） ----

MAX_PDF_BYTES = 50 * 1024 * 1024


def _outcome_dict(o: service.AddOutcome) -> dict:
    return {
        "card_id": o.card_id,
        "created": o.created,
        "depth": o.depth.value,
        "title": o.title,
        "pdf_error": o.pdf_error,
    }


@app.exception_handler(service.ServiceError)
async def _service_error_handler(request: Request, exc: service.ServiceError):
    return JSONResponse({"detail": str(exc)}, status_code=exc.code)


async def _read_pdf_body(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_PDF_BYTES:
        raise HTTPException(413, "PDFが大きすぎます（上限50MB）")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDFが大きすぎます（上限50MB）")
    return bytes(data)


class AddRequest(BaseModel):
    """paper: 検索結果の1件。identifier: DOI または URL。どちらか一方を指定する。"""
    paper: dict | None = None
    identifier: str | None = None


@app.post("/api/add")
async def api_add(req: AddRequest):
    if req.paper:
        outcome = await service.add_result(service.result_from_dict(req.paper))
    elif req.identifier and req.identifier.strip():
        outcome = await service.add_identifier(req.identifier)
    else:
        raise HTTPException(400, "検索結果、DOI、URLのいずれかを指定してください")
    return _outcome_dict(outcome)


@app.get("/api/inbox")
def api_inbox():
    return {"files": service.inbox_files()}


@app.post("/api/inbox/upload")
async def api_inbox_upload(request: Request, filename: str):
    """PDFを literature/inbox/ に置く（本体はリクエストボディ）。カード化は /api/inbox/process。"""
    data = await _read_pdf_body(request)
    dest = service.save_to_inbox(filename, data)
    return {"name": dest.name}


@app.post("/api/inbox/process")
async def api_inbox_process():
    results = []
    for pdf in service.list_inbox():
        try:
            o = await service.add_pdf_from_inbox(pdf)
            results.append({"file": pdf.name, **_outcome_dict(o)})
        except Exception as e:
            reason = str(e) if isinstance(e, service.ServiceError) else type(e).__name__
            results.append({"file": pdf.name, "error": reason})
    return {"results": results}


@app.post("/api/cards/{card_id}/pdf")
async def api_card_upgrade(card_id: str, request: Request):
    """アブストのみのカードに本文PDFを付けて、精読可能なカードに昇格する（本体はPDF）。"""
    data = await _read_pdf_body(request)
    service.upgrade_with_pdf_bytes(card_id, data)
    meta, _ = read_card(card_id)
    return {"ok": True, "depth": meta.depth.value}


@app.delete("/api/cards/{card_id}")
def api_card_delete(card_id: str, delete_pdf: bool = False):
    service.delete_card(card_id, delete_pdf)
    return {"ok": True}


@app.get("/api/ask")
def api_ask(q: str):
    q = q.strip()
    if not q:
        raise HTTPException(400, "質問を入力してください")
    return {"results": service.ask_cards(q), "keywords": load_research_context()["keywords_ja"][:3]}


class ReviewRequest(BaseModel):
    theme: str


@app.post("/api/review")
def api_review(req: ReviewRequest):
    theme = req.theme.strip()
    if not theme:
        raise HTTPException(400, "テーマを入力してください")
    made = service.make_review(theme)
    if made is None:
        return {"found": False, "text": "", "path": None}
    path, text = made
    return {"found": True, "text": text, "path": str(path.relative_to(ROOT))}
