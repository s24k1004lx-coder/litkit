"""CiNii Research API アダプタ。国内論文の書誌情報検索。"""

from __future__ import annotations

from typing import Optional
import re

import httpx

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class CiNiiAdapter(SourceAdapter):
    name = "CiNii Research"
    source = Source.CINII
    BASE = "https://cir.nii.ac.jp/opensearch/all"

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        params = {
            "q": query,
            "count": limit,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        return [self._parse(item) for item in items]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        if "cir.nii.ac.jp" in identifier:
            url = identifier.rstrip("/") + ".json"
        else:
            return None
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        return self._parse(resp.json())

    def _parse(self, item: dict) -> SearchResult:
        title = item.get("title", "")
        if isinstance(title, list):
            title = title[0] if title else ""

        authors = []
        for creator in item.get("creator", []):
            if isinstance(creator, str):
                authors.append(creator)
            elif isinstance(creator, dict):
                authors.append(creator.get("name", ""))

        year = None
        pub_date = item.get("publicationDate", "")
        if pub_date and len(pub_date) >= 4:
            try:
                year = int(pub_date[:4])
            except ValueError:
                pass

        venue = item.get("publicationName", "")
        if isinstance(venue, list):
            venue = venue[0] if venue else None

        doi = item.get("doi")
        url = item.get("link", {}).get("@id") if isinstance(item.get("link"), dict) else item.get("@id", "")

        description = item.get("description", "")
        if isinstance(description, list):
            description = " ".join(description)
        if description:
            description = re.sub(r"<[^>]+>", "", description).strip()

        naid = ""
        if url and "cir.nii.ac.jp" in url:
            parts = url.rstrip("/").split("/")
            naid = parts[-1] if parts else ""

        card_id = f"cinii-{naid}" if naid else f"cinii-{hash(title) & 0xFFFFFFFF:08x}"

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=doi,
            url=url,
            source=self.source,
            lang=Lang.JA,
            abstract=description or None,
            is_open_access=None,
        )
