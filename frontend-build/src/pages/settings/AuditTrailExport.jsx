import SettingsShell from '../../components/settings/SettingsShell';
import { useState } from 'react';
import { DownloadCloud, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuditTrailExport() {
  const [range, setRange] = useState('90');
  const [format, setFormat] = useState('csv');

  return (
    <SettingsShell
      title="Audit trail export"
      description="Export the immutable record of who did what, and when, across the firm."
      note="A global export endpoint is pending. Per-engagement activity is already available on each engagement’s Activity tab."
    >
      <div className="card">
        <div className="card-header"><div className="card-title"><FileText size={15} /> Export</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="at-range">Date range</label>
            <select id="at-range" className="select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="at-format">Format</label>
            <select id="at-format" className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>
        <div className="card-foot">
          <button className="btn btn-primary btn-sm" onClick={() => toast('Audit export will be available with the reporting backend', { icon: 'ℹ️' })}>
            <DownloadCloud size={14} /> Export audit trail
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
