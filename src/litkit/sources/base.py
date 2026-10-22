"""外部ソースアダプタの共通インターフェース。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from ..models import SearchResult, Source


class SourceAdapter(ABC):
    """全ソースアダプタが実装する共通API。"""

    name: str
    source: Source

    @abstractmethod
    async def search(
        self, query: str, limit: int = 10, *,
        page: int = 1, year_from: int | None = None, year_to: int | None = None,
    ) -> list[SearchResult]:
        """query を検索する。page は1始まり。年範囲に対応できないソースは無視してよい（呼び出し側でも絞り込む）。"""
        ...

    @abstractmethod
    async def fetch_metadata(self, identifier: str) -> Optional[SearchResult]:
        """DOI/URLなどの識別子から書誌情報を取得する。"""
        ...

    async def fetch_pdf_url(self, result: SearchResult) -> Optional[str]:
        """オープンアクセスPDFのURLを返す。無ければNone。"""
        return result.pdf_url
