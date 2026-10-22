"""J-STAGE API アダプタ。国内学会誌のオープンアクセス論文検索・PDF取得。"""

from __future__ import annotations

from typing import Optional
import httpx
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class JStageAdapter(SourceAdapter):
    name = "J-STAGE"
    source = Source.JSTAGE
    BASE = "https://api.jstage.jst.go.jp/searchapi/do"

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        params = {
            "keyword": query,
            "count": limit,
            "service": 3,  # 3 = article
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        entries = soup.find_all("entry")
        return [self._parse_entry(e) for e in entries]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        doi = identifier.strip().removeprefix("https://doi.org/")
        params = {"doi": doi, "service": 3}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        entry = soup.find("entry")
        if not entry:
            return None
        return self._parse_entry(entry)

    def _parse_entry(self, entry) -> SearchResult:
        title_el = entry.find("article_title")
        title = ""
        if title_el:
            ja = title_el.find("ja")
            en = title_el.find("en")
            title = (ja.get_text() if ja else "") or (en.get_text() if en else "")

        authors = []
        for author in entry.find_all("author"):
            ja = author.find("ja")
            en = author.find("en")
            name = (ja.get_text() if ja else "") or (en.get_text() if en else "")
            if name:
                authors.append(name)

        year = None
        pubyear = entry.find("pubyear")
        if pubyear:
            try:
                year = int(pubyear.get_text())
            except ValueError:
                pass

        venue = None
        jt = entry.find("journal_title")
        if jt:
            ja = jt.find("ja")
            en = jt.find("en")
            venue = (ja.get_text() if ja else "") or (en.get_text() if en else "")

        doi_el = entry.find("doi")
        doi = doi_el.get_text().strip() if doi_el else None

        abstract = None
        abs_el = entry.find("abstract")
        if abs_el:
            ja = abs_el.find("ja")
            en = abs_el.find("en")
            abstract = (ja.get_text() if ja else "") or (en.get_text() if en else "")
            abstract = abstract.strip() or None

        url_el = entry.find("article_link")
        url = url_el.get_text().strip() if url_el else None

        pdf_url = None
        pdf_el = entry.find("cdjournal")
        if url:
            pdf_url = url.replace("/article/", "/_pdf/") if "/article/" in url else None

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            doi=doi,
            url=url,
            source=self.source,
            lang=Lang.JA,
            abstract=abstract,
            pdf_url=pdf_url,
            is_open_access=True,
        )
