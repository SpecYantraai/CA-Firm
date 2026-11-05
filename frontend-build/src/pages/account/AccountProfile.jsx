import { useState } from 'react';
import { useAuthStore, useProfileStore, roleDesignation } from '../../store';
import { initials as toInitials, formatDate } from '../../utils';
import { Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AccountProfile() {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore();
  const [form, setForm] = useState({
    designation: profile.designation || '',
    membershipNo: profile.membershipNo || '',
    phone: profile.phone || '',
  });

  const save = (e) => {
    e.preventDefault();
    profile.update(form);
    toast.success('Profile saved on this device');
  };

  const designation = form.designation || roleDesignation(user?.role);

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Profile</h1>
        <p>Your identity across the firm. Name, email and role are managed by your administrator.</p>
      </header>

      <div className="profile-hero card">
        <div className="profile-hero-avatar">{user?.initials || toInitials(user?.full_name)}</div>
        <div className="profile-hero-meta">
          <div className="profile-hero-name">{user?.full_name}</div>
          <div className="profile-hero-row">
            <span className="pill pill-reviewed">{user?.role}</span>
            <span className="profile-hero-designation">{designation}</span>
          </div>
          <div className="profile-hero-email">{user?.email}</div>
          {user?.created_at && <div className="profile-hero-since">Member since {formatDate(user.created_at)}</div>}
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="card-header"><div className="card-title">Personal details</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="input" value={user?.full_name || ''} readOnly disabled />
            <div className="field-help">Managed by your firm administrator.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="input" value={user?.email || ''} readOnly disabled />
            <div className="field-help">Used to sign in. Contact an Admin to change.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pf-designation">Designation</label>
            <input id="pf-designation" className="input" placeholder={roleDesignation(user?.role)}
              value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <div className="field-help">Shown on your practice card. Defaults to your role.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pf-mrn">ICAI membership no. (MRN)</label>
            <input id="pf-mrn" className="input" placeholder="e.g. 123456"
              value={form.membershipNo} onChange={(e) => setForm({ ...form, membershipNo: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" className="input" placeholder="+91…"
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Stored on this device until firm-profile sync is available.</span>
          <button className="btn btn-primary btn-sm" type="submit"><Save size={14} /> Save changes</button>
        </div>
      </form>
    </div>
  );
}
