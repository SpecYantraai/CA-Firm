/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../../api';
import { useAuthStore } from '../../store';
import { getErrorMessage, formatDateTime } from '../../utils';
import {
  FileText, Check, Save, ExternalLink, Plug, Wifi, Loader, CircleCheck,
  CircleX, TriangleAlert, Info, History,
} from 'lucide-react';
import toast from 'react-hot-toast';

const GROUP_ORDER = ['Built-in', 'Free self-hosted', 'Paid', 'Other'];
const GROUP_OF = {
  'builtin': 'Built-in',
  'onlyoffice-community': 'Free self-hosted',
  'collabora-code': 'Free self-hosted',
  'onlyoffice-enterprise': 'Paid',
  'microsoft365': 'Paid',
  'none': 'Other',
};
const URL_FIELD = {
  'onlyoffice-community': 'onlyoffice_url',
  'onlyoffice-enterprise': 'onlyoffice_url',
  'collabora-code': 'collabora_url',
};

function cardStatus(provider, form) {
  if (provider.status === 'planned') return { label: 'Planned', tone: 'planned' };
  const urlField = URL_FIELD[provider.value];
  if (urlField && !form[urlField]) return { label: 'Requires setup', tone: 'warn' };
  return { label: 'Ready', tone: 'ok' };
}

