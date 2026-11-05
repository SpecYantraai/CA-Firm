import { Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, useUIStore } from '../../store';
import { Menu, PanelLeft, Search, Bell, Inbox, ChevronRight } from 'lucide-react';

const TITLES = {
  '/': 'Dashboard',
  '/engagements': 'Engagements',
  '/search': 'Search',
  '/users': 'Users',
  '/settings': 'Settings',
  '/settings/ai-agents': 'AI Agents',
  '/design-system': 'Design System',
};

const ACCOUNT_LABELS = {
  profile: 'Profile',
  'sign-off': 'Sign-off identity',
  work: 'My work',
  preferences: 'Appearance & preferences',
  security: 'Security',
  notifications: 'Notifications',
  shortcuts: 'Keyboard shortcuts',
};

const SETTINGS_LABELS = {
  firm: 'Firm profile',
  roles: 'Roles & permissions',
  templates: 'Engagement templates',
  retention: 'Retention & data handling',
  'documents/editor': 'Document Editor',
  'documents/storage': 'Storage',
  'documents/numbering': 'File naming & numbering',
  'ai-status': 'Model & provider status',
  'security/sessions': 'Sessions policy',
  'security/audit': 'Audit trail export',
  'security/signoff': 'Sign-off rules',
};

export default function TopBar({ onToggleMobileNav }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentEngagement = useAppStore((s) => s.currentEngagement);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);

  const path = location.pathname;
  const crumbs = [];
  if (path.startsWith('/engagements/')) {
    crumbs.push({ label: 'Engagements', to: '/engagements' });
    if (currentEngagement) {
      crumbs.push({ label: currentEngagement.client_name, to: `/engagements/${currentEngagement.engagement_id}` });
      crumbs.push({ label: `FY ${currentEngagement.financial_year}` });
    } else {
      crumbs.push({ label: 'Engagement' });
    }
  } else if (path.startsWith('/account')) {
    crumbs.push({ label: 'Account', to: '/account' });
    const sub = path.replace('/account/', '').replace('/account', '');
    if (sub && ACCOUNT_LABELS[sub]) crumbs.push({ label: ACCOUNT_LABELS[sub] });
  } else if (path === '/settings/ai-agents') {
    crumbs.push({ label: 'Settings', to: '/settings' }, { label: 'AI Agents' });
  } else if (path.startsWith('/settings')) {
    crumbs.push({ label: 'Settings', to: '/settings' });
    const sub = path.replace('/settings/', '').replace('/settings', '');
    if (sub && SETTINGS_LABELS[sub]) crumbs.push({ label: SETTINGS_LABELS[sub] });
  } else {
    crumbs.push({ label: TITLES[path] || 'Specentra' });
  }

  // Placeholder — wired to real review-queue data later (Phase 5 agent gates).
  const pendingReviews = 0;
  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || '');

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button className="topbar-toggle mobile-only" onClick={onToggleMobileNav} aria-label="Open navigation"><Menu size={18} /></button>
        <button className="topbar-toggle desktop-only" onClick={toggleSidebar} aria-label="Toggle sidebar"><PanelLeft size={18} /></button>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight size={13} className="crumb-sep" />}
              {c.to && i < crumbs.length - 1
                ? <button onClick={() => navigate(c.to)}>{c.label}</button>
                : <span className="crumb-current">{c.label}</span>}
            </Fragment>
          ))}
        </nav>
      </div>
      <div className="topbar-right">
        <button className="cmdk-trigger" onClick={() => setCommandOpen(true)} aria-label="Open command palette">
          <Search size={15} />
          <span className="cmdk-trigger-label">Search…</span>
          <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span><span className="kbd">K</span>
        </button>
        <button
          className={`topbar-pending ${pendingReviews === 0 ? 'is-zero' : ''} tip`}
          data-tip="Awaiting your review"
          onClick={() => navigate('/engagements')}
        >
          <Inbox size={15} /><span className="lbl">Reviews</span><span className="cnt">{pendingReviews}</span>
        </button>
        <button className="topbar-icon tip" data-tip="Notifications" aria-label="Notifications">
          <Bell size={17} /><span className="dot" />
        </button>
      </div>
    </header>
  );
}
