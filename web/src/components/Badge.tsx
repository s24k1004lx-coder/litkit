interface Props {
  children: React.ReactNode;
  variant?: 'default' | 'ok' | 'warn' | 'risk' | 'info' | 'accent';
}

const styles: Record<string, { bg: string; color: string }> = {
  default: { bg: 'var(--surface-sunken)', color: 'var(--text-muted)' },
  ok: { bg: 'var(--ok-weak)', color: 'var(--ok)' },
  warn: { bg: 'var(--warn-weak)', color: 'var(--warn)' },
  risk: { bg: 'var(--risk-weak)', color: 'var(--risk)' },
  info: { bg: 'var(--info-weak)', color: 'var(--info)' },
  accent: { bg: 'var(--accent-weak)', color: 'var(--accent)' },
};

export function Badge({ children, variant = 'default' }: Props) {
  const s = styles[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
