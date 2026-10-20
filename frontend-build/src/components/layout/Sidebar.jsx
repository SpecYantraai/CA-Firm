import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../../store';
import { initials } from '../../utils';
import toast from 'react-hot-toast';
import ThemeToggle from '../ThemeToggle';
import {
  LayoutDashboard, FolderOpen, Search, Users, LogOut, Settings, Bot
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Engagements', icon: FolderOpen, to: '/engagements' },
  { label: 'Search', icon: Search, to: '/search' },
];

const ADMIN_ITEMS = [
  { label: 'Users', icon: Users, to: '/users' },
  { label: 'Settings', icon: Settings, to: '/settings' },
  { label: 'AI Agent Configuration', icon: Bot, to: '/settings/ai-agents' },
];

export default function Sidebar({ onNavigate }) {
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
    <aside className="sidebar" id="app-navigation" aria-label="Main navigation">
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
            <div className="logo-name specentra-wordmark"><b>Spec</b>entra</div>
            <div className="logo-sub">Audit Management System</div>
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
            onClick={onNavigate}
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
                onClick={onNavigate}
                to={to}
                end
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" size={17} />
                {label}
              </NavLink>
            ))}
          </>
        )}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Compliance</div>
        <div className="sidebar-compliance">
          Audit documentation &amp; review
        </div>
      </nav>

      {/* User footer */}
      <div className="sidebar-bottom">
        <ThemeToggle />
        <button type="button" className="sidebar-user" onClick={handleLogout} title="Sign out" aria-label={`Sign out ${user?.full_name || ''}`}>
          <div className="user-avatar">{user?.initials || initials(user?.full_name)}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
          <LogOut size={16} className="sidebar-logout" />
        </button>
      </div>
    </aside>
  );
}
