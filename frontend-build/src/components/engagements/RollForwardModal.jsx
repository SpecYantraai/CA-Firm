import { useState } from 'react';
import { engApi } from '../../api';
import { getErrorMessage } from '../../utils';
import { X, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RollForwardModal({ engagement, onClose, onCreated }) {
  const currentYear = engagement?.financial_year || '2025-26';
  const [form, setForm] = useState(() => {
    const parts = currentYear.split('-');
    const newYear = parts.length === 2
      ? `${parseInt(parts[0], 10) + 1}-${String(parseInt(parts[1], 10) + 1).padStart(2, '0')}`
      : '';
    return { new_financial_year: newYear, copy_prior_wps: false };
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await engApi.rollforward(engagement.engagement_id, form);
      toast.success(form.copy_prior_wps ? 'Roll-forward complete with prior templates.' : 'Roll-forward complete with folder structure.');
      onCreated(res.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-sm">
        <div className="modal-header">
          <span className="modal-title">Roll Forward Engagement</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:13, color:'var(--text-secondary)' }}>
              Creates a new engagement for <strong>{engagement?.client_name}</strong> from FY {currentYear}.
            </div>
            <div className="form-group">
              <label className="form-label">New Financial Year <span style={{ color:'var(--red)' }}>*</span></label>
              <input className="input" placeholder="e.g. 2026-27" value={form.new_financial_year}
                onChange={e => setForm({...form, new_financial_year:e.target.value})} required/>
            </div>
            <label className="check-control">
              <input type="checkbox" checked={form.copy_prior_wps}
                onChange={e => setForm({...form, copy_prior_wps:e.target.checked})}/>
              <span>
                <strong>Carry forward 1000/2000 working papers</strong>
                <small>Copies prior-year precondition and planning templates as draft WPs.</small>
              </span>
            </label>
            <div className="info-strip">
              Folder structure, engagement type, EQCR flag, small-entity flag, and user assignments will be carried forward.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.new_financial_year.trim()}>
              <RotateCcw size={14}/> {loading ? 'Creating...' : 'Roll Forward'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
