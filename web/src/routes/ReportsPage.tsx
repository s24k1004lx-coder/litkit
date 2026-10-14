import { useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { EmptyState } from '../components/EmptyState';

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>レポート</h1>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px',
            borderRadius: 'var(--radius-ctl)',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 週次レポート生成
        </button>
      </div>

      {report ? (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--border)',
            padding: 24,
            boxShadow: 'var(--shadow-card)',
            whiteSpace: 'pre-wrap',
            fontSize: 13,
            lineHeight: 1.8,
            color: 'var(--text)',
          }}
        >
          {report}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={40} />}
          title="レポートはまだありません"
          description="「週次レポート生成」をクリックして今週の活動をまとめましょう"
        />
      )}
    </div>
  );
}
