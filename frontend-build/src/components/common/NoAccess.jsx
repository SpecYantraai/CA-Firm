import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

/**
 * Proper "no access" state for role-gated routes reached directly by URL.
 * Rendered inside the app shell so the user keeps full navigation.
 */
export default function NoAccess({
  title = 'You don’t have access to this area',
  message = 'This is a firm administration area. Ask an Admin if you need access.',
  requiredRole = 'Admin',
}) {
  const navigate = useNavigate();
  return (
    <div className="noaccess" role="alert">
      <div className="noaccess-card">
        <div className="noaccess-icon"><ShieldAlert size={26} /></div>
        <h1>{title}</h1>
        <p>{message}</p>
        {requiredRole && (
          <p className="noaccess-role">Required role: <strong>{requiredRole}</strong></p>
        )}
        <div className="noaccess-actions">
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Go back
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/')}>Go to dashboard</button>
        </div>
      </div>
    </div>
  );
}
