import { useState } from 'react';
import { api } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';

export function ReportsPage() {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const data = await api.weekly();
      setReport(data.text);
    } catch {
      setReport('レポート生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHead title="レポート" sub="Reports" />
      <div className="main">
        <div className="toolbar">
          <span className="info">今週の活動をまとめます</span>
          <button className="btn-export" onClick={generate} disabled={loading}>
            {loading ? '生成中…' : '週次レポート生成'}
          </button>
        </div>

        {loading && !report ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : report ? (
          <div className="report">{report}</div>
        ) : (
          <EmptyState title="レポートはまだありません" description="「週次レポート生成」をクリックして今週の活動をまとめましょう" />
        )}
      </div>
    </>
  );
}