export default function DocumentEditorSettings() {
  const user = useAuthStore((s) => s.user);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [health, setHealth] = useState(null); // { state, msg }
  const [lastChange, setLastChange] = useState(null); // { by, at }

  useEffect(() => {
    Promise.all([settingsApi.editor(), settingsApi.editorProviders()])
      .then(([settingsRes, providersRes]) => {
        setForm(settingsRes.data);
        setSaved(settingsRes.data);
        setProviders(providersRes.data.data || []);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const by = {};
    providers.forEach((p) => {
      const g = GROUP_OF[p.value] || 'Other';
      (by[g] = by[g] || []).push(p);
    });
    return by;
  }, [providers]);

  if (loading || !form) {
    return (
      <div className="settings-section">
        <header className="section-head"><h1>Document Editor</h1></header>
        <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)' }}>Loading providers…</div></div>
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const selected = providers.find((p) => p.value === form.provider);
  const savedProvider = providers.find((p) => p.value === saved.provider);
  const providerChanged = form.provider !== saved.provider;
  const urlField = URL_FIELD[form.provider];

  const pick = (p) => {
    if (p.status === 'planned') return;
    setForm({ ...form, provider: p.value });
    setHealth(null);
  };

  const persist = async () => {
    setSaving(true);
    try {
      const res = await settingsApi.updateEditor(form);
      setForm(res.data.data);
      setSaved(res.data.data);
      setLastChange({ by: user?.full_name || 'You', at: new Date().toISOString() });
      toast.success('Document editor settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const onSave = (e) => {
    e.preventDefault();
    if (providerChanged) setConfirmOpen(true);
    else persist();
  };

  const testConnection = async () => {
    const url = (form[urlField] || '').trim();
    if (!url) { setHealth({ state: 'fail', msg: 'Enter a server URL first' }); return; }
    setHealth({ state: 'checking' });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
      clearTimeout(timer);
      setHealth({ state: 'ok', msg: 'Server responded to the request.' });
    } catch {
      setHealth({ state: 'fail', msg: 'Could not reach the server from your browser.' });
    }
  };

  return (
    <div className="settings-section">
      <header className="section-head">
        <h1>Document Editor</h1>
        <p>
          Choose how Word and Excel working papers open across the firm.
          <strong> This affects every user and every working paper.</strong>
        </p>
      </header>

      <form onSubmit={onSave}>
        {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
          <div key={group} className="provider-group">
            <div className="provider-group-label">{group}</div>
            <div className="provider-cards">
              {grouped[group].map((p) => {
                const st = cardStatus(p, form);
                const isSel = form.provider === p.value;
                const disabled = p.status === 'planned';
                return (
                  <button
                    type="button"
                    key={p.value}
                    className={`provider-card ${isSel ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
                    onClick={() => pick(p)}
                    disabled={disabled}
                    aria-pressed={isSel}
                    aria-disabled={disabled}
                  >
                    <span className="provider-card-top">
                      <span className="provider-card-radio" aria-hidden="true">{isSel && <Check size={12} />}</span>
                      <span className={`status-badge status-${st.tone}`}>{st.label}</span>
                    </span>
                    <span className="provider-card-title"><FileText size={15} /> {p.label}</span>
                    <span className="provider-card-license">{p.license}</span>
                    <span className="provider-card-desc">{p.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Connection panel for infra-backed providers */}
        {urlField && (
          <div className="card connection-panel">
            <div className="card-header">
              <div className="card-title"><Plug size={15} /> Connection</div>
              {health && (
                <span className={`health-pill health-${health.state}`}>
                  {health.state === 'checking' && <Loader size={13} className="spin" />}
                  {health.state === 'ok' && <CircleCheck size={13} />}
                  {health.state === 'fail' && <CircleX size={13} />}
                  {health.state === 'checking' ? 'Checking…' : health.state === 'ok' ? 'Reachable' : 'Unreachable'}
                </span>
              )}
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label" htmlFor="editor-url">
                  {form.provider.startsWith('onlyoffice') ? 'ONLYOFFICE Document Server URL' : 'Collabora Online Server URL'}
                </label>
                <div className="connection-row">
                  <input
                    id="editor-url"
                    className="input"
                    placeholder={form.provider.startsWith('onlyoffice') ? 'https://office.yourfirm.com' : 'https://collabora.yourfirm.com'}
                    value={form[urlField] || ''}
                    onChange={(e) => { setForm({ ...form, [urlField]: e.target.value }); setHealth(null); }}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={testConnection}>
                    <Wifi size={14} /> Test connection
                  </button>
                </div>
                {health?.msg && <div className={`field-help ${health.state === 'fail' ? 'is-error' : ''}`}>{health.msg}</div>}
                <div className="field-help">
                  {form.provider.startsWith('onlyoffice')
                    ? 'Works with Community (free) and Enterprise editions. The backend exposes the editor callbacks.'
                    : 'Requires a reachable Collabora CODE server. The backend exposes WOPI endpoints for open/save.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {form.provider === 'microsoft365' && (
          <div className="info-strip" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TriangleAlert size={15} /> Microsoft 365 is planned. It needs tenant licensing and Graph/WOPI setup before it can be enabled.
          </div>
        )}

        {/* Summary + save */}
        <div className={`editor-summary-bar ${dirty ? 'is-dirty' : ''}`}>
          <div className="esb-state">
            <div className="esb-line"><span className="esb-k">Current</span><span className="esb-v">{savedProvider?.label || saved.provider}</span></div>
            <div className="esb-line">
              <span className="esb-k">Selected</span>
              <span className="esb-v">{selected?.label || form.provider}{dirty && <span className="esb-dirty">Unsaved</span>}</span>
            </div>
          </div>
          <div className="esb-actions">
            {selected && selected.value !== 'builtin' && selected.value !== 'none' && (
              <a className="btn btn-ghost btn-sm" href={providerDocsUrl(form.provider)} target="_blank" rel="noreferrer">
                Setup docs <ExternalLink size={13} />
              </a>
            )}
            <button className="btn btn-outline btn-sm" type="button" disabled={!dirty || saving}
              onClick={() => { setForm(saved); setHealth(null); }}>Discard</button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!dirty || saving}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        <div className="audit-note">
          {lastChange
            ? <><History size={13} /> Changed by {lastChange.by} on {formatDateTime(lastChange.at)}.</>
            : <><Info size={13} /> Changes are recorded in the firm audit trail.</>}
        </div>
      </form>

      {confirmOpen && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="ec-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div className="confirm-box">
            <div className="confirm-icon"><TriangleAlert size={22} /></div>
            <h2 id="ec-title">Change the firm document editor?</h2>
            <p>
              You’re switching from <strong>{savedProvider?.label}</strong> to <strong>{selected?.label}</strong>.
              This changes how all Word and Excel working papers open for every user.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={persist} disabled={saving}>
                {saving ? 'Saving…' : 'Yes, switch editor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function providerDocsUrl(provider) {
  if (provider === 'collabora-code') return 'https://sdk.collaboraonline.com/docs/installation/index.html';
  if (provider === 'microsoft365') return 'https://learn.microsoft.com/en-us/graph/';
  if (provider?.startsWith('onlyoffice')) return 'https://api.onlyoffice.com/docs/docs-api/get-started/overview/';
  return 'https://www.onlyoffice.com/docs';
}
