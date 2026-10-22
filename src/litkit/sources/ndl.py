"""国立国会図書館サーチ API アダプタ。国内書誌情報の検索。"""

from __future__ import annotations

from typing import Optional
import httpx
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class NDLAdapter(SourceAdapter):
    name = "国立国会図書館サーチ"
    source = Source.NDL
    BASE = "https://ndlsearch.ndl.go.jp/api/opensearch"

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        params = {
            "any": query,
            "cnt": limit,
            "dpid": "iss-ndl-opac",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        items = soup.find_all("item")
        return [self._parse(item) for item in items]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        return None

    def _parse(self, item) -> SearchResult:
        title_el = item.find("title")
        title = title_el.get_text().strip() if title_el else ""

        authors = []
        for creator in item.find_all("dc:creator"):
            name = creator.get_text().strip()
            if name:
                authors.append(name)

        year = None
        date_el = item.find("dc:date")
        if date_el:
            text = date_el.get_text().strip()
            if len(text) >= 4:
                try:
                    year = int(text[:4])
                except ValueError:
                    pass

        venue = None
        pub_el = item.find("dc:publisher")
        if pub_el:
            venue = pub_el.get_text().strip()

        link_el = item.find("link")
        url = link_el.get_text().strip() if link_el else None

        desc_el = item.find("description")
        abstract = None
        if desc_el:
            raw = desc_el.get_text().strip()
            if raw:
                abstract = BeautifulSoup(raw, "html.parser").get_text().strip()

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=None,
            url=url,
            source=self.source,
            lang=Lang.JA,
            abstract=abstract if abstract else None,
            is_open_access=None,
        )
