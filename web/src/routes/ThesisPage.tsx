import { useEffect, useState } from 'react';
import { PenTool, AlertCircle } from 'lucide-react';
import { api, type Claim } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

export function ThesisPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getClaims().then(setClaims).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>執筆</h1>
        <Skeleton height={40} count={5} />
      </div>
    );
  }

  const supported = claims.filter(c => c.evidence_ids.length > 0).length;
  const total = claims.length;
  const coverage = total > 0 ? Math.round(supported / total * 100) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>執筆</h1>
      {total > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          根拠カバー率: <span className="tabular-nums" style={{ fontWeight: 600, color: coverage === 100 ? 'var(--ok)' : 'var(--warn)' }}>{coverage}%</span>
          {' '}({supported}/{total} 件)
        </div>
      )}

      {claims.length === 0 ? (
        <EmptyState
          icon={<PenTool size={40} />}
          title="主張が登録されていません"
          description="thesis/claims.md を編集して主張を追加してください"
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>主張</th>
              <th style={thStyle}>根拠</th>
              <th style={thStyle}>章節</th>
              <th style={thStyle}>状態</th>
            </tr>
          </thead>
          <tbody>
            {claims.map(c => {
              const unsupported = c.evidence_ids.length === 0;
              return (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: unsupported ? 'var(--risk-weak)' : 'transparent',
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-muted)' }}>{c.id}</td>
                  <td style={tdStyle}>{c.text}</td>
                  <td style={tdStyle}>
                    {c.evidence_ids.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.evidence_ids.map(e => <Badge key={e} variant="info">{e}</Badge>)}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--risk)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <AlertCircle size={12} /> なし
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.section}</td>
                  <td style={tdStyle}>
                    <Badge variant={unsupported ? 'risk' : 'ok'}>{c.status}</Badge>
                  </td>
                </tr>
              );
            })}
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
