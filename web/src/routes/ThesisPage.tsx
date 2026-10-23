import { useEffect, useState } from 'react';
import { api, type Claim } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';

const CHECK_LABEL: Record<string, string> = {
  unsupported_claims: '根拠なし主張',
  invalid_refs: '無効な引用',
  terminology: '表記ゆれ',
  figure_numbering: '図表番号',
};

type Tool = 'check' | 'claims' | 'cite';

interface ClaimIssue {
  claim: Claim;
  issue: string;
}

export function ThesisPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Tool | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, string[]> | null>(null);
  const [claimIssues, setClaimIssues] = useState<ClaimIssue[] | null>(null);
  const [citeText, setCiteText] = useState<string | null>(null);
  const [usedOnly, setUsedOnly] = useState(false);

  const run = async (tool: Tool, fn: () => Promise<void>) => {
    setBusy(tool);
    setToolError(null);
    try {
      await fn();
    } catch (e) {
      setToolError(e instanceof Error ? e.message : '失敗しました');
    }
    setBusy(null);
  };
  const runCheck = () => run('check', async () => setCheckResult(await api.check()));
  const runClaimsCheck = () => run('claims', async () => setClaimIssues((await api.checkClaims()) as ClaimIssue[]));
  const runCite = () => run('cite', async () => setCiteText((await api.cite(usedOnly)).text));

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
        <div className="toolbar">
          <span className="info">卒論原稿のチェックと参考文献リスト</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-export" onClick={runCheck} disabled={busy !== null}>{busy === 'check' ? 'チェック中…' : '整合チェック'}</button>
            <button className="btn-export" onClick={runClaimsCheck} disabled={busy !== null}>{busy === 'claims' ? 'チェック中…' : '主張の根拠チェック'}</button>
            <label className="ja-toggle">
              <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} /> 引用した文献のみ
            </label>
            <button className="btn-export" onClick={runCite} disabled={busy !== null}>{busy === 'cite' ? '生成中…' : '参考文献リスト'}</button>
          </div>
        </div>
        {toolError && <div className="err">{toolError}</div>}

        {checkResult && (
          <div className="d-section">
            <div className="d-section-title">整合チェック</div>
            {Object.values(checkResult).every((v) => v.length === 0) ? (
              <div className="import-line">問題は検出されませんでした</div>
            ) : (
              Object.entries(checkResult).filter(([, v]) => v.length > 0).map(([k, v]) => (
                <div key={k} className="callout warn">
                  <h3>{CHECK_LABEL[k] ?? k}（{v.length}件）</h3>
                  <ul>{v.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              ))
            )}
          </div>
        )}

        {claimIssues && (
          <div className="d-section">
            <div className="d-section-title">主張の根拠チェック</div>
            {claimIssues.length === 0 ? (
              <div className="import-line">すべての主張に根拠があります</div>
            ) : (
              <div className="callout warn">
                <h3>問題のある主張（{claimIssues.length}件）</h3>
                <ul>{claimIssues.map((c) => <li key={c.claim.id}><b>{c.claim.id}</b> {c.claim.text} — {c.issue}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {citeText !== null && (
          <div className="d-section">
            <div className="toolbar" style={{ margin: 0 }}>
              <div className="d-section-title" style={{ margin: 0 }}>参考文献リスト</div>
              <button className="act" onClick={() => navigator.clipboard.writeText(citeText).catch(() => {})}>コピー</button>
            </div>
            <div className="report">{citeText || '（該当する文献がありません）'}</div>
          </div>
        )}

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
