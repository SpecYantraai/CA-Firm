import { useState } from 'react';
import { Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FirmProfile() {
  const [form, setForm] = useState({
    firm_name: 'Specentra & Associates',
    frn: '',
    contact_email: '',
    phone: '',
    address: '',
  });

  const save = (e) => {
    e.preventDefault();
    toast.success('Firm profile saved (pending firm-settings backend)');
  };

  return (
    <div className="settings-section">
      <header className="section-head">
        <h1>Firm profile</h1>
        <p>Your practice’s identity. Appears on reports, archives and client-facing documents.</p>
      </header>

      <form className="card" onSubmit={save}>
        <div className="card-header"><div className="card-title">Practice details</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="fp-name">Firm name</label>
            <input id="fp-name" className="input" value={form.firm_name}
              onChange={(e) => setForm({ ...form, firm_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="fp-frn">ICAI Firm Registration No. (FRN)</label>
            <input id="fp-frn" className="input" placeholder="e.g. 123456W"
              value={form.frn} onChange={(e) => setForm({ ...form, frn: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="fp-email">Contact email</label>
            <input id="fp-email" className="input" placeholder="office@firm.com"
              value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="fp-phone">Phone</label>
            <input id="fp-phone" className="input" placeholder="+91…"
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group form-group-wide">
            <label className="form-label" htmlFor="fp-addr">Registered address</label>
            <textarea id="fp-addr" className="textarea" rows={2} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Firm-level persistence arrives with the firm-settings backend.</span>
          <button className="btn btn-primary btn-sm" type="submit"><Save size={14} /> Save</button>
        </div>
      </form>

      <div className="card">
        <div className="card-header"><div className="card-title">Deployment</div></div>
        <div className="card-body deploy-grid">
          <div className="deploy-item"><span>Install type</span><strong>On-premise · single firm</strong></div>
          <div className="deploy-item"><span>Data residency</span><strong>Firm-controlled</strong></div>
          <div className="deploy-item"><span>Edition</span><strong>Specentra AMS</strong></div>
        </div>
      </div>
    </div>
  );
}
