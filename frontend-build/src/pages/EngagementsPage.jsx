/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { engApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { formatDate, statusBadgeClass, engagementTypeName, getErrorMessage, ENGAGEMENT_TYPES } from '../utils';
import {
  Plus, FolderOpen, Search, X, Building2, CalendarDays, Briefcase,
  ShieldCheck, Archive, RotateCcw, ArrowRight, Clock3
} from 'lucide-react';
import toast from 'react-hot-toast';

function CreateEngagementModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    client_name: '',
    financial_year: '2025-26',
    engagement_type: 'statutory-audit-corporate',
    is_eqcr_designated: false,
    is_small_entity: false,
  });
  const [loading, setLoading] = useState(false);

  const years = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22'];

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await engApi.create(form);
      toast.success('Engagement created with workflow sections');
      onCreated(res.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <span className="modal-title">New Audit Engagement</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group">
              <label className="form-label">Client Name <span style={{color:'var(--red)'}}>*</span></label>
              <input className="input" placeholder="e.g. ABC Industries Pvt Ltd"
                value={form.client_name} onChange={e => setForm({...form, client_name:e.target.value})} required/>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Financial Year</label>
                <select className="select" value={form.financial_year} onChange={e => setForm({...form, financial_year:e.target.value})}>
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Engagement Type</label>
                <select className="select" value={form.engagement_type} onChange={e => setForm({...form, engagement_type:e.target.value})}>
                  {ENGAGEMENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label className="check-control">
                <input type="checkbox" checked={form.is_eqcr_designated}
                  onChange={e => setForm({...form, is_eqcr_designated:e.target.checked})}/>
                <span>
                  <strong>EQCR review</strong>
                  <small>Mark this engagement for EQCR oversight.</small>
                </span>
              </label>
              <label className="check-control">
                <input type="checkbox" checked={form.is_small_entity}
                  onChange={e => setForm({...form, is_small_entity:e.target.checked})}/>
                <span>
                  <strong>Small / non-operational entity</strong>
                  <small>Create a lighter default file structure.</small>
                </span>
              </label>
            </div>
            <div className="info-strip">
              Sections are created automatically: 1000 Preconditions, 2000 Planning, 3000 Communications, 4000 Execution, 5000 Reporting, and Misc.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Engagement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EngagementsPage() {
  const user = useAuthStore(s => s.user);
  const { setCurrentEngagement } = useAppStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const canCreate = ['Audit Manager','Partner','Admin'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const res = await engApi.list({ client_name: search || undefined, status: statusFilter || undefined });
      setEngagements(res.data);
    } catch {
      toast.error('Failed to load engagements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  useEffect(() => {
    if (searchParams.get('create') === '1' && canCreate) {
      setShowCreate(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, canCreate, setSearchParams]);

  const openEngagement = (eng) => {
    setCurrentEngagement(eng);
    navigate(`/engagements/${eng.engagement_id}`);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {showCreate && (
        <CreateEngagementModal
          onClose={() => setShowCreate(false)}
          onCreated={(eng) => { setShowCreate(false); load(); openEngagement(eng); }}
        />
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Engagements</h1>
          <p className="page-subtitle">{engagements.length} engagement{engagements.length !== 1 ? 's' : ''} across active audit workflows</p>
        </div>
        <div className="page-actions">
          <div className="searchbar" style={{ width:260 }}>
            <Search size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
            <input placeholder="Search client name..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="select" style={{ width:160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option>Active</option>
            <option>Under Review</option>
            <option>Finalised</option>
            <option>Archived</option>
          </select>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15}/> New Engagement
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div className="card animate-in" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)' }}>Loading engagements...</div>
          ) : engagements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><FolderOpen size={24}/></div>
              <div className="empty-state-title">No engagements found</div>
              <div className="empty-state-sub">{search ? 'Try a different search' : 'Create your first engagement'}</div>
              {canCreate && !search && (
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Plus size={14}/> Create Engagement
                </button>
              )}
            </div>
          ) : (
            <div className="engagement-card-grid">
              {engagements.map(eng => (
                <article key={eng.engagement_id} className="engagement-card">
                  <button className="engagement-card-open" onClick={() => openEngagement(eng)}>
                    <div className="engagement-card-mark">
                      <Building2 size={22}/>
                    </div>
                    <div className="engagement-card-title-area">
                      <div className="engagement-card-label">Company Name</div>
                      <h2>{eng.client_name}</h2>
                      <div className="engagement-card-type">{engagementTypeName(eng.engagement_type)}</div>
                    </div>
                    <ArrowRight size={18} className="engagement-card-arrow"/>
                  </button>

                  <div className="engagement-card-badges">
                    <span className={statusBadgeClass(eng.status)}>{eng.status}</span>
                    {eng.is_eqcr_designated ? <span className="badge badge-purple"><ShieldCheck size={11}/> EQCR</span> : <span className="badge badge-navy">No EQCR</span>}
                    {eng.is_small_entity ? <span className="badge badge-blue">Small Entity</span> : <span className="badge badge-green">Standard Entity</span>}
                  </div>

                  <div className="engagement-card-meta-panel">
                    <div className="engagement-meta-item">
                      <span><CalendarDays size={14}/> Financial Year</span>
                      <strong>{eng.financial_year}</strong>
                    </div>
                    <div className="engagement-meta-item">
                      <span><Briefcase size={14}/> Engagement Type</span>
                      <strong>{engagementTypeName(eng.engagement_type)}</strong>
                    </div>
                    <div className="engagement-meta-item">
                      <span><Clock3 size={14}/> Created On</span>
                      <strong>{formatDate(eng.created_at)}</strong>
                    </div>
                    <div className="engagement-meta-item">
                      <span><Archive size={14}/> Status</span>
                      <strong>{eng.status}</strong>
                    </div>
                  </div>

                  <div className="engagement-card-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => openEngagement(eng)}>
                      Open Engagement <ArrowRight size={13}/>
                    </button>
                    {user?.role === 'Partner' && eng.status === 'Active' && (
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        try { await engApi.archive(eng.engagement_id); load(); toast.success('Archived'); }
                        catch(err) { toast.error(getErrorMessage(err)); }
                      }}>
                        <Archive size={13}/> Archive
                      </button>
                    )}
                    {user?.role === 'Partner' && eng.status === 'Archived' && (
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        try { await engApi.reopen(eng.engagement_id); load(); toast.success('Reopened'); }
                        catch(err) { toast.error(getErrorMessage(err)); }
                      }}>
                        <RotateCcw size={13}/> Reopen
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
