import { usePreferencesStore } from '../../store';
import { Info } from 'lucide-react';

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}

const EVENTS = [
  { key: 'gateApprovals', title: 'Gate approvals', sub: 'When an engagement reaches a review gate that needs you.' },
  { key: 'clientReplies', title: 'Client request replies', sub: 'When a client responds to a PBC / information request.' },
  { key: 'deadlines', title: 'Deadlines', sub: 'Upcoming filing and engagement due dates.' },
];

export default function AccountNotifications() {
  const notify = usePreferencesStore((s) => s.notify);
  const setNotify = usePreferencesStore((s) => s.setNotify);

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Notifications</h1>
        <p>Choose what you’re told about and where. Saved on this device.</p>
      </header>

      <div className="card">
        <div className="card-header"><div className="card-title">Events</div></div>
        <div className="card-body pref-rows">
          {EVENTS.map(({ key, title, sub }) => (
            <div key={key} className="pref-row">
              <div className="pref-row-meta">
                <div className="pref-row-title">{title}</div>
                <div className="pref-row-sub">{sub}</div>
              </div>
              <Toggle label={title} checked={!!notify[key]} onChange={(v) => setNotify({ [key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Channels</div></div>
        <div className="card-body pref-rows">
          <div className="pref-row">
            <div className="pref-row-meta">
              <div className="pref-row-title">In-app</div>
              <div className="pref-row-sub">Show in the notifications tray.</div>
            </div>
            <Toggle label="In-app notifications" checked={!!notify.channelInApp} onChange={(v) => setNotify({ channelInApp: v })} />
          </div>
          <div className="pref-row">
            <div className="pref-row-meta">
              <div className="pref-row-title">Email</div>
              <div className="pref-row-sub">Send a copy to {''}your firm email.</div>
            </div>
            <Toggle label="Email notifications" checked={!!notify.channelEmail} onChange={(v) => setNotify({ channelEmail: v })} />
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Preferences are stored now; delivery is wired with the notifications service.</span>
        </div>
      </div>
    </div>
  );
}
