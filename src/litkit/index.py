"""SQLite FTS5 索引。Markdownカードから再生成可能なキャッシュ。CLIから独立して呼べる設計。"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Optional

from .config import INDEX_DB, CARDS_DIR
from .card import read_card, list_card_ids


def get_connection() -> sqlite3.Connection:
    INDEX_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(INDEX_DB))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: Optional[sqlite3.Connection] = None) -> None:
    own_conn = conn is None
    if own_conn:
        conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            title TEXT,
            authors TEXT,
            year INTEGER,
            venue TEXT,
            doi TEXT,
            url TEXT,
            source TEXT,
            lang TEXT,
            status TEXT,
            depth TEXT,
            relevance TEXT,
            l1 TEXT,
            tags TEXT,
            body TEXT,
            added TEXT,
            updated TEXT
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
            id, title, authors, l1, tags, body,
            content='cards',
            content_rowid='rowid'
        );
        CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
            INSERT INTO cards_fts(rowid, id, title, authors, l1, tags, body)
            VALUES (new.rowid, new.id, new.title, new.authors, new.l1, new.tags, new.body);
        END;
        CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
            INSERT INTO cards_fts(cards_fts, rowid, id, title, authors, l1, tags, body)
            VALUES ('delete', old.rowid, old.id, old.title, old.authors, old.l1, old.tags, old.body);
        END;
        CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
            INSERT INTO cards_fts(cards_fts, rowid, id, title, authors, l1, tags, body)
            VALUES ('delete', old.rowid, old.id, old.title, old.authors, old.l1, old.tags, old.body);
            INSERT INTO cards_fts(rowid, id, title, authors, l1, tags, body)
            VALUES (new.rowid, new.id, new.title, new.authors, new.l1, new.tags, new.body);
        END;
    """)
    if own_conn:
        conn.close()


def rebuild_index() -> int:
    """全カードからFTS索引を再構築する。"""
    conn = get_connection()
    init_db(conn)
    conn.execute("DELETE FROM cards")
    count = 0
    for card_id in list_card_ids():
        meta, body = read_card(card_id)
        conn.execute(
            """INSERT OR REPLACE INTO cards
               (id, title, authors, year, venue, doi, url, source, lang,
                status, depth, relevance, l1, tags, body, added, updated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                meta.id, meta.title, ", ".join(meta.authors), meta.year,
                meta.venue, meta.doi, meta.url, meta.source.value, meta.lang.value,
                meta.status.value, meta.depth.value,
                meta.relevance.value if meta.relevance else None,
                meta.l1, ", ".join(meta.tags), body,
                meta.added.isoformat(), meta.updated.isoformat(),
            ),
        )
        count += 1
    conn.commit()
    conn.close()
    return count


def index_card(card_id: str) -> None:
    """1枚のカードを索引に追加/更新する。"""
    conn = get_connection()
    init_db(conn)
    meta, body = read_card(card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.execute(
        """INSERT INTO cards
           (id, title, authors, year, venue, doi, url, source, lang,
            status, depth, relevance, l1, tags, body, added, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            meta.id, meta.title, ", ".join(meta.authors), meta.year,
            meta.venue, meta.doi, meta.url, meta.source.value, meta.lang.value,
            meta.status.value, meta.depth.value,
            meta.relevance.value if meta.relevance else None,
            meta.l1, ", ".join(meta.tags), body,
            meta.added.isoformat(), meta.updated.isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def _query_terms(query: str) -> list[str]:
    """検索語を単語に分ける。記号を落とすので、FTS5の構文エラー（"ui-smoke" など）にならない。"""
    return [t for t in re.findall(r"\w+", query) if t]


def search_cards(query: str, limit: int = 20) -> list[dict]:
    """全文検索する。CLIからもAPIからも呼べる。

    FTS5（いずれかの語に一致）で探し、1件も見つからなければ部分一致で探す。
    日本語は FTS5 の既定の分かち書きでは語に分かれないため、後者が必要。
    """
    terms = _query_terms(query)
    if not terms:
        return []
    conn = get_connection()
    init_db(conn)
    match = " OR ".join('"' + t.replace('"', '""') + '"' for t in terms)
    rows = conn.execute(
        """SELECT c.*, rank
           FROM cards_fts fts
           JOIN cards c ON c.id = fts.id
           WHERE cards_fts MATCH ?
           ORDER BY rank
           LIMIT ?""",
        (match, limit),
    ).fetchall()
    if not rows:
        like = " OR ".join("(title LIKE ? OR l1 LIKE ? OR tags LIKE ? OR body LIKE ?)" for _ in terms)
        params = [f"%{t}%" for t in terms for _ in range(4)]
        rows = conn.execute(f"SELECT * FROM cards WHERE {like} LIMIT ?", (*params, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_cards_meta() -> list[dict]:
    """全カードのメタ情報を返す（本文除く）。"""
    conn = get_connection()
    init_db(conn)
    rows = conn.execute(
        "SELECT id, title, authors, year, venue, doi, source, lang, "
        "status, depth, relevance, l1, tags, added, updated FROM cards"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_card_by_doi(doi: str) -> Optional[dict]:
    conn = get_connection()
    init_db(conn)
    row = conn.execute("SELECT * FROM cards WHERE doi = ?", (doi,)).fetchone()
    conn.close()
    return dict(row) if row else None
