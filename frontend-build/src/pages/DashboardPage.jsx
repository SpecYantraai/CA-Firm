import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { engApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { formatDate, statusBadgeClass, engagementTypeName } from '../utils';
import { FolderOpen, CheckCircle, Plus, ArrowRight, Building2, CalendarDays, Briefcase } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { setCurrentEngagement } = useAppStore();
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    engApi.list().then(r => {
      setEngagements(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const active = engagements.filter(e => e.status === 'Active');
  const archived = engagements.filter(e => e.status === 'Archived');
  const recent = [...engagements].slice(0, 8);

  const openEngagement = (eng) => {
    setCurrentEngagement(eng);
    navigate(`/engagements/${eng.engagement_id}`);
  };

  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name} · {user?.role}</p>
        </div>
        <div className="page-actions">
          {['Audit Manager','Partner','Admin'].includes(user?.role) && (
            <button className="btn btn-primary" onClick={() => navigate('/engagements?create=1')}>
              <Plus size={15}/> New Engagement
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Engagements</div>
            <div className="stat-value" style={{ color:'var(--brand-navy)' }}>{engagements.length}</div>
            <div className="stat-sub">All financial years</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value" style={{ color:'var(--green)' }}>{active.length}</div>
            <div className="stat-sub">In progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Archived</div>
            <div className="stat-value" style={{ color:'var(--text-muted)' }}>{archived.length}</div>
            <div className="stat-sub">7-year retention</div>
          </div>
          <div className="stat-card" style={{ borderLeft:'3px solid var(--brand-gold)' }}>
            <div className="stat-label">Your Role</div>
            <div style={{ fontSize:18,fontWeight:700,color:'var(--brand-navy)',marginBottom:4 }}>
              {user?.role}
            </div>
            <div className="stat-sub">ICAI Stage 1 compliant</div>
          </div>
        </div>

        {/* Recent Engagements */}
        <div className="card animate-in">
          <div className="card-header">
            <span className="card-title">Recent Engagements</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/engagements')}>
              View all <ArrowRight size={13}/>
            </button>
          </div>
          {loading ? (
            <div style={{ padding:32,textAlign:'center',color:'var(--text-muted)' }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><FolderOpen size={24}/></div>
              <div className="empty-state-title">No engagements yet</div>
              <div className="empty-state-sub">Create your first audit engagement to get started</div>
              {['Audit Manager','Partner','Admin'].includes(user?.role) && (
                <button className="btn btn-primary" onClick={() => navigate('/engagements?create=1')}>
                  <Plus size={14}/> Create Engagement
                </button>
              )}
            </div>
          ) : (
            <div className="client-card-list client-card-list-compact">
              {recent.map(eng => (
                <button key={eng.engagement_id} className="client-card-row" onClick={() => openEngagement(eng)}>
                  <div className="client-card-mark"><Building2 size={18}/></div>
                  <div className="client-card-main">
                    <div className="client-card-top">
                      <div className="client-card-name">{eng.client_name}</div>
                      <span className={statusBadgeClass(eng.status)}>{eng.status}</span>
                    </div>
                    <div className="client-card-meta">
                      <span><CalendarDays size={13}/>{eng.financial_year}</span>
                      <span><Briefcase size={13}/>{engagementTypeName(eng.engagement_type)}</span>
                      <span>Created {formatDate(eng.created_at)}</span>
                    </div>
                  </div>
                  <ArrowRight size={16} className="client-card-arrow"/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Compliance notice */}
        <div style={{ background:'var(--brand-gold-pale)',border:'1px solid rgba(201,147,42,.25)',borderRadius:'var(--r-md)',padding:'12px 16px',display:'flex',gap:12,alignItems:'flex-start' }}>
          <CheckCircle size={16} style={{ color:'var(--brand-gold)',flexShrink:0,marginTop:1 }}/>
          <div style={{ fontSize:12,color:'var(--text-secondary)',lineHeight:1.6 }}>
            <strong style={{ color:'var(--text-primary)' }}>ICAI Compliance Active</strong> — Soft-delete only · 7-year retention · On-premise storage · Permanent attribution · Bcrypt authentication · All events logged to event bus for Stage 2 agent readiness.
          </div>
        </div>
      </div>
    </div>
  );
}
