import SettingsShell from '../../components/settings/SettingsShell';
import { FileStack, Check } from 'lucide-react';

// Mirrors the audit-file section structure the product provisions per engagement.
const SECTIONS = [
  { code: '1000', name: 'Preconditions & acceptance', count: 6 },
  { code: '2000', name: 'Planning & risk assessment', count: 11 },
  { code: '3000', name: 'Execution — substantive & controls', count: 24 },
  { code: '4000', name: 'Completion & review', count: 9 },
  { code: '5000', name: 'Reporting & archival', count: 7 },
];

export default function EngagementTemplates() {
  return (
    <SettingsShell
      title="Engagement templates"
      description="The standard audit-file structure applied when a new engagement is created."
      note="Template editing arrives with the firm-templates backend. The structure below is applied today."
    >
      <div className="card">
        <div className="card-header"><div className="card-title"><FileStack size={15} /> Standard audit file</div></div>
        <ul className="template-list">
          {SECTIONS.map((s) => (
            <li key={s.code} className="template-row">
              <span className="template-code">{s.code}</span>
              <span className="template-name">{s.name}</span>
              <span className="template-count">{s.count} working-paper slots</span>
              <span className="pill pill-approved template-on"><Check size={12} /> Active</span>
            </li>
          ))}
        </ul>
      </div>
    </SettingsShell>
  );
}
