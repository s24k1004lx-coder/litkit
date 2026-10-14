import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, BookOpen } from 'lucide-react';
import { api, type CardMeta } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

export function LibraryPage() {
  const [cards, setCards] = useState<CardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const navigate = useNavigate();

  useEffect(() => {
    api.getCards().then(setCards).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>ライブラリ</h1>
        <Skeleton height={80} count={5} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>ライブラリ ({cards.length})</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <ToggleBtn active={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></ToggleBtn>
          <ToggleBtn active={view === 'table'} onClick={() => setView('table')}><List size={16} /></ToggleBtn>
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={40} />}
          title="文献がありません"
          description="litkit search で文献を検索し、litkit add で取り込んでください"
        />
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {cards.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/paper/${c.id}`)}
              style={{
                background: 'var(--surface)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--border)',
                padding: 16,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-card)',
                transition: 'box-shadow 150ms',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--text)' }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {c.authors.slice(0, 2).join(', ')}{c.authors.length > 2 ? ' 他' : ''} ({c.year || '?'})
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Badge variant={c.depth === 'full_text' ? 'ok' : 'warn'}>
                  {c.depth === 'full_text' ? '精読済' : 'アブストのみ'}
                </Badge>
                {c.relevance && (
                  <Badge variant={c.relevance === 'high' ? 'accent' : c.relevance === 'mid' ? 'warn' : 'default'}>
                    {c.relevance}
                  </Badge>
                )}
                {c.tags.slice(0, 2).map(t => <Badge key={t}>{t}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>タイトル</th>
              <th style={{ ...thStyle, width: 60 }}>年</th>
              <th style={{ ...thStyle, width: 80 }}>深度</th>
              <th style={{ ...thStyle, width: 60 }}>関連</th>
              <th style={{ ...thStyle, width: 80 }}>ソース</th>
            </tr>
          </thead>
          <tbody>
            {cards.map(c => (
              <tr
                key={c.id}
                onClick={() => navigate(`/paper/${c.id}`)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.authors.slice(0, 2).join(', ')}</div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }} className="tabular-nums">{c.year || '?'}</td>
                <td style={tdStyle}>
                  <Badge variant={c.depth === 'full_text' ? 'ok' : 'warn'}>
                    {c.depth === 'full_text' ? '精読済' : 'アブスト'}</Badge>
                </td>
                <td style={tdStyle}>{c.relevance || '—'}</td>
                <td style={{ ...tdStyle, color: 'var(--text-subtle)' }}>{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
  background: 'var(--surface-sunken)',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px' };

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 8px',
        borderRadius: 'var(--radius-ctl)',
        border: '1px solid var(--border)',
        background: active ? 'var(--accent-weak)' : 'var(--surface)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
      }}
    >
      {children}
    </button>
  );
}
