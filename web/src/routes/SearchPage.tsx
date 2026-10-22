import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, BookOpen, Loader2 } from 'lucide-react';
import { api, type SearchResultItem } from '../lib/api';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [enQuery, setEnQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sourcesLoaded, setSourcesLoaded] = useState<string[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const doSearch = useCallback(() => {
    if (!query.trim()) return;

    abortRef.current?.();

    setLoading(true);
    setSearched(true);
    setSelected(null);
    setResults([]);
    setEnQuery(null);
    setSourcesLoaded([]);

    const seenKeys = new Set<string>();

    const abort = api.searchStream(query, 20, {
      onMeta: (data) => setEnQuery(data.en_query),
      onResults: (data) => {
        const newItems = data.items.filter((item) => {
          const key = item.doi || `${item.title.slice(0, 50)}_${item.year}`;
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

  const relevanceBadge = (r: string) => {
    if (r === 'high') return <Badge variant="accent">高</Badge>;
    if (r === 'mid') return <Badge variant="warn">中</Badge>;
    return <Badge>低</Badge>;
  };

  return (
    <div>
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
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 16 }}>
          英語クエリ: {enQuery}
        </div>
      )}

      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
            }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span>検索中… {sourcesLoaded.length > 0 && `(${sourcesLoaded.length} ソース完了)`}</span>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <EmptyState
              icon={<Search size={40} />}
              title="結果なし"
              description="別のキーワードで検索してみてください"
            />
          )}

          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => setSelected(i)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected === i ? 'var(--accent-weak)' : 'transparent',
                transition: 'background 150ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {relevanceBadge(r.relevance)}
                <Badge variant={r.is_open_access ? 'ok' : 'default'}>{r.availability}</Badge>
                {r.has_card && <Badge variant="info">取込済</Badge>}
                <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{r.year || '?'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{r.source}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{r.title}</div>
              {r.l1 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {r.l1}
                </div>
              )}
            </div>
          ))}
        </div>

        {selected !== null && results[selected] && (
          <DetailPanel result={results[selected]} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function DetailPanel({ result: r, onClose }: { result: SearchResultItem; onClose: () => void }) {
  return (
    <div
      style={{
        width: 400,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: 20,
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 100px)',
        animation: 'slideIn 200ms ease-out',
      }}
    >
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>{r.title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {r.authors.join(', ') || '著者不明'} ({r.year || '?'})
        {r.venue && <><br />{r.venue}</>}
        {r.doi && <><br />DOI: {r.doi}</>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>概要</h4>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
          {r.abstract || '（アブストラクト未取得）'}
        </p>
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-ctl)', fontSize: 11, color: 'var(--text-muted)' }}>
        情報の範囲: アブストラクトのみに基づく（本文未取得）
      </div>

      {r.url && (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 16,
            padding: '8px 12px',
            borderRadius: 'var(--radius-ctl)',
            border: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--accent)',
          }}
        >
          <BookOpen size={14} /> 論文ページを開く
        </a>
      )}
    </div>
  );
}
