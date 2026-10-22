"""Semantic Scholar API アダプタ。国際的な学術論文検索。"""

from __future__ import annotations

import os
from typing import Optional
import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class SemanticScholarAdapter(SourceAdapter):
    name = "Semantic Scholar"
    source = Source.SEMANTIC_SCHOLAR
    BASE = "https://api.semanticscholar.org/graph/v1/paper"

    def _headers(self) -> dict:
        h = {}
        key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
        if key:
            h["x-api-key"] = key
        return h

    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        params = {
            "query": query,
            "limit": limit,
            "offset": (page - 1) * limit,
            "fields": "title,authors,year,venue,externalIds,abstract,isOpenAccess,openAccessPdf",
        }
        if year_from or year_to:
            params["year"] = f"{year_from or ''}-{year_to or ''}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.BASE}/search",
                params=params,
                headers=self._headers(),
            )
            if resp.status_code == 429:
                raise RuntimeError("Semantic Scholar が混み合っています（429）")
            resp.raise_for_status()
        data = resp.json().get("data", [])
        return [self._parse(item) for item in data]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.BASE}/{identifier}",
                params={"fields": "title,authors,year,venue,externalIds,abstract,isOpenAccess,openAccessPdf"},
                headers=self._headers(),
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        return self._parse(resp.json())

    def _parse(self, item: dict) -> SearchResult:
        title = item.get("title", "")
        authors = [a.get("name", "") for a in item.get("authors", [])]
        year = item.get("year")
        venue = item.get("venue") or None

        ext_ids = item.get("externalIds") or {}
        doi = ext_ids.get("DOI")

        abstract = item.get("abstract")
        is_oa = item.get("isOpenAccess", False)
        pdf_url = None
        oa_pdf = item.get("openAccessPdf")
        if oa_pdf and oa_pdf.get("url"):
            pdf_url = oa_pdf["url"]

        paper_id = item.get("paperId", "")

        lang = Lang.EN
        if title and any(ord(c) > 0x3000 for c in title):
            lang = Lang.JA

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=doi,
            url=f"https://doi.org/{doi}" if doi else f"https://www.semanticscholar.org/paper/{paper_id}",
            source=self.source,
            lang=lang,
            abstract=abstract,
            pdf_url=pdf_url,
            is_open_access=is_oa,
        )
