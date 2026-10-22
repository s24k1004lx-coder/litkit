import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, Star, ArrowLeft, Download } from 'lucide-react';
import { api, type SearchResultItem } from '../lib/api';
import { useBookmarks, bookmarksToMarkdown, type Bookmark } from '../lib/bookmarks';
import { bulletPoints, paperKey } from '../lib/paperUtils';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { SearchDetailPanel } from '../components/SearchDetailPanel';

type Tab = 'results' | 'bookmarks';
type SortKey = 'arrival' | 'relevance' | 'year';

const RELEVANCE_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };
const JA_KEY = 'litkit-search-ja';

const ctl: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 'var(--radius-ctl)', border: '1px solid var(--border)',
  background: 'var(--surface-sunken)', color: 'var(--text)', fontSize: 12,
};

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

  const bm = useBookmarks();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
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
        showToast('関連論文が見つかりませんでした');
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
        if (el && document.activeElement !== el) {
          e.preventDefault();
          el.focus();
        }
      }
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  const relevanceBadge = (r: string) => {
    if (r === 'high') return <Badge variant="accent">高</Badge>;
    if (r === 'mid') return <Badge variant="warn">中</Badge>;
    return <Badge>低</Badge>;
  };

  const renderRow = (r: SearchResultItem) => {
    const key = paperKey(r);
    const isSelected = selected != null && paperKey(selected) === key;
    const saved = bm.has(r);
    const points = r.l1 ? [] : bulletPoints(r.abstract, r.title);
    return (
      <div
        key={key}
        onClick={() => setSelected(r)}
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          background: isSelected ? 'var(--accent-weak)' : 'transparent',
          transition: 'background 150ms',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {relevanceBadge(r.relevance)}
          <Badge variant={r.is_open_access ? 'ok' : 'default'}>{r.availability}</Badge>
          {r.has_card && <Badge variant="info">取込済</Badge>}
          <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{r.year || '?'}</span>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{r.source}</span>
          <button
            onClick={(e) => { e.stopPropagation(); bm.toggle(r); }}
            aria-label={saved ? 'ブックマーク解除' : 'ブックマーク'}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: saved ? 'var(--accent)' : 'var(--text-subtle)' }}
          >
            <Star size={15} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{r.title}</div>
        {r.l1 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {r.l1}
          </div>
        )}
        {points.length > 0 && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {points.map((s, i) => (
              <li key={i} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const tabButton = (t: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
        fontWeight: tab === t ? 700 : 500,
        color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
        borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      {label} <span className="tabular-nums" style={{ fontSize: 11 }}>{count}</span>
    </button>
  );

  const selectedBookmark: Bookmark | undefined = selected
    ? bm.items.find((b) => paperKey(b) === paperKey(selected))
    : undefined;

  return (
    <div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>文献検索</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            id="search-input"
            type="text"
            placeholder="検索クエリを入力… (/ でフォーカス)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 'var(--radius-ctl)',
              border: '1px solid var(--border)',
              background: 'var(--surface-sunken)',
              color: 'var(--text)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={doSearch}
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-ctl)',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            opacity: loading || !query.trim() ? 0.5 : 1,
          }}
        >
          検索
        </button>
      </div>

      {enQuery && (
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>
          英語クエリ: {enQuery}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        <label>年{' '}
          <input type="number" value={yearFrom} onChange={e => setYearFrom(e.target.value)} placeholder="from" min={1900} max={2100} style={{ ...ctl, width: 70 }} />
          {' – '}
          <input type="number" value={yearTo} onChange={e => setYearTo(e.target.value)} placeholder="to" min={1900} max={2100} style={{ ...ctl, width: 70 }} />
        </label>
        <label>並替{' '}
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={ctl}>
            <option value="arrival">取得順</option>
            <option value="relevance">研究関連度</option>
            <option value="year">年（新→旧）</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={ja} onChange={e => toggleJa(e.target.checked)} /> 詳細を日本語訳
        </label>
      </div>

      {sources.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {['all', ...sources].map((s) => (
            <button
              key={s}
              onClick={() => setSrcFilter(s)}
              style={{
                ...ctl, cursor: 'pointer',
                ...(srcFilter === s ? { background: 'var(--accent-weak)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : {}),
              }}
            >
              {s === 'all' ? '全て' : s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabButton('results', '検索結果', visible.length)}
        {tabButton('bookmarks', 'ブックマーク', bm.items.length)}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'results' && (
            <>
              {similar && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 16px', fontSize: 12, background: 'var(--info-weak)', color: 'var(--info)' }}>
                  <span>「{similar.title.slice(0, 50)}{similar.title.length > 50 ? '…' : ''}」の関連論文（{similar.items.length}件）</span>
                  <button onClick={() => setSimilar(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>
                    <ArrowLeft size={12} /> 検索結果に戻る
                  </button>
                </div>
              )}

              {(loading || similarLoading) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>
                    {similarLoading ? '関連論文を取得中…' : `検索中… ${sourcesLoaded.length > 0 ? `(${sourcesLoaded.length} ソース完了)` : ''}`}
                  </span>
                </div>
              )}

              {!loading && !similarLoading && searched && visible.length === 0 && (
                <EmptyState
                  icon={<Search size={40} />}
                  title="結果なし"
                  description={base.length > 0 ? '絞り込み条件を緩めてみてください' : '別のキーワードで検索してみてください'}
                />
              )}

              {visible.map(renderRow)}
            </>
          )}

          {tab === 'bookmarks' && (
            bm.items.length === 0 ? (
              <EmptyState
                icon={<Star size={40} />}
                title="ブックマークなし"
                description="検索結果の ☆ で、後で読みたい論文を保存できます"
              />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <span>{bm.items.length}件（このブラウザに保存。文献カードとは別管理）</span>
                  <button onClick={exportBookmarks} style={{ ...ctl, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <Download size={12} /> Markdownエクスポート
                  </button>
                </div>
                {bm.items.map(renderRow)}
              </>
            )
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
            onSave={(fields) => { bm.patch(selected, fields); showToast('保存しました'); }}
            onSaveIfBookmarked={(fields) => bm.patchIfSaved(selected, fields)}
            onSimilar={() => findSimilar(selected)}
          />
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px',
          background: 'var(--text)', color: 'var(--bg)', borderRadius: 'var(--radius-ctl)', fontSize: 12,
          boxShadow: 'var(--shadow-pop)', zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
