"""arXiv API アダプタ。プレプリント検索・全文PDF取得。"""

from __future__ import annotations

from typing import Optional
import httpx
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..models import SearchResult, Source, Lang


class ArxivAdapter(SourceAdapter):
    name = "arXiv"
    source = Source.ARXIV
    BASE = "http://export.arxiv.org/api/query"

    async def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        params = {
            "search_query": f"all:{query}",
            "start": 0,
            "max_results": limit,
            "sortBy": "relevance",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        entries = soup.find_all("entry")
        return [self._parse(e) for e in entries]

    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        arxiv_id = identifier.strip()
        if "arxiv.org" in arxiv_id:
            arxiv_id = arxiv_id.rstrip("/").split("/")[-1]
        params = {"id_list": arxiv_id}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        entry = soup.find("entry")
        if not entry:
            return None
        return self._parse(entry)

    def _parse(self, entry) -> SearchResult:
        title_el = entry.find("title")
        title = title_el.get_text().strip().replace("\n", " ") if title_el else ""

        authors = []
        for author in entry.find_all("author"):
            name_el = author.find("name")
            if name_el:
                authors.append(name_el.get_text().strip())

        year = None
        published = entry.find("published")
        if published:
            try:
                year = int(published.get_text()[:4])
            except (ValueError, IndexError):
                pass

        abstract = None
        summary = entry.find("summary")
        if summary:
            abstract = summary.get_text().strip().replace("\n", " ")

        arxiv_id = ""
        id_el = entry.find("id")
        if id_el:
            arxiv_id = id_el.get_text().strip().split("/")[-1]

        doi = None
        doi_el = entry.find("arxiv:doi")
        if doi_el:
            doi = doi_el.get_text().strip()

        pdf_url = None
        for link in entry.find_all("link"):
            if link.get("title") == "pdf":
                pdf_url = link.get("href")
                break

        url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None

        return SearchResult(
            title=title,
            authors=authors,
            year=year,
            venue="arXiv",
            doi=doi,
            url=url,
            source=self.source,
            lang=Lang.EN,
            abstract=abstract,
            pdf_url=pdf_url,
            is_open_access=True,
        )
