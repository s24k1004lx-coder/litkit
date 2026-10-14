from .base import SourceAdapter
from .crossref import CrossRefAdapter
from .openalex import OpenAlexAdapter
from .cinii import CiNiiAdapter
from .jstage import JStageAdapter
from .arxiv import ArxivAdapter
from .semantic_scholar import SemanticScholarAdapter
from .ndl import NDLAdapter

ALL_ADAPTERS: list[type[SourceAdapter]] = [
    CrossRefAdapter,
    OpenAlexAdapter,
    CiNiiAdapter,
    JStageAdapter,
    ArxivAdapter,
    SemanticScholarAdapter,
    NDLAdapter,
]

__all__ = ["SourceAdapter", "ALL_ADAPTERS"]
