import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { api, type SearchResultItem } from '../lib/api';
import { useBookmarks, bookmarksToMarkdown, type Bookmark } from '../lib/bookmarks';
import { bulletPoints, citeAPA, paperKey } from '../lib/paperUtils';
import { sourceClass, sourceName } from '../lib/sources';
import { SearchDetailPanel } from '../components/SearchDetailPanel';
import '../styles/paper.css';

type Tab = 'results' | 'bookmarks';
type SortKey = 'arrival' | 'relevance' | 'year';

const RELEVANCE_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };
const RELEVANCE_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' };
const JA_KEY = 'litkit-search-ja';

function loadJa(): boolean {
  try {
    return localStorage.getItem(JA_KEY) === '1';
  } catch {
    return false;
  }
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [enQuery, setEnQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<SearchResultItem | null>(null);
  const [sourcesLoaded, setSourcesLoaded] = useState<string[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const [tab, setTab] = useState<Tab>('results');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [sort, setSort] = useState<SortKey>('arrival');
  const [srcFilter, setSrcFilter] = useState<string>('all');
  const [ja, setJa] = useState(loadJa);
  const [similar, setSimilar] = useState<{ title: string; items: SearchResultItem[] } | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const bm = useBookmarks();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  const doSearch = useCallback(() => {
    if (!query.trim()) return;

    abortRef.current?.();

    setLoading(true);
    setSearched(true);
    setTab('results');
    setSimilar(null);
    setSelected(null);
    setResults([]);
    setEnQuery(null);
    setSourcesLoaded([]);
    setSrcFilter('all');

    const seenKeys = new Set<string>();

    const abort = api.searchStream(query, 20, {
      onMeta: (data) => setEnQuery(data.en_query),
      onResults: (data) => {
        const newItems = data.items.filter((item) => {
          const key = paperKey(item);
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        if (newItems.length > 0) {
          setResults((prev) => [...prev, ...newItems]);
        }
        setSourcesLoaded((prev) => [...prev, data.source]);
      },
      onDone: () => setLoading(false),
      onError: () => setLoading(false),
    });

    abortRef.current = abort;
  }, [query]);

  const findSimilar = useCallback(async (p: SearchResultItem) => {
    setSimilarLoading(true);
    setTab('results');
    try {
      const r = await api.previewSimilar(p.title, p.doi);
      if (r.results.length === 0) {
        showToast('関連論文の情報がありません');
      } else {
        setSimilar({ title: p.title, items: r.results });
        setSelected(null);
      }
    } catch {
      showToast('関連論文の取得に失敗しました');
    }
    setSimilarLoading(false);
  }, [showToast]);

  useEffect(() => {
    return () => abortRef.current?.();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const el = document.getElementById('search-input');
        if (el && document.activeElement !== el && !(document.activeElement instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          el.focus();
        }
      }
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 詳細パネルを開いている間は背面のスクロールを止める
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

  const toggleJa = (v: boolean) => {
    setJa(v);
    try {
      localStorage.setItem(JA_KEY, v ? '1' : '0');
    } catch {
      /* 保存できなくても今回の表示には反映される */
    }
  };

  const exportBookmarks = async () => {
    const md = bookmarksToMarkdown(bm.items);
    try {
      await navigator.clipboard.writeText(md);
      showToast('Markdownをクリップボードにコピーしました');
    } catch {
      const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const copyCitation = async (p: SearchResultItem) => {
    try {
      await navigator.clipboard.writeText(citeAPA(p));
      showToast('APA引用をコピーしました');
    } catch {
      showToast('コピーに失敗しました');
    }
  };

  const base = similar ? similar.items : results;
  const sources = useMemo(() => [...new Set(base.map((r) => r.source))], [base]);

  const visible = useMemo(() => {
    const from = yearFrom ? Number(yearFrom) : null;
    const to = yearTo ? Number(yearTo) : null;
    const filtered = base.filter((r) => {
      if (srcFilter !== 'all' && r.source !== srcFilter) return false;
      // 年が不明な論文は、年で絞り込んでも落とさない
      if (r.year != null) {
        if (from != null && r.year < from) return false;
        if (to != null && r.year > to) return false;
      }
      return true;
    });
    if (sort === 'relevance') {
      return [...filtered].sort((a, b) => RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance]);
    }
    if (sort === 'year') {
      return [...filtered].sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
    }
    return filtered;
  }, [base, srcFilter, yearFrom, yearTo, sort]);

  const renderPaper = (r: SearchResultItem, removable = false) => {
    const saved = bm.has(r);
    const points = r.l1 ? [r.l1] : bulletPoints(r.abstract, r.title);
    const href = r.url || (r.doi ? (r.doi.startsWith('http') ? r.doi : `https://doi.org/${r.doi}`) : '');
    const doiHref = r.doi ? (r.doi.startsWith('http') ? r.doi : `https://doi.org/${r.doi}`) : '';
    return (
      <div className="paper" key={paperKey(r)}>
        <h3 className="p-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">{r.title || '（タイトルなし）'}</a>
          ) : (
            <span className={r.title ? undefined : 'p-empty-title'}>{r.title || '（タイトルなし）'}</span>
          )}
        </h3>
        <div className="p-meta">
          <span>{r.authors.slice(0, 4).join(', ') || '著者不明'}{r.authors.length > 4 ? ' 他' : ''}</span>
          {r.year && <><span className="sep">/</span><span>{r.year}</span></>}
        </div>
        <div className="p-badges">
          <span className={`bdg bdg-api ${sourceClass(r.source)}`}>{sourceName(r.source)}</span>
          <span className={`bdg bdg-api rel-${r.relevance}`}>関連度 {RELEVANCE_LABEL[r.relevance] ?? r.relevance}</span>
          {r.has_card && <span className="bdg bdg-api bdg-card">取込済</span>}
          {r.venue && <span className="bdg bdg-src" title={r.venue}>{r.venue}</span>}
          {r.pdf_url && <a className="bdg bdg-pdf" href={r.pdf_url} target="_blank" rel="noopener noreferrer">PDF</a>}
          {doiHref && <a className="bdg bdg-doi" href={doiHref} target="_blank" rel="noopener noreferrer">DOI</a>}
        </div>
        {points.length > 0 && (
          <ul className="kp">
            {points.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        <div className="p-actions">
          <button className="act detail" onClick={() => setSelected(r)}>{r.abstract ? '要約を見る' : '要約を探す'}</button>
          <button className={`act ${saved ? 'on' : ''}`} onClick={() => { bm.toggle(r); showToast(saved ? 'ブックマーク解除' : 'ブックマークに追加'); }}>
            {saved ? '★ 保存済' : '☆ 保存'}
          </button>
          <button className="act" onClick={() => findSimilar(r)}>類似論文</button>
          <button className="act" onClick={() => copyCitation(r)}>引用コピー</button>
          {removable && <button className="act rm" onClick={() => bm.toggle(r)}>削除</button>}
        </div>
      </div>
    );
  };

  const selectedBookmark: Bookmark | undefined = selected
    ? bm.items.find((b) => paperKey(b) === paperKey(selected))
    : undefined;

  const spinning = loading || similarLoading;

  return (
    <div className={`pr${searched ? ' searched' : ''}`}>
      <header className="hero">
        <div className="hero-bg" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-inner">
          <div className="brand">
            <div className="brand-kicker"><span className="ver">litkit</span>マルチソース論文検索</div>
            <h1 className="brand-title">文献検索</h1>
            <div className="brand-sub">Literature Search</div>
          </div>
          <div className="search-wrap">
            <input
              id="search-input"
              type="text"
              placeholder="キーワード検索（日本語・英語）  / でフォーカス"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
            <button className="btn-search" onClick={doSearch} disabled={loading || !query.trim()} style={{ opacity: loading || !query.trim() ? 0.6 : 1 }}>検索</button>
          </div>
        </div>
      </header>

      <div className="subbar">
        <div className="subbar-inner">
          <label>年{' '}
            <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="from" min={1900} max={2100} />
            {' – '}
            <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="to" min={1900} max={2100} />
          </label>
          <label>並替{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="arrival">取得順</option>
              <option value="relevance">研究関連度</option>
              <option value="year">年（新→旧）</option>
            </select>
          </label>
          <label className="ja-toggle">
            <input type="checkbox" checked={ja} onChange={(e) => toggleJa(e.target.checked)} /> 詳細を日本語訳
          </label>
          {enQuery && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>英語クエリ: {enQuery}</span>}
        </div>
      </div>

      {sources.length > 1 && (
        <div className="srcbar">
          <div className="srcbar-inner">
            <span className="lbl">ソース:</span>
            {['all', ...sources].map((s) => (
              <button key={s} className={`src-btn ${srcFilter === s ? 'on' : ''}`} onClick={() => setSrcFilter(s)}>
                {s === 'all' ? '全て' : sourceName(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="main">
        <div className="tabs">
          <button className={`tab ${tab === 'results' ? 'on' : ''}`} onClick={() => setTab('results')}>
            検索結果 <span className="n">{visible.length}</span>
          </button>
          <button className={`tab ${tab === 'bookmarks' ? 'on' : ''}`} onClick={() => setTab('bookmarks')}>
            ブックマーク <span className="n">{bm.items.length}</span>
          </button>
        </div>

        {tab === 'results' && (
          <div>
            {similar && (
              <div className="sim-bar">
                <span><b>「{similar.title.slice(0, 50)}{similar.title.length > 50 ? '…' : ''}」</b>の関連論文（{similar.items.length}件）</span>
                <button onClick={() => setSimilar(null)}>← 検索に戻る</button>
              </div>
            )}

            {spinning && visible.length === 0 ? (
              <div className="spinner-wrap"><div className="spinner" /></div>
            ) : !searched && !similar ? (
              <div className="empty">
                <b>キーワードを入力して検索</b>
                CiNii・J-STAGE・Crossref・OpenAlex・Semantic Scholar・arXiv・NDL から横断検索します
              </div>
            ) : visible.length === 0 && !spinning ? (
              <div className="empty">
                <b>該当する論文がありません</b>
                {base.length > 0 ? '絞り込み条件を緩めてみてください' : 'キーワードを変えて再検索してください'}
              </div>
            ) : (
              <>
                {spinning && (
                  <div className="d-loading" style={{ marginTop: 20, marginBottom: 0 }}>
                    <div className="spinner sm" />
                    {similarLoading ? '関連論文を取得中…' : `検索中…（${sourcesLoaded.length} ソース完了）`}
                  </div>
                )}
                {visible.map((r) => renderPaper(r))}
              </>
            )}
          </div>
        )}

        {tab === 'bookmarks' && (
          <div>
            {bm.items.length === 0 ? (
              <div className="empty"><b>ブックマークなし</b>「☆ 保存」で論文を保存できます</div>
            ) : (
              <>
                <div className="bm-bar">
                  <span className="info">{bm.items.length}件（このブラウザに保存。文献カードとは別管理）</span>
                  <button className="btn-export" onClick={exportBookmarks}>Markdownエクスポート</button>
                </div>
                {bm.items.map((r) => renderPaper(r, true))}
              </>
            )}
          </div>
        )}
      </div>

      {selected && (
        <SearchDetailPanel
          key={paperKey(selected)}
          paper={selected}
          bookmark={selectedBookmark}
          ja={ja}
          onClose={() => setSelected(null)}
          onToggleBookmark={() => bm.toggle(selected)}
          onSave={(fields) => { bm.patch(selected, fields); showToast('メモを保存しました'); }}
          onSaveIfBookmarked={(fields) => bm.patchIfSaved(selected, fields)}
          onSimilar={() => findSimilar(selected)}
        />
      )}

      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </div>
  );
}
