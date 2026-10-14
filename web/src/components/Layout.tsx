import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          padding: '24px 32px',
          maxWidth: 1280,
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
