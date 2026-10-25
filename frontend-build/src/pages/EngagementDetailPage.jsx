/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { engApi, folderApi, userApi, wpApi } from '../api';
import { useAuthStore, useAppStore } from '../store';
import { statusBadgeClass, getErrorMessage, formatDate, formatDateTime, formatBytes, downloadBlob } from '../utils';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, FileText,
  Upload, Plus, RotateCcw, Archive, CheckSquare, Activity,
  Lock, Unlock, Trash2, Send, ShieldAlert, AlertTriangle, CheckCircle2,
  PackageCheck, Download, PenLine, X, ClipboardList, Bell, MessageCircle,
  Paperclip, CalendarClock, UserRound
} from 'lucide-react';
import toast from 'react-hot-toast';
import WPDetailPanel from '../components/wps/WPDetailPanel';
import UploadModal from '../components/wps/UploadModal';
import CreateFolderModal from '../components/folders/CreateFolderModal';
import ClosureChecklistModal from '../components/closure/ClosureChecklistModal';
import RollForwardModal from '../components/engagements/RollForwardModal';
import RiskAssessmentPanel from '../components/agents/RiskAssessmentPanel';

function FolderNode({ folder, depth = 0, engagementId, onSelectWP, onRefresh, archived, locked, selectedWpIds, onToggleWP }) {
  const [open, setOpen] = useState(depth === 0);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const user = useAuthStore(s => s.user);
  const canUpload = !archived && !locked && !['EQCR Reviewer'].includes(user?.role);

  const indent = depth * 20;

  return (
    <div>
      {showUpload && (
        <UploadModal
          engagementId={engagementId}
          folderId={folder.folder_id}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); onRefresh(); toast.success('File uploaded'); }}
        />
      )}
      {showCreateFolder && (
        <CreateFolderModal
          engagementId={engagementId}
          sectionId={folder.section_id}
          parentFolderId={folder.folder_id}
          parentIndex={folder.wp_number}
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => { setShowCreateFolder(false); onRefresh(); }}
        />
      )}

      {/* Folder row */}
      <div className={`tree-folder-row folder-depth-${Math.min(depth, 2)}`} style={{ paddingLeft: 14 + indent }}>
        <button style={{ background:'none',border:'none',cursor:'pointer',padding:0,color:'var(--text-muted)',display:'flex',alignItems:'center' }}
          onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </button>
        {open ? <FolderOpen size={15} style={{ color:'var(--text-secondary)',flexShrink:0 }}/> : <Folder size={15} style={{ color:'var(--text-secondary)',flexShrink:0 }}/>}
        {folder.wp_number && (
          <span className="wp-number" style={{ fontSize:10 }}>{folder.wp_number}</span>
        )}
        <span style={{ flex:1,fontSize:13,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}
          onClick={() => setOpen(!open)}>
          {folder.folder_name}
        </span>
        {canUpload && open && (
          <div style={{ display:'flex',gap:4 }}>
            <button className="btn btn-icon-sm btn-ghost" title="Upload file" onClick={(e) => { e.stopPropagation(); setShowUpload(true); }}>
              <Upload size={12}/>
            </button>
            {depth < 8 && (
              <button className="btn btn-icon-sm btn-ghost" title="New subfolder" onClick={(e) => { e.stopPropagation(); setShowCreateFolder(true); }}>
                <Plus size={12}/>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {open && (
        <div>
          {/* Sub-folders */}
          {folder.children?.map(child => (
            <FolderNode key={child.folder_id} folder={child} depth={depth + 1}
              engagementId={engagementId} onSelectWP={onSelectWP} onRefresh={onRefresh} archived={archived} locked={locked}
              selectedWpIds={selectedWpIds} onToggleWP={onToggleWP}/>
          ))}
          {/* WPs in this folder */}
          {folder.working_papers?.map(wp => (
            <WPRow key={wp.wp_id} wp={wp} indent={indent + 20}
              selected={selectedWpIds?.has(wp.wp_id)}
              onToggle={(checked) => onToggleWP?.(wp.wp_id, checked)}
              onSelect={() => onSelectWP(wp)}/>
          ))}
          {folder.children?.length === 0 && folder.working_papers?.length === 0 && (
            <div style={{ paddingLeft: 14 + indent + 20, padding:'6px 0 6px ' + (14 + indent + 36) + 'px', fontSize:11, color:'var(--text-muted)' }}>
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WPRow({ wp, indent, onSelect, selected, onToggle }) {
  const statusColors = {
    'Draft': 'var(--text-muted)', 'Submitted': 'var(--blue)',
    'Under Review': 'var(--amber)', 'Review Notes Raised': 'var(--red)', 'Finalised': 'var(--green)'
  };

  return (
    <div className="tree-wp-row" style={{ paddingLeft: 14 + indent }} onClick={onSelect}>
      <input
        type="checkbox"
        className="wp-select-box"
        checked={!!selected}
        onChange={e => onToggle?.(e.target.checked)}
        onClick={e => e.stopPropagation()}
        aria-label={`Select ${wp.filename}`}
      />
      <FileText size={13} style={{ color:'var(--text-muted)',flexShrink:0 }}/>
      <span className="wp-number">{wp.wp_number}</span>
      <span className="wp-name">{wp.filename}</span>
      <div className="wp-meta">
        <span className="signoff-chip" title="Preparer">{wp.prepared_by_initials || 'P-'}</span>
        <span className="signoff-chip" title="Reviewer 1">{wp.reviewer1_initials || 'R1-'}</span>
        <span className="signoff-chip" title="Reviewer 2">{wp.reviewer2_initials || 'R2-'}</span>
        {wp.open_notes_count > 0 && (
          <span className="badge badge-red" style={{ fontSize:10 }}>{wp.open_notes_count} note{wp.open_notes_count > 1 ? 's' : ''}</span>
        )}
        <span style={{ fontSize:10, color: statusColors[wp.review_status] || 'var(--text-muted)', whiteSpace:'nowrap' }}>
          {wp.review_status}
        </span>
      </div>
    </div>
  );
}

export default function EngagementDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { setCurrentEngagement } = useAppStore();

  const [engagement, setEngagement] = useState(null);
  const [tree, setTree] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedWP, setSelectedWP] = useState(null);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [showClosure, setShowClosure] = useState(false);
  const [showRollForward, setShowRollForward] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [createFolderSection, setCreateFolderSection] = useState(null);
  const [selectedWpIds, setSelectedWpIds] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const [engRes, treeRes] = await Promise.all([
        engApi.get(id),
        folderApi.tree(id)
      ]);
      setEngagement(engRes.data);
      setCurrentEngagement(engRes.data);
      setTree(treeRes.data.data || {});
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate('/engagements');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const locked = ['Archived', 'Finalised'].includes(engagement?.status);
  const isPartner = user?.role === 'Partner';
  const isPartnerOrAdmin = ['Partner', 'Admin'].includes(user?.role);
  const canManageTeam = ['Audit Manager', 'Partner', 'Admin'].includes(user?.role);
  const canCreateFolder = !locked && !['EQCR Reviewer'].includes(user?.role);
  const canBulkSubmit = !locked && ['Articled Assistant','Audit Executive','Audit Manager','Partner','Admin'].includes(user?.role);

  const toggleWorkflowOverride = async () => {
    try {
      const res = await engApi.toggleWorkflowOverride(id);
      setEngagement(res.data.data);
      toast.success(res.data.message || 'Workflow override updated');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const toggleWpSelection = (wpId, checked) => {
    setSelectedWpIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(wpId);
      else next.delete(wpId);
      return next;
    });
  };

  const bulkSubmit = async () => {
    const ids = [...selectedWpIds];
    if (ids.length === 0) return;
    try {
      const res = await wpApi.bulkSubmit(id, ids);
      toast.success(res.data.message || 'Selected WPs submitted');
      setSelectedWpIds(new Set());
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)' }}>
      Loading engagement…
    </div>
  );

  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden' }}>
      {showClosure && (
        <ClosureChecklistModal
          engagementId={id}
          onClose={() => setShowClosure(false)}
          onArchived={() => { setShowClosure(false); load(); }}
        />
      )}
      {showRollForward && (
        <RollForwardModal
          engagement={engagement}
          onClose={() => setShowRollForward(false)}
          onCreated={(newEng) => { setShowRollForward(false); navigate(`/engagements/${newEng.engagement_id}`); }}
        />
      )}
      {showCreateFolder && createFolderSection && (
        <CreateFolderModal
          engagementId={id}
          sectionId={createFolderSection.section_id}
          sectionCode={createFolderSection.section_code}
          parentFolderId={null}
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => { setShowCreateFolder(false); load(); }}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{engagement?.client_name}</h1>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:3 }}>
            <span style={{ fontFamily:'monospace',fontSize:12,color:'var(--text-secondary)' }}>FY {engagement?.financial_year}</span>
            <span className={statusBadgeClass(engagement?.status)}>{engagement?.status}</span>
            {engagement?.is_eqcr_designated && <span className="badge badge-purple">EQCR</span>}
            {engagement?.is_small_entity && <span className="badge badge-blue">Small entity</span>}
            {engagement?.workflow_override && <span className="badge badge-amber">Workflow override</span>}
          </div>
        </div>
        <div className="page-actions">
          {isPartnerOrAdmin && !locked && (
            <button className={`btn btn-sm ${engagement?.workflow_override ? 'btn-navy' : 'btn-outline'}`} onClick={toggleWorkflowOverride}>
              {engagement?.workflow_override ? <Unlock size={14}/> : <Lock size={14}/>}
              {engagement?.workflow_override ? 'Override On' : 'Override Locks'}
            </button>
          )}
          {isPartner && !locked && (
            <button className="btn btn-outline btn-sm" onClick={() => setShowClosure(true)}>
              <CheckSquare size={14}/> Close Engagement
            </button>
          )}
          {isPartner && locked && (
            <button className="btn btn-outline btn-sm" onClick={async () => {
              try { await engApi.reopen(id); load(); toast.success('Engagement reopened'); }
              catch(err) { toast.error(getErrorMessage(err)); }
            }}>
              <RotateCcw size={14}/> Reopen
            </button>
          )}
          {isPartnerOrAdmin && (
            <button className="btn btn-outline btn-sm" onClick={() => setShowRollForward(true)}>
              <RotateCcw size={14}/> Roll Forward
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { if (!documentDirty || window.confirm('Discard unsaved document changes?')) navigate('/engagements'); }}>
            ← Back
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:'var(--bg-card)',borderBottom:'1px solid var(--border)',paddingLeft:28,flexShrink:0 }}>
        <div className="tabs" style={{ borderBottom:'none' }}>
          {['files', 'agent', 'requests', 'quality', 'assembly', 'esign', ...(canManageTeam ? ['people'] : []), 'activity'].map(tab => (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => { if (tab === activeTab || !documentDirty || window.confirm('Discard unsaved document changes?')) setActiveTab(tab); }}>
              {tab === 'files' ? 'File Explorer' : tab === 'agent' ? 'Risk Assessment Agent' : tab === 'requests' ? 'Client Requests' : tab === 'quality' ? 'Quality Checks' : tab === 'assembly' ? 'Final Assembly' : tab === 'esign' ? 'E-Signatures' : tab === 'people' ? 'People' : 'Activity Log'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="engagement-workspace" style={{ flex:1,display:'flex',overflow:'hidden' }}>
        {activeTab === 'agent' && <RiskAssessmentPanel key={id} engagement={engagement} archived={locked} onPublished={load}/>}
        {activeTab === 'files' && (
          <>
            {/* Folder tree */}
            <div className={`engagement-file-pane ${selectedWP ? 'is-detail-open' : ''}`} style={{ width: selectedWP ? '55%' : '100%', overflow:'hidden', display:'flex', flexDirection:'column', transition:'width .2s', borderRight: selectedWP ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
                {locked && (
                  <div style={{ background:'var(--amber-bg)',border:'1px solid rgba(212,131,10,.2)',borderRadius:'var(--r-md)',padding:'10px 14px',fontSize:12,color:'var(--amber)',display:'flex',alignItems:'center',gap:8 }}>
                    <Archive size={14}/> This engagement is locked - all working papers are read-only
                  </div>
                )}

                {selectedWpIds.size > 0 && (
                  <div className="bulk-action-bar">
                    <span>{selectedWpIds.size} working paper{selectedWpIds.size > 1 ? 's' : ''} selected</span>
                    <div style={{ display:'flex', gap:8 }}>
                      {canBulkSubmit && (
                        <button className="btn btn-navy btn-sm" onClick={bulkSubmit}>
                          <Send size={13}/> Submit selected
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => setSelectedWpIds(new Set())}>
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                <div className="folder-tree">
                  {Object.entries(tree).map(([code, section]) => (
                    <SectionBlock
                      key={code}
                      code={code}
                      section={section}
                      engagementId={id}
                      onSelectWP={next => { if (next.wp_id !== selectedWP?.wp_id && (!documentDirty || window.confirm('Discard unsaved document changes?'))) setSelectedWP(next); }}
                      onRefresh={load}
                      archived={locked}
                      canCreateFolder={canCreateFolder}
                      onCreateFolderInSection={() => {
                        setCreateFolderSection(section);
                        setShowCreateFolder(true);
                      }}
                      selectedWpIds={selectedWpIds}
                      onToggleWP={toggleWpSelection}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* WP detail panel */}
            {selectedWP && (
              <WPDetailPanel
                wp={selectedWP}
                onDocumentDirtyChange={setDocumentDirty}
                engagementId={id}
                archived={locked}
                onClose={() => setSelectedWP(null)}
                onRefresh={load}
              />
            )}
          </>
        )}

        {activeTab === 'activity' && (
          <ActivityLog engagementId={id}/>
        )}

        {activeTab === 'quality' && (
          <QualityChecksPanel engagementId={id}/>
        )}

        {activeTab === 'requests' && (
          <ClientRequestsPanel engagementId={id} archived={locked}/>
        )}

        {activeTab === 'assembly' && (
          <FinalAssemblyPanel engagementId={id} archived={locked} onRefresh={load}/>
        )}

        {activeTab === 'esign' && (
          <ESignaturesPanel engagementId={id} archived={locked}/>
        )}

        {activeTab === 'people' && (
          <PeoplePanel engagementId={id} archived={locked}/>
        )}
      </div>
    </div>
  );
}

const REQUEST_STATUSES = ['Requested', 'Received', 'Under Review', 'Accepted', 'Returned'];

function requestBadgeClass(status, overdue) {
  if (overdue) return 'badge badge-red';
  const map = {
    Requested: 'badge badge-blue',
    Received: 'badge badge-amber',
    'Under Review': 'badge badge-purple',
    Accepted: 'badge badge-green',
    Returned: 'badge badge-red',
  };
  return map[status] || 'badge badge-navy';
}

function isRequestOverdue(item) {
  if (!item?.due_date || ['Accepted'].includes(item.status)) return false;
  return new Date(item.due_date) < new Date();
}

function ClientRequestsPanel({ engagementId, archived }) {
  const user = useAuthStore(s => s.user);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    request_type: 'Document',
    priority: 'Normal',
    due_date: '',
    owner_user_id: '',
    client_contact_name: '',
    client_contact_email: '',
  });
  const canManage = !archived && ['Audit Executive','Audit Manager','Partner','Admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestRes, userRes] = await Promise.all([
        engApi.clientRequests(engagementId, filter ? { status: filter } : undefined),
        userApi.list().catch(() => ({ data: [] })),
      ]);
      const nextItems = requestRes.data || [];
      setItems(nextItems);
      setUsers(userRes.data || []);
      setSelected(prev => {
        if (!prev) return nextItems[0] || null;
        return nextItems.find(item => item.request_id === prev.request_id) || nextItems[0] || null;
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId, filter]);

  const loadComments = useCallback(async (requestId) => {
    if (!requestId) {
      setComments([]);
      return;
    }
    try {
      const res = await engApi.clientRequestComments(requestId);
      setComments(res.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadComments(selected?.request_id); }, [selected?.request_id, loadComments]);

  const createRequest = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await engApi.createClientRequest(engagementId, {
        ...form,
        due_date: form.due_date ? new Date(`${form.due_date}T00:00:00`).toISOString() : null,
        owner_user_id: form.owner_user_id || null,
      });
      toast.success('Client request created');
      setForm({
        title: '',
        description: '',
        request_type: 'Document',
        priority: 'Normal',
        due_date: '',
        owner_user_id: '',
        client_contact_name: '',
        client_contact_email: '',
      });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const updateRequest = async (item, patch) => {
    try {
      const res = await engApi.updateClientRequest(item.request_id, patch);
      toast.success('Request updated');
      const updated = res.data.data;
      setItems(prev => prev.map(row => row.request_id === item.request_id ? updated : row));
      setSelected(prev => prev?.request_id === item.request_id ? updated : prev);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const uploadFile = async (item, file) => {
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await engApi.uploadClientRequestFile(item.request_id, data);
      toast.success('Client document uploaded');
      const updated = res.data.data;
      setItems(prev => prev.map(row => row.request_id === item.request_id ? updated : row));
      setSelected(prev => prev?.request_id === item.request_id ? updated : prev);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const downloadFile = async (item) => {
    try {
      const res = await engApi.downloadClientRequestFile(item.request_id);
      downloadBlob(res.data, item.uploaded_file_name || 'client-document');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const remind = async (item) => {
    try {
      await engApi.remindClientRequest(item.request_id);
      toast.success('Reminder recorded');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!selected || !commentText.trim()) return;
    try {
      await engApi.addClientRequestComment(selected.request_id, commentText.trim());
      setCommentText('');
      loadComments(selected.request_id);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const totals = {
    open: items.filter(item => !['Accepted'].includes(item.status)).length,
    overdue: items.filter(isRequestOverdue).length,
    received: items.filter(item => item.status === 'Received').length,
  };

  return (
    <div className="pbc-page">
      <div className="pbc-header">
        <div className="pbc-header-main">
          <div className="pbc-header-icon"><ClipboardList size={24}/></div>
          <div>
            <h2>Client Request List</h2>
            <p>Track PBC items, due dates, ownership, client uploads, reminders, and discussion in one engagement workspace.</p>
          </div>
        </div>
        <div className="pbc-stats">
          <div><span>Open</span><strong>{totals.open}</strong></div>
          <div><span>Received</span><strong>{totals.received}</strong></div>
          <div><span>Overdue</span><strong>{totals.overdue}</strong></div>
        </div>
      </div>

      <div className="pbc-layout">
        <div className="pbc-left">
          {canManage && (
            <div className="pbc-create">
              <div className="pbc-section-title">New Request</div>
              <form onSubmit={createRequest}>
                <div className="form-group">
                  <label className="form-label">Request Title</label>
                  <input className="input" value={form.title} onChange={e => setForm({...form, title:e.target.value})} required/>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="input" rows={3} value={form.description} onChange={e => setForm({...form, description:e.target.value})}/>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="select" value={form.request_type} onChange={e => setForm({...form, request_type:e.target.value})}>
                      <option>Document</option>
                      <option>Trial Balance</option>
                      <option>Confirmation</option>
                      <option>Schedule</option>
                      <option>Clarification</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="select" value={form.priority} onChange={e => setForm({...form, priority:e.target.value})}>
                      <option>Low</option>
                      <option>Normal</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input className="input" type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Owner</label>
                    <select className="select" value={form.owner_user_id} onChange={e => setForm({...form, owner_user_id:e.target.value})}>
                      <option value="">Current user</option>
                      {users.filter(u => u.is_active).map(u => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Client Contact</label>
                    <input className="input" value={form.client_contact_name} onChange={e => setForm({...form, client_contact_name:e.target.value})}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client Email</label>
                    <input className="input" type="email" value={form.client_contact_email} onChange={e => setForm({...form, client_contact_email:e.target.value})}/>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" type="submit" disabled={saving || !form.title.trim()}>
                  <Plus size={13}/> {saving ? 'Creating...' : 'Create Request'}
                </button>
              </form>
            </div>
          )}

          <div className="pbc-toolbar">
            <div className="pbc-section-title">Request Register</div>
            <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">All statuses</option>
              {REQUEST_STATUSES.map(status => <option key={status}>{status}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="pbc-loading">Loading client requests...</div>
          ) : items.length === 0 ? (
            <div className="empty-state" style={{ padding:30 }}>
              <div className="empty-state-icon"><ClipboardList size={22}/></div>
              <div className="empty-state-title">No client requests yet</div>
              <div className="empty-state-sub">Create PBC requests for documents, confirmations, schedules, and clarifications.</div>
            </div>
          ) : (
            <div className="pbc-list">
              {items.map(item => {
                const overdue = isRequestOverdue(item);
                return (
                  <button
                    type="button"
                    className={`pbc-row ${selected?.request_id === item.request_id ? 'active' : ''}`}
                    key={item.request_id}
                    onClick={() => setSelected(item)}
                  >
                    <div className="pbc-row-top">
                      <strong>{item.title}</strong>
                      <span className={requestBadgeClass(item.status, overdue)}>{overdue ? 'Overdue' : item.status}</span>
                    </div>
                    <div className="pbc-row-meta">
                      <span><CalendarClock size={12}/> {formatDate(item.due_date)}</span>
                      <span><UserRound size={12}/> {item.owner_name || 'Unassigned'}</span>
                      {item.comments_count > 0 && <span><MessageCircle size={12}/> {item.comments_count}</span>}
                      {item.uploaded_file_name && <span><Paperclip size={12}/> {formatBytes(item.uploaded_file_size)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pbc-detail">
          {!selected ? (
            <div className="empty-state">
              <div className="empty-state-title">Select a request</div>
            </div>
          ) : (
            <>
              <div className="pbc-detail-head">
                <div>
                  <span className={requestBadgeClass(selected.status, isRequestOverdue(selected))}>{isRequestOverdue(selected) ? 'Overdue' : selected.status}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.description || 'No description added.'}</p>
                </div>
                {canManage && (
                  <button className="btn btn-outline btn-sm" onClick={() => remind(selected)}>
                    <Bell size={13}/> Remind
                  </button>
                )}
              </div>

              <div className="pbc-detail-grid">
                <div><span>Type</span><strong>{selected.request_type}</strong></div>
                <div><span>Priority</span><strong>{selected.priority}</strong></div>
                <div><span>Due date</span><strong>{formatDate(selected.due_date)}</strong></div>
                <div><span>Owner</span><strong>{selected.owner_name || 'Unassigned'}</strong></div>
                <div><span>Client</span><strong>{selected.client_contact_name || '-'}</strong></div>
                <div><span>Email</span><strong>{selected.client_contact_email || '-'}</strong></div>
              </div>

              <div className="pbc-action-row">
                {canManage && (
                  <select className="select" value={selected.status} onChange={e => updateRequest(selected, { status: e.target.value })}>
                    {REQUEST_STATUSES.map(status => <option key={status}>{status}</option>)}
                  </select>
                )}
                {!archived && (
                  <label className="btn btn-outline btn-sm">
                    <Upload size={13}/> Upload
                    <input type="file" hidden onChange={e => uploadFile(selected, e.target.files?.[0])}/>
                  </label>
                )}
                {selected.uploaded_file_name && (
                  <button className="btn btn-navy btn-sm" onClick={() => downloadFile(selected)}>
                    <Download size={13}/> Download
                  </button>
                )}
              </div>

              {selected.uploaded_file_name && (
                <div className="pbc-file-box">
                  <Paperclip size={14}/>
                  <div>
                    <strong>{selected.uploaded_file_name}</strong>
                    <span>{formatBytes(selected.uploaded_file_size)} uploaded by {selected.uploaded_by_name || 'client'} {formatDateTime(selected.uploaded_at)}</span>
                  </div>
                </div>
              )}

              <div className="pbc-comments">
                <div className="pbc-section-title">Comments</div>
                <div className="pbc-comment-list">
                  {comments.length === 0 ? (
                    <div className="pbc-muted">No comments yet.</div>
                  ) : comments.map(comment => (
                    <div className="pbc-comment" key={comment.comment_id}>
                      <div>
                        <strong>{comment.author_name || 'User'}</strong>
                        <span>{comment.author_role || ''} | {formatDateTime(comment.created_at)}</span>
                      </div>
                      <p>{comment.comment_text}</p>
                    </div>
                  ))}
                </div>
                {!archived && (
                  <form className="pbc-comment-form" onSubmit={addComment}>
                    <input className="input" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment"/>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={!commentText.trim()}>
                      <MessageCircle size={13}/> Add
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FinalAssemblyPanel({ engagementId, archived, onRefresh }) {
  const user = useAuthStore(s => s.user);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assembling, setAssembling] = useState(false);
  const canAssemble = ['Partner','Admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await engApi.finalAssembly(engagementId);
      setStatus(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const assemble = async (force = false) => {
    if (!force && !confirm('Assemble and lock the final audit file?')) return;
    if (force && !confirm('Force assemble despite critical quality issues?')) return;
    setAssembling(true);
    try {
      await engApi.createFinalAssembly(engagementId, force);
      toast.success('Final audit file assembled');
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAssembling(false);
    }
  };

  const downloadArchive = async (archive) => {
    try {
      const res = await engApi.downloadFinalArchive(engagementId, archive.archive_id);
      downloadBlob(res.data, archive.archive_name);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="assembly-page">
      {loading ? (
        <div style={{ color:'var(--text-muted)', fontSize:13 }}>Loading final assembly...</div>
      ) : (
        <>
          <div className="assembly-hero">
            <div className="assembly-hero-icon"><PackageCheck size={26}/></div>
            <div>
              <h2>Final Audit File Assembly</h2>
              <p>Create a retention-ready ZIP pack with all current working papers, manifest, quality findings, and lock trail.</p>
            </div>
            <div className="assembly-actions">
              {canAssemble && !archived && !status?.is_locked && (
                <>
                  <button className="btn btn-primary" onClick={() => assemble(false)} disabled={assembling}>
                    <PackageCheck size={14}/> {assembling ? 'Assembling...' : 'Assemble & Lock'}
                  </button>
                  <button className="btn btn-outline" onClick={() => assemble(true)} disabled={assembling}>
                    Force
                  </button>
                </>
              )}
              {status?.is_locked && <span className="badge badge-green">Locked</span>}
            </div>
          </div>

          <div className="assembly-grid">
            <div className="assembly-card">
              <span>Latest archive</span>
              <strong>{status?.latest_archive ? status.latest_archive.archive_name : 'Not assembled'}</strong>
            </div>
            <div className="assembly-card">
              <span>Quality score</span>
              <strong>{status?.latest_archive?.quality_score ?? '-'}</strong>
            </div>
            <div className="assembly-card">
              <span>Post-assembly changes</span>
              <strong>{status?.latest_archive?.post_assembly_changes ?? 0}</strong>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Retention Archives</div>
            </div>
            {(status?.archives || []).length === 0 ? (
              <div className="empty-state" style={{ padding:30 }}>
                <div className="empty-state-title">No final archive yet</div>
                <div className="empty-state-sub">Run final assembly after quality checks and sign-offs are complete.</div>
              </div>
            ) : (
              <div className="assembly-list">
                {status.archives.map(archive => (
                  <div className="assembly-row" key={archive.archive_id}>
                    <PackageCheck size={15}/>
                    <div>
                      <strong>{archive.archive_name}</strong>
                      <span>
                        {formatDateTime(archive.assembled_at)} | {formatBytes(archive.file_size_bytes)} | Score {archive.quality_score} | {archive.issue_count} issue(s)
                      </span>
                    </div>
                    {archive.post_assembly_changes > 0 && <span className="badge badge-amber">{archive.post_assembly_changes} later change(s)</span>}
                    <button className="btn btn-outline btn-sm" onClick={() => downloadArchive(archive)}>
                      <Download size={13}/> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ESignaturesPanel({ engagementId, archived }) {
  const user = useAuthStore(s => s.user);
  const [items, setItems] = useState([]);
  const [wps, setWps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    document_type: 'Engagement Letter',
    signer_name: '',
    signer_email: '',
    wp_id: '',
  });
  const canManage = !archived && ['Audit Manager','Partner','Admin'].includes(user?.role);

  const flattenTree = (treeData) => {
    const result = [];
    const walk = (folder) => {
      (folder.working_papers || []).forEach(wp => result.push(wp));
      (folder.children || []).forEach(walk);
    };
    Object.values(treeData || {}).forEach(section => (section.folders || []).forEach(walk));
    return result;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRes, treeRes] = await Promise.all([
        engApi.eSignatures(engagementId),
        folderApi.tree(engagementId),
      ]);
      setItems(sigRes.data || []);
      setWps(flattenTree(treeRes.data.data || {}));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const createRequest = async (e) => {
    e.preventDefault();
    try {
      await engApi.createESignature(engagementId, {
        ...form,
        wp_id: form.wp_id || null,
      });
      toast.success('E-signature request created');
      setForm({ document_type:'Engagement Letter', signer_name:'', signer_email:'', wp_id:'' });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const signRequest = async (item) => {
    const signatureText = prompt(`Type signature text for ${item.document_type}`);
    if (!signatureText) return;
    try {
      await engApi.signESignature(item.request_id, {
        signer_name: user?.full_name || item.signer_name,
        signature_text: signatureText,
      });
      toast.success('Document signed');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const cancelRequest = async (item) => {
    if (!confirm(`Cancel signature request for ${item.signer_name}?`)) return;
    try {
      await engApi.cancelESignature(item.request_id);
      toast.success('Request cancelled');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="esign-page">
      {canManage && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Create E-Signature Request</div>
          </div>
          <form className="card-body" onSubmit={createRequest}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Document Type</label>
                <select className="select" value={form.document_type} onChange={e => setForm({...form, document_type:e.target.value})}>
                  <option>Engagement Letter</option>
                  <option>Management Representation Letter</option>
                  <option>External Confirmation</option>
                  <option>Approval Sign-off</option>
                  <option>Other Document</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Linked Working Paper</label>
                <select className="select" value={form.wp_id} onChange={e => setForm({...form, wp_id:e.target.value})}>
                  <option value="">No linked WP</option>
                  {wps.map(wp => <option key={wp.wp_id} value={wp.wp_id}>{wp.wp_number} - {wp.filename}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Signer Name</label>
                <input className="input" value={form.signer_name} onChange={e => setForm({...form, signer_name:e.target.value})} required/>
              </div>
              <div className="form-group">
                <label className="form-label">Signer Email</label>
                <input className="input" type="email" value={form.signer_email} onChange={e => setForm({...form, signer_email:e.target.value})} required/>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" type="submit">
              <PenLine size={13}/> Create Request
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Signature Trail</div>
        </div>
        {loading ? (
          <div style={{ padding:20, color:'var(--text-muted)' }}>Loading signatures...</div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding:30 }}>
            <div className="empty-state-title">No e-signature requests</div>
          </div>
        ) : (
          <div className="esign-list">
            {items.map(item => (
              <div className="esign-row" key={item.request_id}>
                <PenLine size={15}/>
                <div>
                  <strong>{item.document_type}</strong>
                  <span>{item.signer_name} | {item.signer_email} | requested {formatDateTime(item.requested_at)}</span>
                  {item.signed_at && <span>Signed by {item.signed_by_name} on {formatDateTime(item.signed_at)}</span>}
                </div>
                <span className={`badge ${item.status === 'Signed' ? 'badge-green' : item.status === 'Cancelled' ? 'badge-navy' : 'badge-amber'}`}>{item.status}</span>
                {item.status === 'Pending' && (
                  <>
                    <button className="btn btn-outline btn-sm" onClick={() => signRequest(item)}>
                      <PenLine size={13}/> Sign
                    </button>
                    {canManage && (
                      <button className="btn btn-icon-sm btn-ghost" title="Cancel" onClick={() => cancelRequest(item)}>
                        <X size={13}/>
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QualityChecksPanel({ engagementId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await engApi.qualityChecks(engagementId);
      setResult(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const checks = result?.checks || [];
  const severityClass = (severity) => ({
    critical: 'badge-red',
    high: 'badge-amber',
    medium: 'badge-blue',
    low: 'badge-navy',
  }[severity] || 'badge-navy');

  return (
    <div className="quality-page">
      {loading ? (
        <div style={{ color:'var(--text-muted)', fontSize:13 }}>Running review quality checks...</div>
      ) : (
        <>
          <div className="quality-summary-grid">
            <div className="quality-score-card">
              <div className="quality-score-ring">
                <strong>{result?.score ?? 100}</strong>
                <span>/100</span>
              </div>
              <div>
                <div className="quality-score-title">Review Quality Score</div>
                <div className="quality-score-sub">Rule-based checks for SA 230-style file discipline.</div>
              </div>
            </div>
            <QualityMetric label="Critical" value={result?.critical || 0} tone="red"/>
            <QualityMetric label="High" value={result?.high || 0} tone="amber"/>
            <QualityMetric label="Medium" value={result?.medium || 0} tone="blue"/>
            <QualityMetric label="Total Issues" value={result?.total_issues || 0} tone="navy"/>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <ShieldAlert size={15}/> Review Quality Findings
              </div>
              <button className="btn btn-ghost btn-xs" onClick={load}>Run again</button>
            </div>
            {checks.length === 0 ? (
              <div className="empty-state" style={{ padding:34 }}>
                <div className="empty-state-icon"><CheckCircle2 size={22}/></div>
                <div className="empty-state-title">No quality issues found</div>
                <div className="empty-state-sub">All current working papers passed the configured checks.</div>
              </div>
            ) : (
              <div className="quality-check-list">
                {checks.map(check => (
                  <div className="quality-check-row" key={check.check_id}>
                    <div className={`quality-check-icon ${check.severity}`}>
                      <AlertTriangle size={15}/>
                    </div>
                    <div className="quality-check-main">
                      <div className="quality-check-top">
                        <div>
                          <strong>{check.title}</strong>
                          <span>{check.category} | {check.section_code || 'No section'} | WP {check.wp_number || '-'}</span>
                        </div>
                        <span className={`badge ${severityClass(check.severity)}`}>{check.severity}</span>
                      </div>
                      <p>{check.detail}</p>
                      <div className="quality-recommendation">{check.recommendation}</div>
                      {check.filename && <div className="quality-file-name">{check.filename}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function QualityMetric({ label, value, tone }) {
  return (
    <div className={`quality-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PeoplePanel({ engagementId, archived }) {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({ user_id: '', role: 'Preparer' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        userApi.list(),
        userApi.assignments(engagementId),
      ]);
      setUsers(usersRes.data || []);
      setAssignments(assignmentsRes.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.user_id) return;
    try {
      await userApi.assign(engagementId, form.user_id, form.role);
      toast.success('User assignment saved');
      setForm({ user_id: '', role: 'Preparer' });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const removeAssignment = async (assignment) => {
    if (!confirm(`Remove ${assignment.full_name} from this engagement?`)) return;
    try {
      await userApi.removeAssignment(engagementId, assignment.id);
      toast.success('User removed from engagement');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Engagement Team</div>
            <div className="text-sm text-secondary">Assign users as Preparer, Reviewer, or EQCR for this engagement.</div>
          </div>
        </div>
        {!archived && (
          <form className="card-body" onSubmit={submit}>
            <div className="form-row" style={{ alignItems:'end' }}>
              <div className="form-group">
                <label className="form-label">User</label>
                <select className="select" value={form.user_id} onChange={e => setForm({...form, user_id:e.target.value})}>
                  <option value="">Select user</option>
                  {users.filter(u => u.is_active).map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.full_name} ({u.initials || u.role})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Engagement Role</label>
                <select className="select" value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                  <option>Preparer</option>
                  <option>Reviewer</option>
                  <option>EQCR</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={!form.user_id}>Assign</button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <div style={{ color:'var(--text-muted)',fontSize:13 }}>Loading team...</div>
      ) : assignments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No assigned users</div>
        </div>
      ) : (
        <div className="people-grid">
          {assignments.map(item => (
            <div className="person-row" key={item.id}>
              <div className="user-avatar">{item.initials || '?'}</div>
              <div className="person-main">
                <div className="person-name">{item.full_name}</div>
                <div className="person-meta">{item.email} | {item.system_role}</div>
              </div>
              <span className={`badge ${item.engagement_role === 'EQCR' ? 'badge-purple' : item.engagement_role === 'Reviewer' ? 'badge-blue' : 'badge-green'}`}>
                {item.engagement_role}
              </span>
              {!archived && (
                <button className="btn btn-icon-sm btn-ghost" title="Remove assignment" onClick={() => removeAssignment(item)}>
                  <Trash2 size={13}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionBlock({ code, section, engagementId, onSelectWP, onRefresh, archived, canCreateFolder, onCreateFolderInSection, selectedWpIds, onToggleWP }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="tree-section">
      <div className="tree-section-header" onClick={() => setOpen(!open)}>
        <span className="tree-section-code">{code}</span>
        <span className="tree-section-name">{section.section_name}</span>
        {section.locked && (
          <span className="badge badge-amber" title="Locked by sequential workflow">
            <Lock size={11}/> Locked
          </span>
        )}
        {canCreateFolder && !section.locked && open && (
          <button className="btn btn-icon-sm btn-ghost"
            title="New folder in section" onClick={(e) => { e.stopPropagation(); onCreateFolderInSection(); }}>
            <Plus size={12}/>
          </button>
        )}
        {open ? <ChevronDown size={16} style={{ color:'var(--text-muted)' }}/> : <ChevronRight size={16} style={{ color:'var(--text-muted)' }}/>}
      </div>

      {open && (
        <div>
          {section.folders?.length === 0 ? (
            <div style={{ padding:'16px',fontSize:12,color:'var(--text-muted)',textAlign:'center' }}>
              No folders yet — add a folder to start organising working papers
            </div>
          ) : (
            section.folders?.map(folder => (
              <FolderNode
                key={folder.folder_id}
                folder={folder}
                depth={0}
                engagementId={engagementId}
                onSelectWP={onSelectWP}
                onRefresh={onRefresh}
                archived={archived}
                locked={section.locked}
                selectedWpIds={selectedWpIds}
                onToggleWP={onToggleWP}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ActivityLog({ engagementId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    engApi.events(engagementId).then(r => setEvents(r.data.data || [])).finally(() => setLoading(false));
  }, [engagementId]);

  const eventLabel = (type) => {
    const map = {
      'engagement.created': '🟢 Engagement created',
      'wp.uploaded': '📄 Working paper uploaded',
      'review.submitted': '📤 Submitted for review',
      'note.raised': '🔴 Review note raised',
      'note.closed': '✅ Review note closed',
      'review.finalised': '✅ WP finalised',
      'engagement.archived': '📦 Engagement archived',
      'engagement.reopened': '🔓 Engagement reopened',
      'engagement.rollforward': '🔄 Roll-forward created',
      'signoff.recorded': '✍️ Sign-off recorded',
      'user.assigned': '👤 User assigned',
    };
    return map[type] || type;
  };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>Activity Log</div>
      {loading ? (
        <div style={{ color:'var(--text-muted)',fontSize:13 }}>Loading…</div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Activity size={24}/></div>
          <div className="empty-state-title">No activity yet</div>
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:1 }}>
          {events.map(ev => (
            <div key={ev.event_id} style={{ display:'flex',gap:14,padding:'10px 0',borderBottom:'1px solid var(--border)',alignItems:'flex-start' }}>
              <div style={{ fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap',minWidth:130,marginTop:1 }}>
                {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,color:'var(--text-primary)',fontWeight:500 }}>{eventLabel(ev.event_type)}</div>
                {ev.actor_name && <div style={{ fontSize:11,color:'var(--text-muted)',marginTop:2 }}>by {ev.actor_name}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
