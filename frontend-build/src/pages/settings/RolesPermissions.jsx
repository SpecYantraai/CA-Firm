import { ROLE_PERMISSIONS, roleDesignation } from '../../store';
import { Check, Info } from 'lucide-react';

const ROLES = ['Articled Assistant', 'Audit Executive', 'Audit Manager', 'EQCR Reviewer', 'Partner', 'Admin'];
const PERMISSION_LABELS = {
  canCreateEngagement: 'Create engagements',
  canViewAllEngagements: 'View all engagements',
  canUpload: 'Upload working papers',
  canSubmit: 'Submit for review',
  canRaiseNote: 'Raise review notes',
  canFinalise: 'Finalise working papers',
  canArchive: 'Archive / close engagement',
  canSoftDelete: 'Delete working papers',
  canManageUsers: 'Manage users',
};

export default function RolesPermissions() {
  const rows = Object.keys(PERMISSION_LABELS);
  return (
    <div className="settings-section">
      <header className="section-head">
        <h1>Roles & permissions</h1>
        <p>The firm’s role model and what each role can do. These rules are enforced across the product.</p>
      </header>

      <div className="card">
        <div className="card-header"><div className="card-title">Permission matrix</div></div>
        <div className="matrix-scroll">
          <table className="data-table matrix-table">
            <thead>
              <tr>
                <th className="matrix-perm">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="matrix-role">
                    <span className="matrix-role-name">{r}</span>
                    <span className="matrix-role-desig">{roleDesignation(r)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((perm) => (
                <tr key={perm}>
                  <td className="matrix-perm">{PERMISSION_LABELS[perm]}</td>
                  {ROLES.map((role) => {
                    const allowed = (ROLE_PERMISSIONS[perm] || []).includes(role);
                    return (
                      <td key={role} className="matrix-cell">
                        {allowed
                          ? <span className="matrix-yes" title="Allowed"><Check size={14} /></span>
                          : <span className="matrix-no" title="Not allowed">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Role definitions are fixed in this release. Custom roles arrive with the permissions backend.</span>
        </div>
      </div>
    </div>
  );
}
