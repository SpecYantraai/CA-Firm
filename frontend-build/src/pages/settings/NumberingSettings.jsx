import SettingsShell from '../../components/settings/SettingsShell';
import { Hash } from 'lucide-react';

const RULES = [
  { label: 'Section prefix', example: '3000' },
  { label: 'Working-paper number', example: '3000 / 3001 / 3002…' },
  { label: 'Sub-folder index', example: '3100, 3110…' },
  { label: 'File label', example: '{WP} — {Account} — FY{Year}' },
];

export default function NumberingSettings() {
  return (
    <SettingsShell
      title="File naming & numbering"
      description="The convention that keeps every working paper indexed and cross-referenced."
      note="The firm convention is fixed in this release. Custom schemes arrive with the templates backend."
    >
      <div className="card">
        <div className="card-header"><div className="card-title"><Hash size={15} /> Convention</div></div>
        <ul className="numbering-list">
          {RULES.map((r) => (
            <li key={r.label} className="numbering-row">
              <span className="numbering-label">{r.label}</span>
              <span className="numbering-example">{r.example}</span>
            </li>
          ))}
        </ul>
        <div className="card-body">
          <div className="numbering-preview">
            <span className="muted">Preview</span>
            <code>3200 — Trade receivables — FY2025-26.xlsx</code>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
