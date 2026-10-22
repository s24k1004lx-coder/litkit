import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type CardMeta } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';

const RELEVANCE_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' };

export function LibraryPage() {
  const [cards, setCards] = useState<CardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const navigate = useNavigate();

  useEffect(() => {
    api.getCards().then(setCards).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const open = (id: string) => navigate(`/paper/${id}`);
  const depthBadge = (c: CardMeta, short = false) => (
    <Badge variant={c.depth === 'full_text' ? 'ok' : 'warn'}>
      {c.depth === 'full_text' ? '精読済' : short ? 'アブスト' : 'アブストのみ'}
    </Badge>
  );

  return (
    <>
      <PageHead title="ライブラリ" sub="Library" />
      <div className="main">
        {loading ? (
          <div style={{ marginTop: 28 }}><Skeleton height={90} count={5} /></div>
        ) : cards.length === 0 ? (
          <EmptyState title="文献がありません" description="「検索」で文献を探し、litkit add で取り込んでください" />
        ) : (
          <>
            <div className="toolbar">
              <span className="info">{cards.length}件</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`act ${view === 'grid' ? 'on' : ''}`} onClick={() => setView('grid')}>カード</button>
                <button className={`act ${view === 'table' ? 'on' : ''}`} onClick={() => setView('table')}>一覧</button>
              </div>
            </div>

            {view === 'grid' ? (
              <div className="lib-grid">
                {cards.map((c) => (
                  <div key={c.id} className="lib-card" onClick={() => open(c.id)} role="link" tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && open(c.id)}>
                    <div className="lib-title">{c.title}</div>
                    <div className="lib-meta">
                      {c.authors.slice(0, 2).join(', ') || '著者不明'}{c.authors.length > 2 ? ' 他' : ''} / {c.year || '?'}
                    </div>
                    {c.l1 && <div className="lib-l1">{c.l1}</div>}
                    <div className="p-badges" style={{ marginBottom: 0 }}>
                      {depthBadge(c)}
                      {c.relevance && (
                        <Badge variant={c.relevance === 'high' ? 'accent' : c.relevance === 'mid' ? 'warn' : 'default'}>
                          関連度 {RELEVANCE_LABEL[c.relevance] ?? c.relevance}
                        </Badge>
                      )}
                      {c.tags.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>タイトル</th>
                    <th style={{ width: 60 }}>年</th>
                    <th style={{ width: 90 }}>深度</th>
                    <th style={{ width: 60 }}>関連</th>
                    <th style={{ width: 100 }}>ソース</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => open(c.id)}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{c.title}</div>
                        <div className="sub">{c.authors.slice(0, 2).join(', ')}</div>
                      </td>
                      <td className="num">{c.year || '?'}</td>
                      <td>{depthBadge(c, true)}</td>
                      <td>{c.relevance ? RELEVANCE_LABEL[c.relevance] ?? c.relevance : '—'}</td>
                      <td className="sub">{c.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}
