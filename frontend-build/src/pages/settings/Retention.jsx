import SettingsShell from '../../components/settings/SettingsShell';
import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Retention() {
  const [years, setYears] = useState('8');
  const [lockOnArchive, setLockOnArchive] = useState(true);

  return (
    <SettingsShell
      title="Retention & data handling"
      description="How long finalised audit files are kept and when they become read-only."
      note="Retention enforcement is applied by the archival service; values here are stored pending that backend."
    >
      <div className="card">
        <div className="card-header"><div className="card-title">Retention policy</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="ret-years">Retain finalised files for</label>
            <select id="ret-years" className="select" value={years} onChange={(e) => setYears(e.target.value)}>
              <option value="5">5 years</option>
              <option value="8">8 years (ICAI recommended)</option>
              <option value="10">10 years</option>
            </select>
            <div className="field-help">Measured from the date of the signed audit report.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Lock after archival</label>
            <button type="button" role="switch" aria-checked={lockOnArchive}
              className={`toggle ${lockOnArchive ? 'on' : ''}`} onClick={() => setLockOnArchive((v) => !v)}>
              <span className="toggle-knob" />
            </button>
            <div className="field-help">Archived engagements become read-only automatically.</div>
          </div>
        </div>
        <div className="card-foot">
          <button className="btn btn-primary btn-sm" onClick={() => toast.success('Retention policy saved (pending backend)')}>
            <Save size={14} /> Save policy
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
