import { usePreferencesStore } from '../../store';
import AppearanceSwitch from '../../components/common/AppearanceSwitch';
import { Info } from 'lucide-react';

const DENSITY = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];
const DATE_FORMATS = [
  { value: 'dd-mmm-yyyy', label: '31-Mar-2026' },
  { value: 'dd/mm/yyyy', label: '31/03/2026' },
  { value: 'yyyy-mm-dd', label: '2026-03-31' },
];
const LANDINGS = [
  { value: '/', label: 'Dashboard' },
  { value: '/engagements', label: 'Engagements' },
  { value: '/search', label: 'Search' },
];

function formatIndian(n) {
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}
function sampleNumber(format) {
  const n = 12500000;
  return format === 'indian'
    ? `₹ ${formatIndian(n)}  ·  ₹ 1.25 Cr`
    : `₹ ${n.toLocaleString('en-US')}  ·  ₹ 12.5 M`;
}

export default function AccountPreferences() {
  const prefs = usePreferencesStore();

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Appearance & preferences</h1>
        <p>Personal display and workflow defaults. Saved automatically on this device.</p>
      </header>

      <div className="card">
        <div className="card-header"><div className="card-title">Appearance</div></div>
        <div className="card-body pref-rows">
          <div className="pref-row">
            <div className="pref-row-meta">
              <div className="pref-row-title">Theme</div>
              <div className="pref-row-sub">Light, dark, or follow your operating system.</div>
            </div>
            <AppearanceSwitch />
          </div>
          <div className="pref-row">
            <div className="pref-row-meta">
              <div className="pref-row-title">Density</div>
              <div className="pref-row-sub">Spacing for tables and lists.</div>
            </div>
            <div className="segmented">
              {DENSITY.map((d) => (
                <button key={d.value} className={prefs.density === d.value ? 'active' : ''}
                  onClick={() => prefs.setDensity(d.value)}>{d.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Formats</div></div>
        <div className="card-body form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="pr-date">Date format</label>
            <select id="pr-date" className="select" value={prefs.dateFormat}
              onChange={(e) => prefs.update({ dateFormat: e.target.value })}>
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pr-num">Number format</label>
            <select id="pr-num" className="select" value={prefs.numberFormat}
              onChange={(e) => prefs.update({ numberFormat: e.target.value })}>
              <option value="indian">Indian (lakh / crore)</option>
              <option value="international">International (million / billion)</option>
            </select>
            <div className="field-help">Preview: {sampleNumber(prefs.numberFormat)}</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pr-land">Default landing page</label>
            <select id="pr-land" className="select" value={prefs.defaultLanding}
              onChange={(e) => prefs.update({ defaultLanding: e.target.value })}>
              {LANDINGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <div className="field-help">Opens after you sign in.</div>
          </div>
        </div>
        <div className="card-foot">
          <span className="muted-note"><Info size={13} /> Theme and density apply instantly. Format choices apply as screens adopt them.</span>
        </div>
      </div>
    </div>
  );
}
