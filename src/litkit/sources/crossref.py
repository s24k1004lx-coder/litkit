"""CrossRef API アダプタ。DOIベースの国際的な書誌・アブストラクト検索。"""

from __future__ import annotations

from typing import Optional
import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class CrossRefAdapter(SourceAdapter):
    name = "CrossRef"
    source = Source.CROSSREF
    BASE = "https://api.crossref.org/works"

    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        params = {
            "query": query,
            "rows": limit,
            "offset": (page - 1) * limit,
            "select": "DOI,title,author,published-print,published-online,"
                      "container-title,abstract,link,is-referenced-by-count",
        }
        filters = []
        if year_from:
            filters.append(f"from-pub-date:{year_from}")
        if year_to:
            filters.append(f"until-pub-date:{year_to}")
        if filters:
            params["filter"] = ",".join(filters)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
        items = resp.json().get("message", {}).get("items", [])
        return [self._parse(item) for item in items]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        doi = identifier.strip().removeprefix("https://doi.org/")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{self.BASE}/{doi}")
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        return self._parse(resp.json()["message"])

    def _parse(self, item: dict) -> SearchResult:
        titles = item.get("title", [])
        title = titles[0] if titles else ""
        authors = []
        for a in item.get("author", []):
            name = f"{a.get('family', '')} {a.get('given', '')}".strip()
            if name:
                authors.append(name)

        year = None
        for key in ("published-print", "published-online"):
            parts = item.get(key, {}).get("date-parts", [[]])
            if parts and parts[0]:
                year = parts[0][0]
                break

        venue_list = item.get("container-title", [])
        venue = venue_list[0] if venue_list else None

        abstract = item.get("abstract", "")
        if abstract:
            from bs4 import BeautifulSoup
            abstract = BeautifulSoup(abstract, "html.parser").get_text().strip()

        pdf_url = None
        is_oa = False
        for link in item.get("link", []):
            if link.get("content-type") == "application/pdf":
                pdf_url = link.get("URL")
                is_oa = True
                break

        lang = Lang.EN
        if title and any(ord(c) > 0x3000 for c in title):
            lang = Lang.JA

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=item.get("DOI"),
            url=f"https://doi.org/{item.get('DOI')}" if item.get("DOI") else None,
            source=self.source,
            lang=lang,
            abstract=abstract or None,
            pdf_url=pdf_url,
            is_open_access=is_oa,
        )
