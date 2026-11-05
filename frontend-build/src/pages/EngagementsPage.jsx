/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { engApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { formatDate, statusBadgeClass, engagementTypeName, getErrorMessage, ENGAGEMENT_TYPES } from '../utils';
import {
  Plus, FolderOpen, Search, X, Building2, CalendarDays,
  ShieldCheck, Archive, RotateCcw, ArrowRight, Clock3, LayoutGrid, List
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
  const selectedType = ENGAGEMENT_TYPES.find(type => type.value === form.engagement_type);

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
                {selectedType?.description && (
                  <div className="field-help">{selectedType.description}</div>
                )}
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
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fyFilter, setFyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState('grid');

  const canCreate = ['Audit Manager', 'Partner', 'Admin'].includes(user?.role);
  const isPartner = user?.role === 'Partner';

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await engApi.list();
      setEngagements(res.data || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const archive = async (eng) => {
    try { await engApi.archive(eng.engagement_id); toast.success('Engagement archived'); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };
  const reopen = async (eng) => {
    try { await engApi.reopen(eng.engagement_id); toast.success('Engagement reopened'); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const fyOptions = useMemo(
    () => [...new Set(engagements.map(e => e.financial_year).filter(Boolean))].sort().reverse(),
    [engagements]
  );
  const activeCount = useMemo(() => engagements.filter(e => e.status === 'Active').length, [engagements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = engagements.filter(e =>
      (!q || e.client_name?.toLowerCase().includes(q)) &&
      (!statusFilter || e.status === statusFilter) &&
      (!fyFilter || e.financial_year === fyFilter) &&
      (!typeFilter || e.engagement_type === typeFilter)
    );
    const byClient = (a, b) => (a.client_name || '').localeCompare(b.client_name || '');
    const byDate = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
    const sorted = [...list];
    if (sort === 'client-asc') sorted.sort(byClient);
    else if (sort === 'client-desc') sorted.sort((a, b) => byClient(b, a));
    else if (sort === 'fy-desc') sorted.sort((a, b) => (b.financial_year || '').localeCompare(a.financial_year || ''));
    else if (sort === 'oldest') sorted.sort((a, b) => -byDate(a, b));
    else sorted.sort(byDate);
    return sorted;
  }, [engagements, search, statusFilter, fyFilter, typeFilter, sort]);

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setFyFilter(''); setTypeFilter(''); };

  const flags = (eng) => (
    <>
      {eng.is_eqcr_designated && <span className="badge badge-purple"><ShieldCheck size={11} /> EQCR</span>}
      {eng.is_small_entity && <span className="badge badge-blue">Small entity</span>}
      {eng.workflow_override && <span className="badge badge-amber">Override</span>}
    </>
  );
  const hasFlags = (eng) => eng.is_eqcr_designated || eng.is_small_entity || eng.workflow_override;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {showCreate && (
        <CreateEngagementModal
          onClose={() => setShowCreate(false)}
          onCreated={(eng) => { setShowCreate(false); load(); openEngagement(eng); }}
        />
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Engagements</h1>
          <p className="page-subtitle">{engagements.length} engagement{engagements.length !== 1 ? 's' : ''} · {activeCount} active</p>
        </div>
        <div className="page-actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New engagement
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="searchbar">
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option>Active</option><option>Under Review</option><option>Finalised</option><option>Archived</option>
        </select>
        <select className="select" value={fyFilter} onChange={e => setFyFilter(e.target.value)} aria-label="Filter by financial year">
          <option value="">All FY</option>
          {fyOptions.map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
        </select>
        <select className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {ENGAGEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
          <option value="recent">Recent first</option>
          <option value="oldest">Oldest first</option>
          <option value="client-asc">Client A–Z</option>
          <option value="client-desc">Client Z–A</option>
          <option value="fy-desc">Financial year</option>
        </select>
        <div className="toolbar-sep" />
        <span className="toolbar-count">{filtered.length} shown</span>
        <div className="segmented" role="group" aria-label="View mode">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-pressed={view === 'grid'}><LayoutGrid size={14} /> Grid</button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} aria-pressed={view === 'table'}><List size={14} /> Table</button>
        </div>
      </div>

      {loading ? (
        <div className="engagement-card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="eng-skel" key={i}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="skeleton skeleton-circle" style={{ width: 46, height: 46 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-line" style={{ width: '60%' }} />
                  <div className="skeleton skeleton-text" style={{ width: '85%' }} />
                </div>
              </div>
              <div className="skeleton skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton" style={{ height: 34, borderRadius: 'var(--r-md)' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon"><FolderOpen size={24} /></div>
          <div className="empty-state-title">Could not load engagements</div>
          <div className="empty-state-sub">There was a problem reaching the server. Please try again.</div>
          <button className="btn btn-outline btn-sm" onClick={load} style={{ marginTop: 6 }}><RotateCcw size={13} /> Retry</button>
        </div>
      ) : engagements.length === 0 ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon"><FolderOpen size={24} /></div>
          <div className="empty-state-title">No engagements yet</div>
          <div className="empty-state-sub">Create your first audit engagement to begin building the file.</div>
          {canCreate && <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ marginTop: 6 }}><Plus size={14} /> New engagement</button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon"><Search size={24} /></div>
          <div className="empty-state-title">No matching engagements</div>
          <div className="empty-state-sub">Try adjusting your search or filters.</div>
          <button className="btn btn-outline btn-sm" onClick={clearFilters} style={{ marginTop: 6 }}>Clear filters</button>
        </div>
      ) : view === 'grid' ? (
        <div className="engagement-card-grid">
          {filtered.map(eng => (
            <article key={eng.engagement_id} className="engagement-card">
              <button className="engagement-card-open" onClick={() => openEngagement(eng)}>
                <div className="engagement-card-mark"><Building2 size={22} /></div>
                <div className="engagement-card-title-area">
                  <div className="engagement-card-label">Client</div>
                  <h2>{eng.client_name}</h2>
                  <div className="engagement-card-type">{engagementTypeName(eng.engagement_type)}</div>
                </div>
                <ArrowRight size={18} className="engagement-card-arrow" />
              </button>
              <div className="engagement-card-badges">
                <span className={statusBadgeClass(eng.status)}>{eng.status}</span>
                {flags(eng)}
              </div>
              <div className="eng-card-meta">
                <span><CalendarDays size={13} /> FY {eng.financial_year}</span>
                <span><Clock3 size={13} /> {formatDate(eng.created_at)}</span>
              </div>
              <div className="engagement-card-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openEngagement(eng)}>Open engagement <ArrowRight size={13} /></button>
                {isPartner && eng.status === 'Active' && <button className="btn btn-outline btn-sm" onClick={() => archive(eng)}><Archive size={13} /> Archive</button>}
                {isPartner && eng.status === 'Archived' && <button className="btn btn-outline btn-sm" onClick={() => reopen(eng)}><RotateCcw size={13} /> Reopen</button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="list-scroll">
          <div className="card data-table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th><th>FY</th><th>Type</th><th>Status</th><th>Flags</th><th>Created</th><th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(eng => (
                    <tr key={eng.engagement_id} onClick={() => openEngagement(eng)}>
                      <td>
                        <span className="cell-client">
                          <span className="mini-mark"><Building2 size={15} /></span>
                          <b>{eng.client_name}</b>
                        </span>
                      </td>
                      <td className="font-mono">{eng.financial_year}</td>
                      <td>{engagementTypeName(eng.engagement_type)}</td>
                      <td><span className={statusBadgeClass(eng.status)}>{eng.status}</span></td>
                      <td>{hasFlags(eng) ? <span className="cell-flags">{flags(eng)}</span> : <span className="text-muted">—</span>}</td>
                      <td>{formatDate(eng.created_at)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isPartner && eng.status === 'Active' && <button className="icon-btn tip" data-tip="Archive" onClick={() => archive(eng)}><Archive size={15} /></button>}
                          {isPartner && eng.status === 'Archived' && <button className="icon-btn tip" data-tip="Reopen" onClick={() => reopen(eng)}><RotateCcw size={15} /></button>}
                          <button className="icon-btn tip" data-tip="Open" onClick={() => openEngagement(eng)}><ArrowRight size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
