"""文献カードのデータモデル。YAML frontmatter の構造に1対1対応する。"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from enum import Enum
from typing import Optional


class Source(str, Enum):
    CINII = "cinii"
    JSTAGE = "jstage"
    CROSSREF = "crossref"
    OPENALEX = "openalex"
    SEMANTIC_SCHOLAR = "semantic_scholar"
    ARXIV = "arxiv"
    NDL = "ndl"
    MANUAL = "manual"
    WEB = "web"


class Status(str, Enum):
    UNREAD = "unread"
    READING = "reading"
    READ = "read"


class Depth(str, Enum):
    ABSTRACT_ONLY = "abstract_only"
    FULL_TEXT = "full_text"


class Relevance(str, Enum):
    HIGH = "high"
    MID = "mid"
    LOW = "low"


class Lang(str, Enum):
    JA = "ja"
    EN = "en"


@dataclass
class CardMeta:
    """frontmatter 部分のデータ構造。"""
    id: str
    title: str
    authors: list[str] = field(default_factory=list)
    year: Optional[int] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    source: Source = Source.MANUAL
    lang: Lang = Lang.JA
    pdf: Optional[str] = None
    status: Status = Status.UNREAD
    depth: Depth = Depth.ABSTRACT_ONLY
    rating: Optional[int] = None
    tags: list[str] = field(default_factory=list)
    relevance: Optional[Relevance] = None
    l1: Optional[str] = None
    added: date = field(default_factory=date.today)
    updated: date = field(default_factory=date.today)
    abstract: Optional[str] = None  # 内部用。カードファイルには書き出さない

    def to_frontmatter(self) -> dict:
        d = asdict(self)
        d.pop("abstract", None)
        d["source"] = self.source.value
        d["lang"] = self.lang.value
        d["status"] = self.status.value
        d["depth"] = self.depth.value
        if self.relevance:
            d["relevance"] = self.relevance.value
        d["added"] = self.added.isoformat()
        d["updated"] = self.updated.isoformat()
        return d

    @classmethod
    def from_frontmatter(cls, d: dict) -> CardMeta:
        d = dict(d)
        if "source" in d and d["source"]:
            d["source"] = Source(d["source"])
        if "lang" in d and d["lang"]:
            d["lang"] = Lang(d["lang"])
        if "status" in d and d["status"]:
            d["status"] = Status(d["status"])
        if "depth" in d and d["depth"]:
            d["depth"] = Depth(d["depth"])
        if "relevance" in d and d["relevance"]:
            d["relevance"] = Relevance(d["relevance"])
        for date_field in ("added", "updated"):
            if date_field in d and isinstance(d[date_field], str):
                d[date_field] = date.fromisoformat(d[date_field])
        d.pop("abstract", None)
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class SearchResult:
    """検索結果1件。カード化前の段階。"""
    title: str
    authors: list[str] = field(default_factory=list)
    year: Optional[int] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    source: Source = Source.CROSSREF
    lang: Lang = Lang.JA
    abstract: Optional[str] = None
    pdf_url: Optional[str] = None
    is_open_access: Optional[bool] = None
    l1: Optional[str] = None
    relevance: Optional[Relevance] = None
    has_card: bool = False

    @property
    def availability(self) -> str:
        if self.is_open_access:
            return "PDF"
        return "有料"
