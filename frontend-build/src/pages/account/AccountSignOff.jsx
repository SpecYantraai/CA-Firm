import { useAuthStore, useProfileStore } from '../../store';
import { initials as toInitials } from '../../utils';
import { ShieldCheck, ShieldAlert, UploadCloud, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AccountSignOff() {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore();
  const dscRegistered = profile.dscStatus === 'registered';

  const toggleDsc = () => {
    profile.update({ dscStatus: dscRegistered ? 'not-registered' : 'registered' });
    toast.success(dscRegistered ? 'DSC marked as not registered' : 'DSC marked as registered (placeholder)');
  };

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Sign-off identity</h1>
        <p>How you appear when you prepare, review and sign working papers and e-signatures.</p>
      </header>

      <div className="card">
        <div className="card-header"><div className="card-title">Initials</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label">Firm initials</label>
            <input className="input" value={user?.initials || toInitials(user?.full_name)} readOnly disabled />
            <div className="field-help">Assigned by your administrator for the working-paper index.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="input" value={user?.full_name || ''} readOnly disabled />
            <div className="field-help">Shown on sign-off records and e-signatures.</div>
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Used on WP sign-offs and e-signatures.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Digital Signature Certificate (DSC)</div></div>
        <div className="card-body dsc-row">
          <div className={`dsc-status ${dscRegistered ? 'is-ok' : 'is-warn'}`}>
            {dscRegistered ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            <div>
              <div className="dsc-status-title">{dscRegistered ? 'DSC registered' : 'No DSC registered'}</div>
              <div className="dsc-status-sub">
                {dscRegistered
                  ? 'Your token can be used for qualified e-signatures.'
                  : 'Register a Class 3 DSC to apply qualified e-signatures.'}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={toggleDsc}>
            {dscRegistered ? 'Mark as not registered' : 'Register DSC'}
          </button>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> DSC integration is a placeholder pending the signing-service backend.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Signature image</div></div>
        <div className="card-body">
          <div className="upload-dropzone is-disabled" aria-disabled="true">
            <UploadCloud size={22} />
            <div className="upload-dropzone-title">Upload a signature image</div>
            <div className="upload-dropzone-sub">PNG with transparent background, up to 1 MB · coming soon</div>
          </div>
        </div>
      </div>
    </div>
  );
}
