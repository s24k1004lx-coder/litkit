import type { ReactNode } from 'react';

interface Props {
  title: string;
  sub?: string;
  children?: ReactNode;
}

/** マーカー風タイトルのページ見出し。 */
export function PageHead({ title, sub, children }: Props) {
  return (
    <div className="main" style={{ paddingBottom: 0 }}>
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}
