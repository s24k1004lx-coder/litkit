import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Library, PenTool, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'ダッシュボード' },
  { to: '/search', icon: Search, label: '検索' },
  { to: '/library', icon: Library, label: 'ライブラリ' },
  { to: '/thesis', icon: PenTool, label: '執筆' },
  { to: '/reports', icon: FileText, label: 'レポート' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        minHeight: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease-out',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: collapsed ? '20px 12px' : '20px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            litkit
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 4,
            borderRadius: 'var(--radius-ctl)',
            display: 'flex',
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px 12px' : '10px 12px',
              borderRadius: 'var(--radius-ctl)',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              background: isActive ? 'var(--accent-weak)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              textDecoration: 'none',
              transition: 'all 150ms ease-out',
              whiteSpace: 'nowrap',
              justifyContent: collapsed ? 'center' : 'flex-start',
            })}
          >
            <Icon size={18} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
