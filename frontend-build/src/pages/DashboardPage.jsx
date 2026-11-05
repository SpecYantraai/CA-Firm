import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { engApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { statusBadgeClass, engagementTypeName } from '../utils';
import {
  FolderOpen, CheckCircle2, Plus, Building2, ArrowRight,
  ShieldCheck, Sparkles, Inbox,
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { setCurrentEngagement } = useAppStore();
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    engApi.list()
      .then(r => setEngagements(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const canCreate = ['Audit Manager', 'Partner', 'Admin'].includes(user?.role);
  const count = (status) => engagements.filter(e => e.status === status).length;
  const total = engagements.length;

  const phases = [
    { key: 'Active', label: 'Active', color: 'var(--green)' },
    { key: 'Under Review', label: 'Under review', color: 'var(--amber)' },
    { key: 'Finalised', label: 'Finalised', color: 'var(--blue)' },
    { key: 'Archived', label: 'Archived', color: 'var(--text-muted)' },
  ];

  const recent = useMemo(
    () => [...engagements].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6),
    [engagements]
  );

  const openEngagement = (eng) => {
    setCurrentEngagement(eng);
    navigate(`/engagements/${eng.engagement_id}`);
  };

  const firstName = (user?.full_name || '').split(' ')[0] || 'there';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <p className="page-subtitle">{user?.role} · Here is where your attention is needed today.</p>
        </div>
        <div className="page-actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={() => navigate('/engagements?create=1')}>
              <Plus size={15} /> New engagement
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid">
          <StatCard label="Total engagements" value={total} loading={loading} />
          <StatCard label="Active" value={count('Active')} loading={loading} tone="green" />
          <StatCard label="Under review" value={count('Under Review')} loading={loading} tone="amber" />
          <StatCard label="Archived" value={count('Archived')} loading={loading} tone="muted" />
        </div>

        <div className="dash-grid">
          <div className="dash-stack">
            <section className="card">
              <div className="card-header">
                <div className="card-title">Engagements by phase</div>
                <button className="btn btn-ghost btn-xs" onClick={() => navigate('/engagements')}>View all <ArrowRight size={12} /></button>
              </div>
              {loading ? (
                <div style={{ padding: 16 }}>
                  {[0, 1, 2, 3].map(i => <div className="skeleton skeleton-line" key={i} style={{ margin: '12px 0' }} />)}
                </div>
              ) : total === 0 ? (
                <div className="dash-note">No engagements yet — phases will populate as audit files are created.</div>
              ) : (
                <div className="phase-list">
                  {phases.map(p => {
                    const n = count(p.key);
                    const pct = total ? Math.round((n / total) * 100) : 0;
                    return (
                      <div className="phase-row" key={p.key}>
                        <span className="phase-name"><span className="phase-dot" style={{ background: p.color }} />{p.label}</span>
                        <div className="progress"><span style={{ width: `${pct}%`, background: p.color }} /></div>
                        <span className="phase-count">{n}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div className="card-title">Recent engagements</div>
              </div>
              {loading ? (
                <div style={{ padding: 16 }}>
                  {[0, 1, 2].map(i => (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }} key={i}>
                      <div className="skeleton skeleton-circle" style={{ width: 28, height: 28 }} />
                      <div style={{ flex: 1 }}><div className="skeleton skeleton-text" style={{ width: '50%' }} /></div>
                    </div>
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <div className="empty-state-icon"><FolderOpen size={22} /></div>
                  <div className="empty-state-title">No engagements yet</div>
                  <div className="empty-state-sub">Create your first audit engagement to get started.</div>
                </div>
              ) : (
                <div className="dash-list">
                  {recent.map(eng => (
                    <button className="dash-row" key={eng.engagement_id} onClick={() => openEngagement(eng)}>
                      <span className="mini-mark"><Building2 size={15} /></span>
                      <div className="dash-row-main">
                        <b>{eng.client_name}</b>
                        <span>{engagementTypeName(eng.engagement_type)} · FY {eng.financial_year}</span>
                      </div>
                      <span className={statusBadgeClass(eng.status)}>{eng.status}</span>
                      <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="dash-stack">
            <section className="card">
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Inbox size={15} /> Awaiting your review</div>
              </div>
              <div className="caught-up">
                <div className="caught-up-icon"><CheckCircle2 size={22} /></div>
                <div className="empty-state-title" style={{ fontSize: 14 }}>You&rsquo;re all caught up</div>
                <div className="empty-state-sub" style={{ fontSize: 12.5 }}>Gate reviews (G0&ndash;G3) awaiting your approval will appear here once the agent pipeline is active.</div>
              </div>
            </section>

            <section className="ai-surface">
              <div className="ai-label"><Sparkles size={12} /> AI insights</div>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '8px 0 6px', lineHeight: 1.5 }}>
                Agent-generated highlights will surface here — risk flags, missing evidence and planning suggestions.
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Agents prepare and recommend. You evaluate, challenge and approve.
              </p>
            </section>

            <section className="card">
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={15} /> Firm quality</div>
              </div>
              <div className="af-compliance-grid">
                <div><CheckCircle2 size={16} /><span>Soft-delete retention</span></div>
                <div><CheckCircle2 size={16} /><span>Permanent attribution</span></div>
                <div><CheckCircle2 size={16} /><span>Review notes tracked</span></div>
                <div><CheckCircle2 size={16} /><span>Version history active</span></div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, loading, tone }) {
  const toneColor = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'muted' ? 'var(--text-muted)' : 'var(--brand)';
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${toneColor}` }}>
      <div className="stat-label">{label}</div>
      {loading ? <div className="skeleton skeleton-line" style={{ width: 40, height: 26, marginTop: 4 }} /> : <div className="stat-value">{value}</div>}
    </div>
  );
}
