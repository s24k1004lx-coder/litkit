import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty">
      <b>{title}</b>
      {description}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
