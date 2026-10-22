"""J-STAGE API アダプタ。国内学会誌の論文検索。"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Optional

import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang

_NS = {
    "a": "http://www.w3.org/2005/Atom",
    "p": "http://prismstandard.org/namespaces/basic/2.0/",
}


def _text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def _pick(entry: ET.Element, tag: str) -> str:
    """<tag><ja>..</ja><en>..</en></tag> から日本語優先で取り出す（空の <en/> に注意）。"""
    parent = entry.find(f"a:{tag}", _NS)
    if parent is None:
        return ""
    return _text(parent.find("a:ja", _NS)) or _text(parent.find("a:en", _NS)) or _text(parent)


class JStageAdapter(SourceAdapter):
    name = "J-STAGE"
    source = Source.JSTAGE
    BASE = "https://api.jstage.jst.go.jp/searchapi/do"

    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        params: dict = {
            "keyword": query,
            "count": limit,
            "start": (page - 1) * limit + 1,
            "service": 3,  # 3 = article
        }
        if year_from:
            params["pubyearfrom"] = year_from
        if year_to:
            params["pubyearto"] = year_to
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
        return self._parse_feed(resp.content)

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        doi = identifier.strip().removeprefix("https://doi.org/")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params={"doi": doi, "service": 3})
            resp.raise_for_status()
        results = self._parse_feed(resp.content)
        return results[0] if results else None

    def _parse_feed(self, raw: bytes) -> list[SearchResult]:
        root = ET.fromstring(raw)
        results = []
        for entry in root.findall("a:entry", _NS):
            r = self._parse_entry(entry)
            if r.title:
                results.append(r)
        return results

    def _parse_entry(self, entry: ET.Element) -> SearchResult:
        authors: list[str] = []
        author_el = entry.find("a:author", _NS)
        if author_el is not None:
            # 日本語表記を優先し、無ければ英語表記を使う
            for lang in ("ja", "en"):
                names = [_text(n) for n in author_el.findall(f"a:{lang}/a:name", _NS)]
                names = [n for n in names if n]
                if names:
                    authors = names
                    break

        pubyear = _text(entry.find("a:pubyear", _NS))
        year = int(pubyear) if pubyear.isdigit() else None

        doi = _text(entry.find("p:doi", _NS)) or None

        # en 側は言語切替用のパス（/-char/ja/）が付かない素のURL
        link = _text(entry.find("a:article_link/a:en", _NS)) or _text(entry.find("a:article_link/a:ja", _NS)) or None
        pdf_url = link[: -len("/_article")] + "/_pdf" if link and link.endswith("/_article") else None

        return SearchResult(
            title=_pick(entry, "article_title"),
            authors=authors,
            year=year,
            venue=_pick(entry, "material_title") or None,
            doi=doi,
            url=link,
            source=self.source,
            lang=Lang.JA,
            abstract=None,  # J-STAGE の検索 API は要旨を返さない
            pdf_url=pdf_url,
            is_open_access=True,
        )
