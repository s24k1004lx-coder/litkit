import { useCallback, useEffect, useState } from 'react';
import type { SearchResultItem } from './api';
import { paperKey } from './paperUtils';

/** ブックマークは検索画面での「後で読む」候補。カード（文献DB）とは別物で、ブラウザに保存する。 */
export interface Bookmark extends SearchResultItem {
  note?: string;
  tldr?: string | null;
  aiSummary?: string;
  savedAt: number;
}

const STORAGE_KEY = 'litkit-bookmarks';

function load(): Bookmark[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useBookmarks() {
  const [items, setItems] = useState<Bookmark[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* 保存できない環境ではメモリ上のみ */
    }
  }, [items]);

  const has = useCallback((p: SearchResultItem) => items.some((b) => paperKey(b) === paperKey(p)), [items]);

  const toggle = useCallback((p: SearchResultItem) => {
    setItems((prev) => {
      const k = paperKey(p);
      return prev.some((b) => paperKey(b) === k)
        ? prev.filter((b) => paperKey(b) !== k)
        : [...prev, { ...p, savedAt: Date.now() }];
    });
  }, []);

  /** 保存済みなら更新、未保存なら保存して更新する（メモ・要約を書いた時点で自動保存）。 */
  const patch = useCallback((p: SearchResultItem, fields: Partial<Bookmark>) => {
    setItems((prev) => {
      const k = paperKey(p);
      if (prev.some((b) => paperKey(b) === k)) {
        return prev.map((b) => (paperKey(b) === k ? { ...b, ...fields } : b));
      }
      return [...prev, { ...p, ...fields, savedAt: Date.now() }];
    });
  }, []);

  /** 保存済みのときだけ更新する。非同期で返ってきた補足情報の保存用（古い状態を見ないよう更新関数内で判定）。 */
  const patchIfSaved = useCallback((p: SearchResultItem, fields: Partial<Bookmark>) => {
    const k = paperKey(p);
    setItems((prev) => prev.map((b) => (paperKey(b) === k ? { ...b, ...fields } : b)));
  }, []);

  return { items, has, toggle, patch, patchIfSaved };
}

export function bookmarksToMarkdown(items: Bookmark[]): string {
  const lines = ['# ブックマーク済み論文', '', `エクスポート日: ${new Date().toLocaleDateString('ja-JP')}`, ''];
  items.forEach((p, i) => {
    lines.push(`## ${i + 1}. ${p.title}`, '');
    lines.push(`- **著者**: ${p.authors.join(', ') || '不明'}`);
    lines.push(`- **年**: ${p.year ?? '不明'}　**ソース**: ${p.source}`);
    if (p.venue) lines.push(`- **掲載**: ${p.venue}`);
    if (p.doi) lines.push(`- **DOI**: ${p.doi}`);
    if (p.pdf_url) lines.push(`- **PDF**: ${p.pdf_url}`);
    if (p.tldr) lines.push('', '### ひとことで（Semantic Scholar TLDR）', '', p.tldr);
    if (p.aiSummary) lines.push('', '### AI要約（参考・要原文確認）', '', p.aiSummary);
    if (p.abstract) lines.push('', '### 要旨（原文）', '', p.abstract);
    if (p.note) lines.push('', '### メモ', '', p.note);
    lines.push('', '---', '');
  });
  return lines.join('\n');
}
