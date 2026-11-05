import SettingsShell from '../../components/settings/SettingsShell';
import { ArrowRight, Stamp } from 'lucide-react';

const STEPS = [
  { role: 'Preparer', note: 'Articled Assistant / Audit Executive prepares the working paper.' },
  { role: 'Reviewer 1', note: 'Audit Manager reviews and raises notes.' },
  { role: 'Reviewer 2 / Partner', note: 'Partner performs final review and finalises.' },
  { role: 'EQCR', note: 'Independent quality review where the engagement is EQCR-designated.' },
];

export default function SignOffRules() {
  return (
    <SettingsShell
      title="Sign-off rules"
      description="The review sequence every working paper follows before an engagement can close."
      note="The sign-off sequence is enforced by the workflow engine. Custom sequences arrive with the firm-rules backend."
    >
      <div className="card">
        <div className="card-header"><div className="card-title"><Stamp size={15} /> Review sequence</div></div>
        <div className="card-body signoff-flow">
          {STEPS.map((s, i) => (
            <div key={s.role} className="signoff-step-wrap">
              <div className="signoff-step">
                <div className="signoff-step-role">{s.role}</div>
                <div className="signoff-step-note">{s.note}</div>
              </div>
              {i < STEPS.length - 1 && <ArrowRight size={16} className="signoff-step-arrow" />}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Enforcement</div></div>
        <div className="card-body deploy-grid">
          <div className="deploy-item"><span>Sequential locking</span><strong>On — sections unlock in order</strong></div>
          <div className="deploy-item"><span>Partner override</span><strong>Allowed with audit log</strong></div>
          <div className="deploy-item"><span>Re-open finalised WP</span><strong>Manager / Partner only</strong></div>
        </div>
      </div>
    </SettingsShell>
  );
}
