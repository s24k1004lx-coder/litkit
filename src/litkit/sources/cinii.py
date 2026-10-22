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

    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        params = {
            "q": query,
            "count": limit,
            "start": (page - 1) * limit + 1,
            "format": "json",
        }
        if year_from:
            params["from"] = year_from
        if year_to:
            params["until"] = year_to
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
        title = _first(item.get("title"))

        creators = item.get("dc:creator") or []
        if isinstance(creators, str):
            creators = [creators]
        authors = [c.replace(", ", " ").strip() for c in creators if isinstance(c, str) and c.strip()]

        year = None
        pub_date = str(item.get("prism:publicationDate") or "")
        if len(pub_date) >= 4 and pub_date[:4].isdigit():
            year = int(pub_date[:4])

        venue = _first(item.get("prism:publicationName")) or None

        link = item.get("link")
        url = link.get("@id") if isinstance(link, dict) else item.get("@id", "")

        description = _first(item.get("description"))
        if description:
            description = re.sub(r"<[^>]+>", "", description).strip()

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=_find_doi(item),
            url=url or None,
            source=self.source,
            lang=Lang.JA,
            abstract=description or None,
            is_open_access=None,
        )


def _first(v) -> str:
    if isinstance(v, list):
        return str(v[0]) if v else ""
    return str(v) if v else ""


def _find_doi(item: dict) -> str | None:
    """dc:identifier（@type が DOI のもの）→ rdfs:seeAlso の順に DOI を探す。"""
    ids = item.get("dc:identifier") or []
    if isinstance(ids, dict):
        ids = [ids]
    for ident in ids:
        if isinstance(ident, dict) and str(ident.get("@type", "")).upper().endswith("DOI"):
            value = str(ident.get("@value", "")).strip()
            if value:
                return value.removeprefix("https://doi.org/")
    see = item.get("rdfs:seeAlso") or []
    if isinstance(see, dict):
        see = [see]
    for s in see:
        ref = s.get("@id", "") if isinstance(s, dict) else ""
        if "doi.org/" in ref:
            return ref.split("doi.org/", 1)[1]
    return None
