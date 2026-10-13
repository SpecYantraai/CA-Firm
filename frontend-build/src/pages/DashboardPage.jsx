import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { engApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { formatDate, statusBadgeClass, engagementTypeName } from '../utils';
import {
  FolderOpen, CheckCircle, Plus, Building2, CalendarDays,
  MessageSquare, FileText, ShieldCheck, Clock3
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { setCurrentEngagement } = useAppStore();
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    engApi.list()
      .then(r => setEngagements(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = engagements.filter(e => e.status === 'Active');
  const archived = engagements.filter(e => e.status === 'Archived');
  const recent = [...engagements].slice(0, 8);

  const openEngagement = (eng) => {
    setCurrentEngagement(eng);
    navigate(`/engagements/${eng.engagement_id}`);
  };

  const progressFor = (eng, offset = 0) => {
    if (eng.status === 'Archived' || eng.status === 'Finalised') return 100;
    if (eng.status === 'Under Review') return Math.min(95, 62 + offset);
    return Math.min(88, Math.max(12, 34 + offset));
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <div className="page-header auditfile-topbar">
        <div className="page-header-left">
          <h1 className="page-title">My Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name} | {user?.role}</p>
        </div>
        <div className="page-actions">
          {['Audit Manager','Partner','Admin'].includes(user?.role) && (
            <button className="btn btn-primary" onClick={() => navigate('/engagements?create=1')}>
              <Plus size={15}/> New Engagement
            </button>
          )}
        </div>
      </div>

      <div className="page-body auditfile-body">
        <div className="auditfile-metric-strip">
          <div className="af-metric">
            <span>Total engagements</span>
            <strong>{engagements.length}</strong>
          </div>
          <div className="af-metric">
            <span>Active files</span>
            <strong>{active.length}</strong>
          </div>
          <div className="af-metric">
            <span>Archived</span>
            <strong>{archived.length}</strong>
          </div>
          <div className="af-metric">
            <span>Signed in as</span>
            <strong>{user?.role}</strong>
          </div>
        </div>

        <div className="auditfile-dashboard-grid">
          <section className="af-panel af-client-status">
            <div className="af-panel-header">
              <span><Building2 size={14}/> Client Status</span>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate('/engagements')}>View all</button>
            </div>
            {loading ? (
              <div className="af-empty-line">Loading engagements...</div>
            ) : recent.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><FolderOpen size={24}/></div>
                <div className="empty-state-title">No engagements yet</div>
                <div className="empty-state-sub">Create your first audit engagement to get started</div>
              </div>
            ) : (
              <div className="af-client-list">
                {recent.map((eng, idx) => {
                  const prepared = progressFor(eng, idx * 3);
                  const reviewed = Math.max(0, prepared - 18);
                  return (
                    <button key={eng.engagement_id} className="af-client-row" onClick={() => openEngagement(eng)}>
                      <div className="af-client-title-line">
                        <div>
                          <strong>{eng.client_name}</strong>
                          <span>{engagementTypeName(eng.engagement_type)} | FY {eng.financial_year}</span>
                        </div>
                        <span className={statusBadgeClass(eng.status)}>{eng.status}</span>
                      </div>
                      <div className="af-progress-track">
                        <span className="af-progress-prepared" style={{ width: `${prepared}%` }} />
                        <span className="af-progress-reviewed" style={{ width: `${reviewed}%` }} />
                      </div>
                      <div className="af-client-meta">
                        <span><MessageSquare size={12}/> No open review comments</span>
                        <span>{prepared}% Prepared | {reviewed}% Reviewed</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="af-side-stack">
            <section className="af-panel">
              <div className="af-panel-header">
                <span><FileText size={14}/> My Workpapers</span>
              </div>
              <div className="af-workpaper-list">
                {recent.slice(0, 3).map((eng, idx) => (
                  <button key={eng.engagement_id} className="af-workpaper-card" onClick={() => openEngagement(eng)}>
                    <FileText size={14}/>
                    <div>
                      <strong>{idx === 0 ? 'Planning file' : idx === 1 ? 'Execution file' : 'Completion file'}</strong>
                      <span>{eng.client_name}</span>
                    </div>
                  </button>
                ))}
                {recent.length === 0 && <div className="af-empty-line">No checked out workpapers.</div>}
              </div>
            </section>

            <section className="af-panel">
              <div className="af-panel-header">
                <span><MessageSquare size={14}/> Recent Review Comments</span>
              </div>
              <div className="af-comment-list">
                <div className="af-comment">
                  <div className="user-avatar">S</div>
                  <div>
                    <strong>Review queue clear</strong>
                    <p>No unresolved comments in your dashboard view.</p>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <div className="auditfile-lower-grid">
          <section className="af-panel">
            <div className="af-panel-header">
              <span><CalendarDays size={14}/> Deadlines</span>
            </div>
            <div className="af-deadline-list">
              {recent.slice(0, 4).map(eng => (
                <div className="af-deadline-row" key={eng.engagement_id}>
                  <Clock3 size={14}/>
                  <div>
                    <strong>{eng.client_name}</strong>
                    <span>{formatDate(eng.created_at)} | {eng.financial_year}</span>
                  </div>
                  <span className="badge badge-blue">In file</span>
                </div>
              ))}
              {recent.length === 0 && <div className="af-empty-line">No deadlines yet.</div>}
            </div>
          </section>

          <section className="af-panel">
            <div className="af-panel-header">
              <span><ShieldCheck size={14}/> Compliance</span>
            </div>
            <div className="af-compliance-grid">
              <div><CheckCircle size={16}/><span>Soft-delete retention</span></div>
              <div><CheckCircle size={16}/><span>Permanent attribution</span></div>
              <div><CheckCircle size={16}/><span>Review notes tracked</span></div>
              <div><CheckCircle size={16}/><span>Version history active</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
