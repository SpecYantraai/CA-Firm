/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { wpApi } from '../../api';
import { useAuthStore } from '../../store';
import { formatDate, formatDateTime, formatBytes, getErrorMessage, downloadBlob } from '../../utils';
import {
  X, Download, Upload, MessageSquare, Clock,
  FileSignature, Send, AlertCircle, Check, FileText, PencilLine,
  Link2, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  'Draft': 'var(--text-muted)', 'Submitted': 'var(--blue)',
  'Under Review': 'var(--amber)', 'Review Notes Raised': 'var(--red)', 'Finalised': 'var(--green)'
};

export default function WPDetailPanel({ wp: initialWP, archived, onClose, onRefresh }) {
  const user = useAuthStore(s => s.user);
  const [wp, setWP] = useState(initialWP);
  const [tab, setTab] = useState('preview');
  const [notes, setNotes] = useState([]);
  const [versions, setVersions] = useState([]);
  const [links, setLinks] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [noteResponses, setNoteResponses] = useState({});
  const [linkTarget, setLinkTarget] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [editorInfo, setEditorInfo] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [metaForm, setMetaForm] = useState({
    wp_number: initialWP.wp_number || '',
    filename: initialWP.filename || '',
    prepared_by_initials: initialWP.prepared_by_initials || '',
    reviewer1_initials: initialWP.reviewer1_initials || '',
    reviewer2_initials: initialWP.reviewer2_initials || '',
  });
  const [loading, setLoading] = useState(false);

  const canRaiseNote = !archived && ['Audit Executive','Audit Manager','Partner','EQCR Reviewer'].includes(user?.role);
  const canFinalise = !archived && ['Partner','Audit Manager'].includes(user?.role);
  const canSubmit = !archived && ['Articled Assistant','Audit Executive'].includes(user?.role);
  const canUploadNew = !archived && !['EQCR Reviewer'].includes(user?.role);
  const canOverrideIndex = !archived && ['Audit Manager','Partner','Admin'].includes(user?.role);
  const canEditReviewerSignoff = !archived && ['Audit Manager','Partner','EQCR Reviewer','Admin'].includes(user?.role);

  useEffect(() => {
    setWP(initialWP);
    setMetaForm({
      wp_number: initialWP.wp_number || '',
      filename: initialWP.filename || '',
      prepared_by_initials: initialWP.prepared_by_initials || '',
      reviewer1_initials: initialWP.reviewer1_initials || '',
      reviewer2_initials: initialWP.reviewer2_initials || '',
    });
  }, [initialWP]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadNotes = async () => {
    try { const r = await wpApi.getNotes(wp.wp_id); setNotes(r.data.data || []); } catch { /* keep panel usable */ }
  };

  const loadVersions = async () => {
    try { const r = await wpApi.versions(wp.wp_id); setVersions(r.data.data || []); } catch { /* keep panel usable */ }
  };

  const loadLinks = async () => {
    try { const r = await wpApi.links(wp.wp_id); setLinks(r.data.data || []); } catch { /* keep panel usable */ }
  };

  const loadViewer = async () => {
    setViewerLoading(true);
    setPreviewError('');
    setEditorInfo(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    try {
      const editorRes = await wpApi.editorConfig(wp.wp_id);
      setEditorInfo(editorRes.data);
    } catch {
      setEditorInfo(null);
    }
    try {
      const r = await wpApi.preview(wp.wp_id);
      setPreviewUrl(URL.createObjectURL(r.data));
    } catch (err) {
      setPreviewError(getErrorMessage(err));
    } finally {
      setViewerLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'notes') loadNotes();
    if (tab === 'versions') loadVersions();
    if (tab === 'links') loadLinks();
    if (tab === 'preview') loadViewer();
  }, [tab, wp.wp_id]);

  const handleDownload = async () => {
    try {
      const r = await wpApi.download(wp.wp_id);
      downloadBlob(r.data, wp.filename);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleSubmit = async () => {
    try {
      await wpApi.submit(wp.wp_id);
      toast.success('Submitted for review');
      onRefresh();
      setWP({ ...wp, review_status: 'Submitted' });
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleFinalise = async () => {
    try {
      await wpApi.finalise(wp.wp_id);
      toast.success('Working paper finalised');
      onRefresh();
      setWP({ ...wp, review_status: 'Finalised', final_reviewer_name: user.full_name });
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleRaiseNote = async () => {
    if (!noteText.trim()) return;
    setLoading(true);
    try {
      await wpApi.raiseNote(wp.wp_id, noteText.trim());
      setNoteText('');
      toast.success('Review note raised');
      loadNotes();
      onRefresh();
      setWP({ ...wp, review_status: 'Review Notes Raised', open_notes_count: (wp.open_notes_count || 0) + 1 });
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleCloseNote = async (noteId) => {
    try {
      await wpApi.closeNote(noteId);
      toast.success('Note closed');
      loadNotes();
      onRefresh();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleRespondNote = async (noteId) => {
    const response = (noteResponses[noteId] || '').trim();
    if (!response) return;
    setLoading(true);
    try {
      await wpApi.respondNote(noteId, response);
      setNoteResponses({ ...noteResponses, [noteId]: '' });
      toast.success('Response submitted for re-review');
      loadNotes();
      onRefresh();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleCreateLink = async () => {
    if (!linkTarget.trim()) return;
    setLoading(true);
    try {
      await wpApi.createLink(wp.wp_id, linkTarget.trim());
      setLinkTarget('');
      toast.success('Working paper linked');
      loadLinks();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleDeleteLink = async (linkId) => {
    try {
      await wpApi.deleteLink(wp.wp_id, linkId);
      toast.success('Link removed');
      loadLinks();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleSignOff = async (signoffType) => {
    try {
      const res = await wpApi.signoff(wp.wp_id, {
        signoff_type: signoffType,
        signed_at: new Date().toISOString()
      });
      const signedInitials = res.data?.data?.initials;
      toast.success('Sign-off recorded');
      if (signoffType === 'Prepared By') setWP({ ...wp, prepared_by_initials: signedInitials });
      if (signoffType === 'Reviewer 1') setWP({ ...wp, reviewer1_initials: signedInitials });
      if (signoffType === 'Reviewer 2') setWP({ ...wp, reviewer2_initials: signedInitials });
      onRefresh();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleSaveMetadata = async () => {
    setLoading(true);
    try {
      const payload = {
        filename: metaForm.filename.trim(),
        prepared_by_initials: metaForm.prepared_by_initials.trim(),
      };
      if (canOverrideIndex) payload.wp_number = metaForm.wp_number.trim();
      if (canEditReviewerSignoff) {
        payload.reviewer1_initials = metaForm.reviewer1_initials.trim();
        payload.reviewer2_initials = metaForm.reviewer2_initials.trim();
      }
      const res = await wpApi.update(wp.wp_id, payload);
      setWP(res.data.data);
      toast.success('Working paper details updated');
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await wpApi.replace(wp.wp_id, fd);
      toast.success(`Version ${r.data.data.current_version} uploaded`);
      setWP(r.data.data);
      onRefresh();
    } catch (err) { toast.error(getErrorMessage(err)); }
    e.target.value = '';
  };

  const tabs = [
    { id: 'preview', label: 'Preview/Edit' },
    { id: 'info', label: 'Info' },
    { id: 'notes', label: `Notes${wp.open_notes_count > 0 ? ` (${wp.open_notes_count})` : ''}` },
    { id: 'links', label: 'Links' },
    { id: 'versions', label: 'Versions' },
  ];

  return (
    <div style={{ width:'45%', display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-card)', height:'100%' }}>
      {/* Panel header */}
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:'var(--bg-table-head)' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {wp.filename}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4 }}>
            <span className="wp-number" style={{ fontSize:10 }}>{wp.wp_number}</span>
            <span style={{ fontSize:11, color: STATUS_COLOR[wp.review_status] || 'var(--text-muted)', fontWeight:500 }}>
              {wp.review_status}
            </span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          <button className="btn btn-outline btn-sm" onClick={handleDownload} title="Download">
            <Download size={13}/> Download
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
      </div>

      {/* Action bar */}
      {!archived && (
        <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap', flexShrink:0 }}>
          {canSubmit && wp.review_status === 'Draft' && (
            <button className="btn btn-navy btn-sm" onClick={handleSubmit}>
              <Send size={13}/> Submit for Review
            </button>
          )}
          {canFinalise && ['Submitted','Under Review'].includes(wp.review_status) && (
            <button className="btn btn-primary btn-sm" onClick={handleFinalise}>
              <Check size={13}/> Finalise WP
            </button>
          )}
          {canUploadNew && (
            <label className="btn btn-outline btn-sm" style={{ cursor:'pointer' }}>
              <Upload size={13}/> Replace File
              <input type="file" style={{ display:'none' }} onChange={handleReplaceFile}
                accept=".xlsx,.xls,.docx,.doc,.pdf,.jpg,.jpeg,.png,.csv,.zip"/>
            </label>
          )}
          {!['EQCR Reviewer'].includes(user?.role) && !canEditReviewerSignoff && (
            <button className="btn btn-outline btn-sm" onClick={() => handleSignOff('Prepared By')}>
              <FileSignature size={13}/> Sign Off
            </button>
          )}
          {canEditReviewerSignoff && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => handleSignOff('Reviewer 1')}>
                <FileSignature size={13}/> Reviewer 1
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleSignOff('Reviewer 2')}>
                <FileSignature size={13}/> Reviewer 2
              </button>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ paddingLeft:18, flexShrink:0, borderBottom:'1px solid var(--border)' }}>
        <div className="tabs" style={{ borderBottom:'none' }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>
        {tab === 'preview' && (
          <DocumentWorkspace
            wp={wp}
            archived={archived}
            loading={viewerLoading}
            previewUrl={previewUrl}
            previewError={previewError}
            editorInfo={editorInfo}
            onDownload={handleDownload}
          />
        )}

        {tab === 'info' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Index</label>
                <input className="input font-mono" value={metaForm.wp_number}
                  disabled={!canOverrideIndex}
                  onChange={e => setMetaForm({...metaForm, wp_number:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Filename</label>
                <input className="input" value={metaForm.filename}
                  disabled={archived}
                  onChange={e => setMetaForm({...metaForm, filename:e.target.value})}/>
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Preparer</label>
                <input className="input" placeholder="APJ or Client" value={metaForm.prepared_by_initials}
                  disabled={archived}
                  onChange={e => setMetaForm({...metaForm, prepared_by_initials:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Reviewer 1</label>
                <input className="input" placeholder="Manager / Partner" value={metaForm.reviewer1_initials}
                  disabled={!canEditReviewerSignoff}
                  onChange={e => setMetaForm({...metaForm, reviewer1_initials:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Reviewer 2</label>
                <input className="input" placeholder="Partner / EQCR" value={metaForm.reviewer2_initials}
                  disabled={!canEditReviewerSignoff}
                  onChange={e => setMetaForm({...metaForm, reviewer2_initials:e.target.value})}/>
              </div>
            </div>
            {!archived && (
              <div>
                <button className="btn btn-primary btn-sm" onClick={handleSaveMetadata} disabled={loading || !metaForm.filename.trim()}>
                  <Check size={13}/> Save Details
                </button>
              </div>
            )}
            <div className="divider"/>
            <InfoRow label="Format" value={wp.file_format?.toUpperCase() || '—'} />
            <InfoRow label="Size" value={formatBytes(wp.file_size_bytes)} />
            <InfoRow label="Status" value={<span style={{ color: STATUS_COLOR[wp.review_status], fontWeight:600 }}>{wp.review_status}</span>} />
            <InfoRow label="Version" value={`v${wp.current_version}`} />
            <div className="divider"/>
            <InfoRow label="Prepared By" value={`${wp.prepared_by_initials || '—'}${wp.prepared_by_name ? ` · ${wp.prepared_by_name}` : ''}`} />
            <InfoRow label="Prepared Date" value={
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span>{formatDate(wp.prepared_at)}</span>
                {!archived && <span style={{ fontSize:10, color:'var(--text-muted)' }}>(manually editable per DEC-005)</span>}
              </div>
            } />
            <InfoRow label="Reviewer Signoffs" value={`${wp.reviewer1_initials || 'R1 —'} / ${wp.reviewer2_initials || 'R2 —'}`} />
            <InfoRow label="Final Reviewer" value={wp.final_reviewer_name || '—'} />
            <InfoRow label="Review Date" value={formatDate(wp.final_reviewed_at)} />
            <div className="divider"/>
            <InfoRow label="Uploaded" value={formatDateTime(wp.created_at)} />
            <InfoRow label="Last Updated" value={formatDateTime(wp.updated_at)} />
            {wp.open_notes_count > 0 && (
              <div style={{ background:'var(--red-bg)', border:'1px solid rgba(208,53,69,.2)', borderRadius:'var(--r-md)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center' }}>
                <AlertCircle size={14} style={{ color:'var(--red)', flexShrink:0 }}/>
                <span style={{ fontSize:12, color:'var(--red)', fontWeight:500 }}>{wp.open_notes_count} open review note{wp.open_notes_count > 1 ? 's' : ''} pending</span>
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div>
            {canRaiseNote && (
              <div style={{ marginBottom:16 }}>
                <textarea className="textarea" placeholder="Raise a review note…" value={noteText}
                  onChange={e => setNoteText(e.target.value)} style={{ minHeight:72, marginBottom:8 }}/>
                <button className="btn btn-danger btn-sm" onClick={handleRaiseNote} disabled={loading || !noteText.trim()}>
                  <MessageSquare size={13}/> Raise Note
                </button>
              </div>
            )}
            {notes.length === 0 ? (
              <div className="empty-state" style={{ padding:24 }}>
                <div className="empty-state-icon"><MessageSquare size={20}/></div>
                <div className="empty-state-title">No review notes</div>
              </div>
            ) : notes.map(note => (
              <div key={note.note_id} className={`note-item ${note.status.toLowerCase()}`}>
                <div className="note-header">
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontWeight:600, fontSize:12, color:'var(--text-primary)' }}>{note.raised_by_name}</span>
                    <span style={{ fontSize:10, color:'var(--text-muted)' }}>{note.raised_by_role}</span>
                    <span className={`badge ${note.status === 'Open' ? 'badge-red' : 'badge-green'}`} style={{ fontSize:10 }}>
                      {note.status}
                    </span>
                  </div>
                  {note.status === 'Open' && canRaiseNote && (
                    <button className="btn btn-xs btn-ghost" onClick={() => handleCloseNote(note.note_id)}>
                      <Check size={12}/> Close
                    </button>
                  )}
                </div>
                <p className="note-text">{note.note_text}</p>
                {note.response_text && (
                  <div className="note-response">
                    <div className="note-meta">Response by {note.responded_by_name || 'Preparer'} on {formatDateTime(note.responded_at)}</div>
                    <div className="note-text">{note.response_text}</div>
                  </div>
                )}
                {note.status === 'Open' && !archived && canUploadNew && (
                  <div style={{ marginTop:10 }}>
                    <textarea className="textarea" placeholder="Respond and submit for re-review..."
                      value={noteResponses[note.note_id] || ''}
                      onChange={e => setNoteResponses({ ...noteResponses, [note.note_id]: e.target.value })}
                      style={{ minHeight:60, marginBottom:8 }}/>
                    <button className="btn btn-outline btn-sm" onClick={() => handleRespondNote(note.note_id)}
                      disabled={loading || !(noteResponses[note.note_id] || '').trim()}>
                      <Send size={13}/> Submit Response
                    </button>
                  </div>
                )}
                <div className="note-meta" style={{ marginTop:6 }}>
                  {formatDateTime(note.raised_at)}
                  {note.closed_at && ` · Closed by ${note.closed_by_name} on ${formatDate(note.closed_at)}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'links' && (
          <div>
            {!archived && (
              <div className="link-create-row">
                <input className="input font-mono" placeholder="Target WP index, e.g. 4001.1.1"
                  value={linkTarget} onChange={e => setLinkTarget(e.target.value)}/>
                <button className="btn btn-primary btn-sm" onClick={handleCreateLink} disabled={loading || !linkTarget.trim()}>
                  <Link2 size={13}/> Link WP
                </button>
              </div>
            )}
            {links.length === 0 ? (
              <div className="empty-state" style={{ padding:24 }}>
                <div className="empty-state-icon"><Link2 size={20}/></div>
                <div className="empty-state-title">No linked WPs</div>
              </div>
            ) : links.map(link => (
              <div key={link.link_id} className="linked-wp-row">
                <div className="linked-wp-main">
                  <span className="wp-number">{link.target_wp_number}</span>
                  <span className="wp-name">{link.target_filename}</span>
                </div>
                {!archived && (
                  <button className="btn btn-icon-sm btn-ghost" title="Remove link" onClick={() => handleDeleteLink(link.link_id)}>
                    <Trash2 size={13}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'versions' && (
          <div>
            {versions.length === 0 ? (
              <div style={{ color:'var(--text-muted)', fontSize:12, textAlign:'center', padding:24 }}>No version history</div>
        ) : versions.map(ver => (
              <div key={ver.version_id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:32, height:32, borderRadius:'var(--r-sm)', background: ver.version_number === wp.current_version ? 'var(--brand-gold-pale)' : 'var(--bg-table-head)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color: ver.version_number === wp.current_version ? 'var(--brand-gold)' : 'var(--text-muted)' }}>
                    v{ver.version_number}
                  </span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ver.filename}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {ver.uploaded_by_name} · {formatDateTime(ver.uploaded_at)} · {formatBytes(ver.file_size_bytes)}
                  </div>
                  {ver.comment && <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>{ver.comment}</div>}
                </div>
                <button className="btn btn-icon-sm btn-ghost" title="Download version"
                  onClick={async () => {
                    try { const r = await wpApi.downloadVersion(wp.wp_id, ver.version_number); downloadBlob(r.data, ver.filename); }
                    catch (err) { toast.error(getErrorMessage(err)); }
                  }}>
                  <Download size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentWorkspace({ wp, archived, loading, previewUrl, previewError, editorInfo, onDownload }) {
  const ext = (wp.file_format || '').toLowerCase();
  const canNativePreview = ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
  const editorEnabled = editorInfo?.enabled && !archived;
  const editorMessage = editorInfo?.message || 'Browser editing is not configured for this file type.';

  return (
    <div className="document-workspace">
      <div className="document-toolbar">
        <div className="document-title">
          <FileText size={16}/>
          <div>
            <div className="document-name">{wp.filename}</div>
            <div className="document-meta">WP {wp.wp_number} | v{wp.current_version} | {ext ? ext.toUpperCase() : 'FILE'}</div>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onDownload}>
          <Download size={13}/> Download
        </button>
      </div>

      {loading && (
        <div className="document-empty">
          <Clock size={22}/>
          <div className="empty-state-title">Opening document</div>
        </div>
      )}

      {!loading && editorEnabled && (
        <OnlyOfficeEditor editorInfo={editorInfo} wp={wp} />
      )}

      {!loading && !editorEnabled && canNativePreview && previewUrl && (
        isImage ? (
          <div className="document-image-wrap">
            <img className="document-preview-image" src={previewUrl} alt={wp.filename}/>
          </div>
        ) : (
          <iframe className="document-preview-frame" src={previewUrl} title={wp.filename}/>
        )
      )}

      {!loading && !editorEnabled && (!canNativePreview || !previewUrl) && (
        <div className="document-empty">
          <PencilLine size={24}/>
          <div className="empty-state-title">Editing needs document server setup</div>
          <div className="empty-state-sub">
            {previewError && canNativePreview ? previewError : editorMessage}
          </div>
          <button className="btn btn-navy btn-sm" onClick={onDownload}>
            <Download size={13}/> Download File
          </button>
        </div>
      )}
    </div>
  );
}

function OnlyOfficeEditor({ editorInfo, wp }) {
  const [loadError, setLoadError] = useState('');
  const editorId = `onlyoffice-editor-${wp.wp_id}`;

  useEffect(() => {
    if (!editorInfo?.enabled) return undefined;

    let cancelled = false;
    let editor = null;
    const scriptSrc = `${editorInfo.editorUrl}/web-apps/apps/api/documents/api.js`;

    const loadScript = () => new Promise((resolve, reject) => {
      if (window.DocsAPI) {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[src="${scriptSrc}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

    loadScript()
      .then(() => {
        if (cancelled || !window.DocsAPI) return;
        editor = new window.DocsAPI.DocEditor(editorId, editorInfo.config);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load the document editor. Check DOCUMENT_EDITOR_URL and Document Server access.');
      });

    return () => {
      cancelled = true;
      try { editor?.destroyEditor?.(); } catch { /* editor cleanup is best-effort */ }
    };
  }, [editorId, editorInfo]);

  if (loadError) {
    return (
      <div className="document-empty">
        <AlertCircle size={24}/>
        <div className="empty-state-title">Editor unavailable</div>
        <div className="empty-state-sub">{loadError}</div>
      </div>
    );
  }

  return <div id={editorId} className="doc-editor-frame" />;
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
      <div style={{ width:130, flexShrink:0, fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', paddingTop:1 }}>{label}</div>
      <div style={{ flex:1, fontSize:13, color:'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
