import SettingsShell from '../../components/settings/SettingsShell';
import { HardDrive, FolderArchive } from 'lucide-react';

export default function StorageSettings() {
  // Illustrative figures until the storage service reports live usage.
  const usedPct = 38;
  return (
    <SettingsShell
      title="Storage"
      description="Where working papers and final archives live for this on-premise install."
      note="Usage below is illustrative. Live capacity reporting arrives with the storage service."
    >
      <div className="card">
        <div className="card-header"><div className="card-title"><HardDrive size={15} /> Local storage</div></div>
        <div className="card-body">
          <div className="storage-usage">
            <div className="storage-bar"><span style={{ width: `${usedPct}%` }} /></div>
            <div className="storage-legend">
              <span>{usedPct}% used</span>
              <span className="muted">190 GB of 500 GB</span>
            </div>
          </div>
          <div className="deploy-grid" style={{ marginTop: 16 }}>
            <div className="deploy-item"><span>Working papers path</span><strong>/srv/specentra/uploads</strong></div>
            <div className="deploy-item"><span>Final archives</span><strong>/srv/specentra/archives</strong></div>
            <div className="deploy-item"><span>Backups</span><strong>Nightly · firm-managed</strong></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title"><FolderArchive size={15} /> Final archive format</div></div>
        <div className="card-body">
          <div className="deploy-item"><span>Package</span><strong>ZIP with indexed folder tree</strong></div>
        </div>
      </div>
    </SettingsShell>
  );
}
