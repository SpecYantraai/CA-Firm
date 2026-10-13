import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../../store';
import { initials } from '../../utils';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, FolderOpen, Search, Users, LogOut, Settings
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Engagements', icon: FolderOpen, to: '/engagements' },
  { label: 'Search', icon: Search, to: '/search' },
];

const ADMIN_ITEMS = [
  { label: 'Users', icon: Users, to: '/users' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const currentEngagement = useAppStore((s) => s.currentEngagement);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Signed out');
    navigate('/login');
  };

  const canManageUsers = ['Admin'].includes(user?.role);

  return (
    <aside className="sidebar">
      {/* Logo — replace img src with your company logo path */}
      <div className="sidebar-logo">
        <div className="logo-fallback">
          <div className="logo-mark">S</div>
          <div>
            {/* 
              ────────────────────────────────────────────────
              COMPANY LOGO PATH:
              Place your logo file at:
                frontend/public/logo.png  (or .svg / .webp)
              Then replace the logo-mark div above with:
                <img src="/logo.png" alt="Company Logo" style={{height:36}} />
              And replace the logo-name below with your firm name.
              ────────────────────────────────────────────────
            */}
            <div className="logo-name">Specentra</div>
            <div className="logo-sub">AMS · Stage 1</div>
          </div>
        </div>
      </div>

      {/* Active engagement indicator */}
      {currentEngagement && (
        <div className="sidebar-engagement">
          <div className="eng-label">Active Engagement</div>
          <div className="eng-name">{currentEngagement.client_name}</div>
          <div className="eng-fy">FY {currentEngagement.financial_year}</div>
        </div>
      )}

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {NAV_ITEMS.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="nav-icon" size={17} />
            {label}
          </NavLink>
        ))}

        {canManageUsers && (
          <>
            <div className="nav-section-label" style={{ marginTop: 8 }}>Administration</div>
            {ADMIN_ITEMS.map(({ label, icon: Icon, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" size={17} />
                {label}
              </NavLink>
            ))}
          </>
        )}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Compliance</div>
        <div style={{ padding:'8px 10px',fontSize:10,color:'rgba(255,255,255,.25)',lineHeight:1.5 }}>
          On-premise storage · Soft-delete only · 7-year retention · ICAI compliant
        </div>
      </nav>

      {/* User footer */}
      <div className="sidebar-bottom">
        <div className="sidebar-user" onClick={handleLogout} title="Sign out">
          <div className="user-avatar">{user?.initials || initials(user?.full_name)}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
          <LogOut size={14} style={{ color:'rgba(255,255,255,.3)', flexShrink:0 }} />
        </div>
      </div>
    </aside>
  );
}
