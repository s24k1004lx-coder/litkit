interface Props {
  children: React.ReactNode;
  variant?: 'default' | 'ok' | 'warn' | 'risk' | 'info' | 'accent';
}

export function Badge({ children, variant = 'default' }: Props) {
  return <span className={`bdg v-${variant}`}>{children}</span>;
}
