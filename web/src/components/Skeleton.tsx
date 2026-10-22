interface Props {
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({ width = '100%', height = 16, count = 1 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel" style={{ width, height }} />
      ))}
    </>
  );
}
