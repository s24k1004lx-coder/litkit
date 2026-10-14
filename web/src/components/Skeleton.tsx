interface Props {
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({ width = '100%', height = 16, count = 1 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            width,
            height,
            borderRadius: 'var(--radius-ctl)',
            background: 'var(--surface-sunken)',
            animation: 'pulse 1.5s ease-in-out infinite',
            marginBottom: count > 1 ? 8 : 0,
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </>
  );
}
