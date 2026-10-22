"""国立国会図書館サーチ API アダプタ。雑誌記事索引（論文）と図書・雑誌の書誌を検索する。"""

from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang

_NS = {
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
}


def _text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


class NDLAdapter(SourceAdapter):
    name = "国立国会図書館サーチ"
    source = Source.NDL
    BASE = "https://ndlsearch.ndl.go.jp/api/opensearch"

    # 雑誌記事索引（論文）と NDL 蔵書（図書・雑誌）。論文を優先して並べる
    DPID_ARTICLES = "zassaku"
    DPID_BOOKS = "iss-ndl-opac"

    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        book_limit = max(limit // 3, 3)
        articles, books = await asyncio.gather(
            self._fetch(self.DPID_ARTICLES, query, limit, page, year_from, year_to),
            self._fetch(self.DPID_BOOKS, query, book_limit, page, year_from, year_to),
            return_exceptions=True,
        )
        results: list[SearchResult] = []
        for part in (articles, books):
            if isinstance(part, list):
                results.extend(part)
        if not results and isinstance(articles, Exception):
            raise articles
        return results

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        return None

    async def _fetch(
        self, dpid: str, query: str, limit: int, page: int,
        year_from: int | None, year_to: int | None,
    ) -> list[SearchResult]:
        params: dict = {"any": query, "cnt": limit, "idx": (page - 1) * limit + 1, "dpid": dpid}
        if year_from:
            params["from"] = year_from
        if year_to:
            params["until"] = year_to
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
        root = ET.fromstring(resp.content)
        items = [self._parse(i, dpid == self.DPID_ARTICLES) for i in root.iter("item")]
        return [r for r in items if r.title]

    def _parse(self, item: ET.Element, is_article: bool) -> SearchResult:
        title = _text(item.find("dc:title", _NS)) or _text(item.find("title"))

        authors: list[str] = []
        for c in item.findall("dc:creator", _NS):
            name = _text(c)
            if name and name not in authors:
                authors.append(name)

        year = None
        for tag in ("dcterms:issued", "dc:date"):
            m = re.match(r"\d{4}", _text(item.find(tag, _NS)))
            if m:
                year = int(m.group())
                break

        venue = None
        if is_article:
            # 記事索引では掲載誌・巻号が dc:description に「掲載誌：…」で入る
            for d in item.findall("dc:description", _NS):
                t = _text(d)
                if t.startswith("掲載誌："):
                    venue = t.removeprefix("掲載誌：").strip() or None
                    break
        else:
            venue = _text(item.find("dc:publisher", _NS)) or None

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=None,
            url=_text(item.find("link")) or None,
            source=self.source,
            lang=Lang.JA,
            abstract=None,  # NDL サーチは要旨を返さない（description は書誌の定型文）
            is_open_access=None,
        )
