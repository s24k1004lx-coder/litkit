import { useEffect, useState } from 'react';
import { api, type Claim } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';

export function ThesisPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getClaims().then(setClaims).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const supported = claims.filter(c => c.evidence_ids.length > 0).length;
  const total = claims.length;
  const coverage = total > 0 ? Math.round(supported / total * 100) : 0;

  return (
    <>
      <PageHead title="執筆" sub="Thesis" />
      <div className="main">
        {loading ? (
          <div style={{ marginTop: 28 }}><Skeleton height={44} count={5} /></div>
        ) : claims.length === 0 ? (
          <EmptyState title="主張が登録されていません" description="thesis/claims.md を編集して主張を追加してください" />
        ) : (
          <>
            <div className="toolbar">
              <span className="info">
                根拠カバー率 {coverage}%（{supported}/{total} 件）
              </span>
            </div>
            <div className="tbl-wrap"><table className="tbl" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>主張</th>
                  <th>根拠</th>
                  <th style={{ width: 90 }}>章節</th>
                  <th style={{ width: 90 }}>状態</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => {
                  const unsupported = c.evidence_ids.length === 0;
                  return (
                    <tr key={c.id} className={unsupported ? 'risk' : undefined}>
                      <td style={{ fontWeight: 900 }}>{c.id}</td>
                      <td>{c.text}</td>
                      <td>
                        {unsupported ? (
                          <span className="none">根拠なし</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {c.evidence_ids.map(e => <Badge key={e} variant="info">{e}</Badge>)}
                          </div>
                        )}
                      </td>
                      <td className="sub">{c.section}</td>
                      <td><Badge variant={unsupported ? 'risk' : 'ok'}>{c.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </>
        )}
      </div>
    </>
  );
}
