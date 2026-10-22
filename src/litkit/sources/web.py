"""行政資料等のWeb直接取得アダプタ。"""

from __future__ import annotations

from typing import Optional
import httpx
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class WebAdapter(SourceAdapter):
    name = "Web"
    source = Source.WEB

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        return []

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        """URLからページのタイトルと概要を取得する。"""
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(identifier)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        title = ""
        title_el = soup.find("title")
        if title_el:
            title = title_el.get_text().strip()

        description = ""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "")

        return SearchResult(
            title=title,
            authors=[],
            year=None,
            venue=identifier,
            doi=None,
            url=identifier,
            source=self.source,
            lang=Lang.JA,
            abstract=description or None,
            is_open_access=True,
        )
