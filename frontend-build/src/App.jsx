import { useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore, useUIStore } from './store';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import CommandPalette from './components/layout/CommandPalette';
import NoAccess from './components/common/NoAccess';
import { ResizeHandle, useResizablePanel, useMediaQuery } from './components/common/Resizable';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EngagementsPage from './pages/EngagementsPage';
import EngagementDetailPage from './pages/EngagementDetailPage';
import SearchPage from './pages/SearchPage';
import UsersPage from './pages/UsersPage';
import AgentConfigurationPage from './pages/AgentConfigurationPage';
import DesignSystemPage from './pages/DesignSystemPage';
// Account workspace (all users)
import AccountLayout from './pages/account/AccountLayout';
import AccountProfile from './pages/account/AccountProfile';
import AccountSignOff from './pages/account/AccountSignOff';
import AccountWork from './pages/account/AccountWork';
import AccountPreferences from './pages/account/AccountPreferences';
import AccountSecurity from './pages/account/AccountSecurity';
import AccountNotifications from './pages/account/AccountNotifications';
import AccountShortcuts from './pages/account/AccountShortcuts';
// Settings hub (Admin only)
import SettingsLayout from './pages/settings/SettingsLayout';
import FirmProfile from './pages/settings/FirmProfile';
import RolesPermissions from './pages/settings/RolesPermissions';
import EngagementTemplates from './pages/settings/EngagementTemplates';
import Retention from './pages/settings/Retention';
import DocumentEditorSettings from './pages/settings/DocumentEditorSettings';
import StorageSettings from './pages/settings/StorageSettings';
import NumberingSettings from './pages/settings/NumberingSettings';
import AiStatus from './pages/settings/AiStatus';
import SessionsPolicy from './pages/settings/SessionsPolicy';
import AuditTrailExport from './pages/settings/AuditTrailExport';
import SignOffRules from './pages/settings/SignOffRules';
import './index.css';
import './theme.css';
import './ui.css';

function Shell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const shellRef = useRef(null);
  const narrow = useMediaQuery('(max-width: 760px)');
  const resize = useResizablePanel({
    storageKey: 'specentra:panel:sidebar',
    defaultWidth: 280, minWidth: 220, maxWidth: 420,
    cssVar: '--sidebar-w', targetRef: shellRef, anchorRef: shellRef,
    getMaxWidth: () => window.innerWidth - 560,
    collapsible: true, collapseBelow: 160,
    collapsed, onCollapsedChange: setSidebarCollapsed,
    disabled: narrow,
  });

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const showHandle = !narrow && (!collapsed || resize.dragging);
  return (
    <div
      className={`app-shell ${navigationOpen ? 'navigation-open' : ''}`}
      ref={shellRef}
      style={{ '--sidebar-w': `${resize.width}px` }}
    >
      {navigationOpen && <button className="navigation-backdrop" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
      <Sidebar onNavigate={() => setNavigationOpen(false)} />
      {showHandle && (
        <ResizeHandle
          className="resize-sidebar"
          ariaLabel="Resize sidebar"
          width={resize.width}
          min={resize.min}
          max={resize.max}
          dragging={resize.dragging}
          onPointerDown={resize.onPointerDown}
          onKeyDown={resize.onKeyDown}
          onReset={resize.reset}
        />
      )}
      <div className="main-content">
        <TopBar onToggleMobileNav={() => setNavigationOpen((o) => !o)} />
        <div className="main-scroll"><Outlet /></div>
      </div>
      <CommandPalette />
    </div>
  );
}

function RequireAdmin({ children }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'Admin') return <NoAccess />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: { fontFamily:"'IBM Plex Sans',system-ui,sans-serif",fontSize:13,borderRadius:8,background:'var(--bg-card)',color:'var(--text-primary)',border:'1px solid var(--border)',boxShadow:'var(--shadow-md)' },
          success: { iconTheme: { primary:'#1a9e5e',secondary:'#fff' } },
          error: { iconTheme: { primary:'#d03545',secondary:'#fff' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/engagements" element={<EngagementsPage />} />
          <Route path="/engagements/:id" element={<EngagementDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/design-system" element={<DesignSystemPage />} />

          {/* Account — personal, every user */}
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<AccountProfile />} />
            <Route path="sign-off" element={<AccountSignOff />} />
            <Route path="work" element={<AccountWork />} />
            <Route path="preferences" element={<AccountPreferences />} />
            <Route path="security" element={<AccountSecurity />} />
            <Route path="notifications" element={<AccountNotifications />} />
            <Route path="shortcuts" element={<AccountShortcuts />} />
          </Route>

          {/* Settings — firm administration, Admin only (non-admins get a No-access state) */}
          <Route path="/settings/ai-agents" element={<RequireAdmin><AgentConfigurationPage /></RequireAdmin>} />
          <Route path="/settings" element={<RequireAdmin><SettingsLayout /></RequireAdmin>}>
            <Route index element={<Navigate to="firm" replace />} />
            <Route path="firm" element={<FirmProfile />} />
            <Route path="roles" element={<RolesPermissions />} />
            <Route path="templates" element={<EngagementTemplates />} />
            <Route path="retention" element={<Retention />} />
            <Route path="documents/editor" element={<DocumentEditorSettings />} />
            <Route path="documents/storage" element={<StorageSettings />} />
            <Route path="documents/numbering" element={<NumberingSettings />} />
            <Route path="ai-status" element={<AiStatus />} />
            <Route path="security/sessions" element={<SessionsPolicy />} />
            <Route path="security/audit" element={<AuditTrailExport />} />
            <Route path="security/signoff" element={<SignOffRules />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
