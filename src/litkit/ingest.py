"""PDF取り込み・本文抽出。"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Optional

import httpx
import pymupdf

from .config import PDF_DIR, INBOX_DIR


async def download_pdf(url: str, filename: str) -> Path:
    dest = PDF_DIR / filename
    if dest.exists():
        return dest
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


def extract_text_from_pdf(pdf_path: Path) -> str:
    doc = pymupdf.open(str(pdf_path))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def extract_metadata_from_pdf(pdf_path: Path) -> dict:
    """PDFからタイトル・著者・DOIの抽出を試みる。"""
    doc = pymupdf.open(str(pdf_path))
    meta = doc.metadata or {}
    first_page_text = doc[0].get_text() if len(doc) > 0 else ""
    doc.close()

    doi = None
    doi_match = re.search(r'10\.\d{4,}/[^\s]+', first_page_text)
    if doi_match:
        doi = doi_match.group(0).rstrip(".,;)")

    return {
        "title": meta.get("title", ""),
        "author": meta.get("author", ""),
        "doi": doi,
    }


def move_from_inbox(pdf_path: Path) -> Path:
    dest = PDF_DIR / pdf_path.name
    shutil.move(str(pdf_path), str(dest))
    return dest


def list_inbox() -> list[Path]:
    return sorted(INBOX_DIR.glob("*.pdf"))
