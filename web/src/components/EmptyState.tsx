import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        color: 'var(--text-muted)',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div style={{ color: 'var(--text-subtle)', marginBottom: 4 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
      <p style={{ fontSize: 13, maxWidth: 320 }}>{description}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
