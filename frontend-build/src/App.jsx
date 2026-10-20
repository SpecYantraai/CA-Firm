import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store';
import Sidebar from './components/layout/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EngagementsPage from './pages/EngagementsPage';
import EngagementDetailPage from './pages/EngagementDetailPage';
import SearchPage from './pages/SearchPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import AgentConfigurationPage from './pages/AgentConfigurationPage';
import './index.css';
import './theme.css';

function ProtectedRoute({ children, adminOnly = false }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'Admin') return <Navigate to="/" replace />;
  return children;
}

function AppLayout({ children }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <div className={`app-shell ${navigationOpen ? 'navigation-open' : ''}`}>
      <div className="mobile-topbar">
        <div className="specentra-wordmark"><b>Spec</b>entra</div>
        <button className="btn btn-icon btn-ghost" onClick={() => setNavigationOpen(!navigationOpen)} aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} title={navigationOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navigationOpen} aria-controls="app-navigation">
          {navigationOpen ? <X size={20}/> : <Menu size={20}/>}
        </button>
      </div>
      {navigationOpen && <button className="navigation-backdrop" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}/>}
      <Sidebar onNavigate={() => setNavigationOpen(false)} />
      <div className="main-content">{children}</div>
    </div>
  );
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
        <Route path="/" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/engagements" element={<ProtectedRoute><AppLayout><EngagementsPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/engagements/:id" element={<ProtectedRoute><AppLayout><EngagementDetailPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/search" element={<ProtectedRoute><AppLayout><SearchPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/users" element={<ProtectedRoute><AppLayout><UsersPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>}/>
        <Route path="/settings/ai-agents" element={<ProtectedRoute adminOnly><AppLayout><AgentConfigurationPage /></AppLayout></ProtectedRoute>}/>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
