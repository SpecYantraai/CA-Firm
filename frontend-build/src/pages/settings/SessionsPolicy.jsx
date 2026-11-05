import SettingsShell from '../../components/settings/SettingsShell';
import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SessionsPolicy() {
  const [idle, setIdle] = useState('30');
  const [absolute, setAbsolute] = useState('12');
  const [singleSession, setSingleSession] = useState(false);

  return (
    <SettingsShell
      title="Sessions policy"
      description="Firm-wide rules for how long sign-ins stay valid."
      note="Policy values are stored pending enforcement by the auth/session backend."
    >
      <div className="card">
        <div className="card-header"><div className="card-title">Timeouts</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="sp-idle">Idle timeout</label>
            <select id="sp-idle" className="select" value={idle} onChange={(e) => setIdle(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sp-abs">Maximum session length</label>
            <select id="sp-abs" className="select" value={absolute} onChange={(e) => setAbsolute(e.target.value)}>
              <option value="8">8 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Single active session per user</label>
            <button type="button" role="switch" aria-checked={singleSession}
              className={`toggle ${singleSession ? 'on' : ''}`} onClick={() => setSingleSession((v) => !v)}>
              <span className="toggle-knob" />
            </button>
          </div>
        </div>
        <div className="card-foot">
          <button className="btn btn-primary btn-sm" onClick={() => toast.success('Sessions policy saved (pending backend)')}>
            <Save size={14} /> Save policy
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
