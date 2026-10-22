"""OpenAlex API アダプタ。オープンな学術書誌データベース。"""

from __future__ import annotations

import os
from typing import Optional
import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class OpenAlexAdapter(SourceAdapter):
    name = "OpenAlex"
    source = Source.OPENALEX
    BASE = "https://api.openalex.org/works"

    def _params(self) -> dict:
        p = {}
        email = os.environ.get("OPENALEX_EMAIL")
        if email:
            p["mailto"] = email
        return p

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        params = {**self._params(), "search": query, "per_page": limit}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
        results = resp.json().get("results", [])
        return [self._parse(r) for r in results]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        doi = identifier.strip().removeprefix("https://doi.org/")
        url = f"{self.BASE}/https://doi.org/{doi}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=self._params())
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        return self._parse(resp.json())

    def _parse(self, item: dict) -> SearchResult:
        title = item.get("title", "") or ""
        authors = []
        for auth in item.get("authorships", []):
            name = auth.get("author", {}).get("display_name")
            if name:
                authors.append(name)

        year = item.get("publication_year")
        venue = None
        loc = item.get("primary_location") or {}
        src = loc.get("source") or {}
        if src.get("display_name"):
            venue = src["display_name"]

        doi = item.get("doi", "")
        if doi and doi.startswith("https://doi.org/"):
            doi = doi[16:]

        abstract = None
        inv_index = item.get("abstract_inverted_index")
        if inv_index:
            word_positions = []
            for word, positions in inv_index.items():
                for pos in positions:
                    word_positions.append((pos, word))
            word_positions.sort()
            abstract = " ".join(w for _, w in word_positions)

        pdf_url = None
        is_oa = item.get("open_access", {}).get("is_oa", False)
        oa_url = item.get("open_access", {}).get("oa_url")
        if is_oa and oa_url:
            pdf_url = oa_url

        best_loc = item.get("best_oa_location") or {}
        if best_loc.get("pdf_url"):
            pdf_url = best_loc["pdf_url"]
            is_oa = True

        lang = Lang.EN
        detected = item.get("language")
        if detected == "ja" or (title and any(ord(c) > 0x3000 for c in title)):
            lang = Lang.JA

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=doi or None,
            url=f"https://doi.org/{doi}" if doi else item.get("id"),
            source=self.source,
            lang=lang,
            abstract=abstract,
            pdf_url=pdf_url,
            is_open_access=is_oa,
        )
