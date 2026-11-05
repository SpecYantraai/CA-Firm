import { Info } from 'lucide-react';

/** Consistent header + optional status note wrapper for settings sections. */
export default function SettingsShell({ title, description, note, children }) {
  return (
    <div className="settings-section">
      <header className="section-head">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {children}
      {note && <p className="muted-note settings-note"><Info size={13} /> {note}</p>}
    </div>
  );
}
