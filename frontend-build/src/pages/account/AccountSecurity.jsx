import { useState } from 'react';
import { authApi } from '../../api';
import { getErrorMessage } from '../../utils';
import { Save, ShieldCheck, Monitor, Smartphone, Info } from 'lucide-react';
import toast from 'react-hot-toast';

// Synthetic session list — replaced by the real session service later.
const SAMPLE_SESSIONS = [
  { id: 'cur', device: 'This browser', meta: 'Windows · Chrome', current: true, Icon: Monitor },
  { id: 's2', device: 'Office desktop', meta: 'Windows · Edge · 2 days ago', current: false, Icon: Monitor },
  { id: 's3', device: 'iPhone', meta: 'Safari · 1 week ago', current: false, Icon: Smartphone },
];

export default function AccountSecurity() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [twoFa, setTwoFa] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (form.new_password !== form.confirm) { toast.error('New passwords do not match'); return; }
    setSaving(true);
    try {
      await authApi.changePassword(form.current_password, form.new_password);
      toast.success('Password changed');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Security</h1>
        <p>Protect your account and manage where you’re signed in.</p>
      </header>

      <form className="card" onSubmit={submit}>
        <div className="card-header"><div className="card-title">Change password</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="sec-cur">Current password</label>
            <input id="sec-cur" type="password" className="input" autoComplete="current-password"
              value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sec-new">New password</label>
            <input id="sec-new" type="password" className="input" autoComplete="new-password"
              value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required />
            <div className="field-help">At least 8 characters.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sec-confirm">Confirm new password</label>
            <input id="sec-confirm" type="password" className="input" autoComplete="new-password"
              value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><ShieldCheck size={13} /> Updates your real sign-in credential.</span>
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>

      <div className="card">
        <div className="card-header"><div className="card-title">Two-factor authentication</div></div>
        <div className="card-body pref-row">
          <div className="pref-row-meta">
            <div className="pref-row-title">Authenticator app (TOTP)</div>
            <div className="pref-row-sub">Require a one-time code at sign-in. Setup arrives with the auth backend.</div>
          </div>
          <button type="button" role="switch" aria-checked={twoFa} aria-label="Two-factor authentication"
            className={`toggle ${twoFa ? 'on' : ''}`} onClick={() => setTwoFa((v) => !v)} disabled>
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Active sessions</div>
          <button className="btn btn-outline btn-xs" type="button"
            onClick={() => toast.success('Other devices signed out (placeholder)')}>
            Sign out other devices
          </button>
        </div>
        <ul className="session-list">
          {SAMPLE_SESSIONS.map(({ id, device, meta, current, Icon }) => (
            <li key={id} className="session-item">
              <Icon size={17} />
              <div className="session-meta">
                <div className="session-device">{device} {current && <span className="pill pill-approved">This device</span>}</div>
                <div className="session-sub">{meta}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Sample sessions — live device management is pending backend support.</span>
        </div>
      </div>
    </div>
  );
}
