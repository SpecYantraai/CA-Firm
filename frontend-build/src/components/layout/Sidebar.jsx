import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useAppStore, useUIStore } from '../../store';
import UserMenu from './UserMenu';
import { ScrollArea } from '../common/Resizable';
import {
  LayoutDashboard, FolderOpen, Search, Users, Settings, Bot,
  PanelLeftClose, PanelLeftOpen, ChevronsUpDown, Layers, Check, Building2,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Engagements', icon: FolderOpen, to: '/engagements' },
  { label: 'Search', icon: Search, to: '/search' },
];

const ADMIN_ITEMS = [
  { label: 'Users', icon: Users, to: '/users' },
  { label: 'Settings', icon: Settings, to: '/settings' },
  { label: 'AI Agents', icon: Bot, to: '/settings/ai-agents' },
];

export default function Sidebar({ onNavigate }) {
  const user = useAuthStore((s) => s.user);
  const currentEngagement = useAppStore((s) => s.currentEngagement);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const [firmMenu, setFirmMenu] = useState(false);
  const headRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (headRef.current && !headRef.current.contains(e.target)) setFirmMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const canManageUsers = user?.role === 'Admin';
  const navClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'tip tip-right' : ''}`;

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} id="app-navigation" aria-label="Main navigation">
      {/* Firm / workspace switcher */}
      <div className="sidebar-head" ref={headRef} style={{ position: 'relative' }}>
        <button
          className={`firm-switch ${collapsed ? 'tip tip-right' : ''}`}
          data-tip={collapsed ? 'Specentra' : undefined}
          onClick={() => setFirmMenu((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={firmMenu}
        >
          <div className="firm-mark">S</div>
          <div className="firm-meta">
            <span className="firm-name"><b>Spec</b>entra</span>
            <span className="firm-sub">Audit Management</span>
          </div>
          <ChevronsUpDown size={14} className="firm-chevron" />
        </button>
        {firmMenu && (
          <div className="menu" style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 10, right: 10 }}>
            <div className="menu-label">Workspace</div>
            <button className="menu-item"><Building2 size={15} /> Specentra <Check size={15} style={{ marginLeft: 'auto', color: 'var(--brand)' }} /></button>
            {canManageUsers && (
              <>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { navigate('/settings'); setFirmMenu(false); onNavigate?.(); }}><Settings size={15} /> Firm settings</button>
              </>
            )}
            <div className="menu-label" style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-muted)' }}>On-premise single-firm install</div>
          </div>
        )}
      </div>

      {/* Active engagement context */}
      {currentEngagement && (
        <button
          className={`sidebar-engagement ${collapsed ? 'tip tip-right' : ''}`}
          data-tip={collapsed ? currentEngagement.client_name : undefined}
          onClick={() => { navigate(`/engagements/${currentEngagement.engagement_id}`); onNavigate?.(); }}
        >
          <div className="eng-label"><Layers size={11} /> Active engagement</div>
          <div className="eng-name">{currentEngagement.client_name}</div>
          <div className="eng-fy">FY {currentEngagement.financial_year}</div>
        </button>
      )}

      {/* Navigation */}
      <ScrollArea as="nav" className="sidebar-nav">
        {!collapsed && <div className="nav-section-label">Workspace</div>}
        {NAV_ITEMS.map(({ label, icon: Icon, to }) => (
          <NavLink key={to} onClick={onNavigate} to={to} end={to === '/'} className={navClass} data-tip={collapsed ? label : undefined}>
            <Icon className="nav-icon" size={18} />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}

        {canManageUsers && (
          <>
            {!collapsed && <div className="nav-section-label">Administration</div>}
            {ADMIN_ITEMS.map(({ label, icon: Icon, to }) => (
              <NavLink key={to} onClick={onNavigate} to={to} end={to !== '/settings'} className={navClass} data-tip={collapsed ? label : undefined}>
                <Icon className="nav-icon" size={18} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </ScrollArea>

      {/* Footer: user menu, collapse */}
      <div className="sidebar-foot">
        <UserMenu collapsed={collapsed} onNavigate={onNavigate} />
        <button className="collapse-btn" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          <span>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
