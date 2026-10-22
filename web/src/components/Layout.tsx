import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  // 検索画面は paper-researcher 由来の全幅レイアウト（ヒーローが端まで広がる）
  const bare = useLocation().pathname === '/search';
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          padding: bare ? 0 : '24px 32px',
          maxWidth: bare ? undefined : 1280,
          margin: '0 auto',
          width: '100%',
          minWidth: 0,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
