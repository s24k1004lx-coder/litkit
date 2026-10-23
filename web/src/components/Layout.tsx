import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';
import '../styles/paper.css';

const links = [
  { to: '/', label: 'ダッシュボード', match: (p: string) => p === '/' },
  { to: '/search', label: '検索', match: (p: string) => p.startsWith('/search') },
  { to: '/import', label: '取り込み', match: (p: string) => p.startsWith('/import') },
  { to: '/library', label: 'ライブラリ', match: (p: string) => p.startsWith('/library') || p.startsWith('/paper/') },
  { to: '/ask', label: '質問', match: (p: string) => p.startsWith('/ask') },
  { to: '/thesis', label: '執筆', match: (p: string) => p.startsWith('/thesis') },
  { to: '/reports', label: 'レポート', match: (p: string) => p.startsWith('/reports') },
];

/** paper-researcher 由来のUI。.pr 配下にスタイルを閉じ込めている。 */
export function Layout() {
  const { pathname } = useLocation();
  const { required, logout } = useAuth();
  return (
    <div className="pr">
      <nav className="appbar" aria-label="メイン">
        <div className="appbar-inner">
          <NavLink to="/" className="logo">litkit</NavLink>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={`nav${l.match(pathname) ? ' on' : ''}`}>{l.label}</NavLink>
          ))}
          {required && <button className="nav logout" onClick={logout}>ログアウト</button>}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
