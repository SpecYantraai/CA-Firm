/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { userApi } from '../api';
import { useAuthStore } from '../store';
import { formatDate, initials, getErrorMessage } from '../utils';
import { Plus, X, UserX, Edit3, RotateCcw, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES = ['Articled Assistant','Audit Executive','Audit Manager','Partner','EQCR Reviewer','Admin'];

const ROLE_BADGE = {
  'Partner': 'badge-gold', 'Admin': 'badge-red', 'EQCR Reviewer': 'badge-purple',
  'Audit Manager': 'badge-blue', 'Audit Executive': 'badge-navy', 'Articled Assistant': 'badge-navy'
};

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name:'', initials:'', email:'', role:'Articled Assistant' });
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await userApi.create(form);
      const msg = res.data.message || '';
      const pw = msg.match(/Temporary password: (\S+)/)?.[1] || '';
      setTempPassword(pw);
      toast.success('User created');
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (tempPassword) {
    return (
      <div className="modal-overlay">
        <div className="modal modal-sm">
          <div className="modal-header">
            <span className="modal-title">User Created</span>
          </div>
          <div className="modal-body">
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div className="user-avatar" style={{ width:56, height:56, fontSize:20, margin:'0 auto 12px' }}>{initials(form.full_name)}</div>
              <div style={{ fontWeight:600, fontSize:15 }}>{form.full_name}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>{form.email}</div>
            </div>
            <div style={{ background:'var(--bg-table-head)', borderRadius:'var(--r-md)', padding:'14px 16px' }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Temporary Password (share securely)</div>
              <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'var(--brand-navy)', letterSpacing:'0.05em' }}>{tempPassword}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>User must change password on first login</div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <span className="modal-title">Create New User</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-group">
              <label className="form-label">Full Name <span style={{ color:'var(--red)' }}>*</span></label>
              <input className="input" placeholder="CA Full Name" value={form.full_name}
                onChange={e => setForm({...form, full_name:e.target.value})} required/>
            </div>
            <div className="form-group">
              <label className="form-label">Email Address <span style={{ color:'var(--red)' }}>*</span></label>
              <input className="input" type="email" placeholder="user@firm.com" value={form.email}
                onChange={e => setForm({...form, email:e.target.value})} required/>
            </div>
            <div className="form-group">
              <label className="form-label">Initials</label>
              <input className="input" placeholder={`Auto: ${initials(form.full_name)}`}
                value={form.initials} onChange={e => setForm({...form, initials:e.target.value.toUpperCase()})}/>
            </div>
            <div className="form-group">
              <label className="form-label">Role <span style={{ color:'var(--red)' }}>*</span></label>
              <select className="select" value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ background:'var(--bg-table-head)', borderRadius:'var(--r-md)', padding:'10px 14px', fontSize:12, color:'var(--text-secondary)' }}>
              A temporary password will be generated. Partners are auto-assigned to all engagements (FR-049).
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ targetUser, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: targetUser.full_name || '',
    initials: targetUser.initials || '',
    email: targetUser.email || '',
    role: targetUser.role || 'Articled Assistant',
    is_active: targetUser.is_active,
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await userApi.update(targetUser.user_id, form);
      toast.success('User updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <span className="modal-title">Edit User</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="input" value={form.full_name}
                onChange={e => setForm({...form, full_name:e.target.value})} required/>
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="input" type="email" value={form.email}
                onChange={e => setForm({...form, email:e.target.value})} required/>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Initials</label>
                <input className="input" value={form.initials}
                  onChange={e => setForm({...form, initials:e.target.value.toUpperCase()})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="select" value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <label className="check-control">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm({...form, is_active:e.target.checked})}/>
              <span>
                <strong>Active user</strong>
                <small>Turn this on to reactivate a deactivated user.</small>
              </span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const user = useAuthStore(s => s.user);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');

  const load = () => {
    setLoading(true);
    userApi.list().then(r => setUsers(r.data)).catch(() => toast.error('Failed to load users')).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === 'Admin') load();
    else setLoading(false);
  }, [user?.role]);

  if (user?.role !== 'Admin') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-secondary)' }}>Access Denied</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>Only Admins can manage users</div>
      </div>
    );
  }

  const deactivate = async (userId, name) => {
    if (!confirm(`Deactivate ${name}? Their WP attributions will be permanently preserved.`)) return;
    try {
      await userApi.deactivate(userId);
      toast.success(`${name} deactivated. All WP attributions preserved (FR-053).`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const reactivate = async (userId, name) => {
    try {
      await userApi.reactivate(userId);
      toast.success(`${name} reactivated`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const resetPassword = async (userId, name) => {
    if (!confirm(`Generate a temporary password for ${name}?`)) return;
    try {
      const res = await userApi.resetPassword(userId);
      const pw = (res.data.message || '').match(/Temporary password: (\S+)/)?.[1] || '';
      setTempPassword(pw);
      toast.success('Temporary password generated');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const active = users.filter(u => u.is_active);
  const inactive = users.filter(u => !u.is_active);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { load(); }}/>
      )}
      {editingUser && (
        <EditUserModal targetUser={editingUser} onClose={() => setEditingUser(null)} onSaved={load}/>
      )}
      {tempPassword && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">Temporary Password</span>
              <button className="btn btn-icon btn-ghost" onClick={() => setTempPassword('')}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div style={{ background:'var(--bg-table-head)', borderRadius:'var(--r-md)', padding:'14px 16px' }}>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Share securely with the user</div>
                <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'var(--brand-navy)', letterSpacing:'0.05em' }}>{tempPassword}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setTempPassword('')}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">{active.length} active · {inactive.length} deactivated · Bcrypt auth · 8hr sessions</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15}/> New User
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="card animate-in" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>Loading users…</div>
          ) : (
            <div className="table-wrap" style={{ flex:1, overflowY:'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Initials</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div className="user-avatar" style={{ background:'var(--bg-table-head)', border:'1px solid var(--border)', color:'var(--text-secondary)', width:30, height:30, fontSize:11 }}>
                            {u.initials || initials(u.full_name)}
                          </div>
                          <span style={{ fontWeight:600, fontSize:13 }}>{u.full_name}</span>
                        </div>
                      </td>
                      <td><span className="signoff-chip">{u.initials || initials(u.full_name)}</span></td>
                      <td className="text-sm text-secondary">{u.email}</td>
                      <td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-navy'}`} style={{ fontSize:10 }}>{u.role}</span></td>
                      <td>
                        {u.is_active
                          ? <span className="badge badge-green">Active</span>
                          : <span className="badge badge-navy">Deactivated</span>
                        }
                        {u.must_change_password && u.is_active && (
                          <span className="badge badge-amber" style={{ marginLeft:4, fontSize:10 }}>Pwd reset</span>
                        )}
                      </td>
                      <td className="text-sm text-muted">{formatDate(u.created_at)}</td>
                      <td className="text-sm text-muted">{u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
                      <td>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          <button className="btn btn-outline btn-xs" onClick={() => setEditingUser(u)}>
                            <Edit3 size={12}/> Edit
                          </button>
                          <button className="btn btn-outline btn-xs" onClick={() => resetPassword(u.user_id, u.full_name)}>
                            <KeyRound size={12}/> Reset
                          </button>
                          {u.is_active && u.user_id !== user?.user_id && (
                            <button className="btn btn-danger btn-xs" onClick={() => deactivate(u.user_id, u.full_name)}>
                              <UserX size={12}/> Deactivate
                            </button>
                          )}
                          {!u.is_active && (
                            <button className="btn btn-primary btn-xs" onClick={() => reactivate(u.user_id, u.full_name)}>
                              <RotateCcw size={12}/> Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ background:'var(--brand-gold-pale)', border:'1px solid rgba(201,147,42,.25)', borderRadius:'var(--r-md)', padding:'12px 16px', fontSize:12, color:'var(--text-secondary)' }}>
          <strong style={{ color:'var(--text-primary)' }}>Attribution Compliance</strong> — When a user is deactivated, all Prepared By and Final Reviewer records permanently display their name (FR-053, DEC-006). WP files are retained. No permanent deletion is permitted for any role.
        </div>
      </div>
    </div>
  );
}
