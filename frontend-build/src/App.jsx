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
import './index.css';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
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
          style: { fontFamily:"'Inter',system-ui,sans-serif",fontSize:13,borderRadius:8,boxShadow:'0 4px 16px rgba(15,30,56,0.15)' },
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
