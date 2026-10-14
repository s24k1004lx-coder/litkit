import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
}

export function StatCard({ label, value, sub, icon }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{sub}</div>}
    </div>
  );
}
