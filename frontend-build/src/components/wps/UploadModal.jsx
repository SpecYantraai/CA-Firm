import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { wpApi } from '../../api';
import { useAuthStore } from '../../store';
import { formatBytes, getErrorMessage, initials } from '../../utils';
import { Upload, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_MB = 100;

export default function UploadModal({ engagementId, folderId, onClose, onUploaded }) {
  const user = useAuthStore(s => s.user);
  const [file, setFile] = useState(null);
  const [wpNumberOverride, setWpNumberOverride] = useState('');
  const [preparedInitials, setPreparedInitials] = useState(user?.initials || initials(user?.full_name));
  const [reviewer1Initials, setReviewer1Initials] = useState('');
  const [reviewer2Initials, setReviewer2Initials] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const canOverrideIndex = ['Audit Manager','Partner','Admin'].includes(user?.role);

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'text/csv': ['.csv'],
      'application/zip': ['.zip'],
    },
    maxSize: MAX_MB * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder_id', folderId);
      if (canOverrideIndex && wpNumberOverride.trim()) fd.append('wp_number', wpNumberOverride.trim());
      if (preparedInitials.trim()) fd.append('prepared_by_initials', preparedInitials.trim());
      if (reviewer1Initials.trim()) fd.append('reviewer1_initials', reviewer1Initials.trim());
      if (reviewer2Initials.trim()) fd.append('reviewer2_initials', reviewer2Initials.trim());
      setProgress(40);
      const res = await wpApi.upload(engagementId, fd);
      setProgress(100);
      const wpNum = res.data?.data?.wp_number;
      onUploaded(res.data?.data);
      toast.success(`Uploaded as WP ${wpNum}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <span className="modal-title">Upload Working Paper</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={uploading}><X size={16}/></button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Drop zone */}
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps()}/>
            {file ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center' }}>
                <FileText size={24} style={{ color:'var(--brand-gold)' }}/>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{file.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{formatBytes(file.size)}</div>
                </div>
                <button className="btn btn-icon-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  <X size={13}/>
                </button>
              </div>
            ) : (
              <div>
                <Upload size={28} style={{ color:'var(--text-muted)', margin:'0 auto 10px', display:'block' }}/>
                <div style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)' }}>
                  {isDragActive ? 'Drop file here' : 'Drag & drop or click to browse'}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                  xlsx, xls, docx, doc, pdf, jpg, png, csv, zip · Max {MAX_MB}MB
                </div>
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Index</label>
              <input className="input" placeholder="Auto e.g. 2021.01"
                value={wpNumberOverride} disabled={!canOverrideIndex}
                onChange={e => setWpNumberOverride(e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Preparer Signoff</label>
              <input className="input" placeholder="APJ or Client"
                value={preparedInitials} onChange={e => setPreparedInitials(e.target.value)}/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Reviewer 1 Signoff</label>
              <input className="input" placeholder="Manager / Partner"
                value={reviewer1Initials} onChange={e => setReviewer1Initials(e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Reviewer 2 Signoff</label>
              <input className="input" placeholder="Partner / EQCR"
                value={reviewer2Initials} onChange={e => setReviewer2Initials(e.target.value)}/>
            </div>
          </div>

          <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5 }}>
            Index is auto-assigned from the folder hierarchy when blank. Manual index override is available to Audit Manager, Partner and Admin users.
          </div>

          {uploading && (
            <div>
              <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${progress}%`, background:'var(--brand-gold)', transition:'width .3s', borderRadius:2 }}/>
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Uploading…</div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}>
            <Upload size={14}/> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
