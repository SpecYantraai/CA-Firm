/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import { useAuthStore } from '../store';
import { getErrorMessage } from '../utils';
import { Check, ExternalLink, Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import RiskAgentSettings from '../components/agents/RiskAgentSettings';

export default function SettingsPage() {
  const user = useAuthStore(s => s.user);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({
    provider: 'none',
    onlyoffice_url: '',
    collabora_url: '',
    microsoft365_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.role !== 'Admin') {
      setLoading(false);
      return;
    }
    Promise.all([settingsApi.editor(), settingsApi.editorProviders()])
      .then(([settingsRes, providersRes]) => {
        setForm(settingsRes.data);
        setProviders(providersRes.data.data || []);
      })
      .catch(err => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [user?.role]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await settingsApi.updateEditor(form);
      setForm(res.data.data);
      toast.success('Document editor settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'Admin') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-secondary)' }}>Access Denied</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>Only Admins can manage product settings</div>
      </div>
    );
  }

  const selected = providers.find(p => p.value === form.provider);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Admin Settings</h1>
          <p className="page-subtitle">Control document editing providers for Word, Excel, and PDF working papers.</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card animate-in" style={{ maxWidth:960 }}>
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Settings size={16}/> Document Editor
              </div>
              <div className="text-sm text-secondary">Choose a free open-source or paid editor provider for in-app file editing.</div>
            </div>
          </div>

          {loading ? (
            <div className="card-body" style={{ padding:24, color:'var(--text-muted)' }}>Loading settings...</div>
          ) : (
            <form onSubmit={save}>
              <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:18, padding:24 }}>
                <div className="provider-grid">
                  {providers.map(provider => (
                    <label key={provider.value} className={`provider-option ${form.provider === provider.value ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="provider"
                        value={provider.value}
                        checked={form.provider === provider.value}
                        onChange={e => setForm({...form, provider:e.target.value})}
                      />
                      <span className="provider-option-main">
                        <span className="provider-option-title">
                          {provider.label}
                          {form.provider === provider.value && <Check size={14}/>}
                        </span>
                        <span className="provider-option-meta">{provider.license} | {provider.status}</span>
                        <span className="provider-option-desc">{provider.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {form.provider?.startsWith('onlyoffice') && (
                  <div className="form-group">
                    <label className="form-label">ONLYOFFICE Document Server URL</label>
                    <input
                      className="input"
                      placeholder="https://office.yourfirm.com"
                      value={form.onlyoffice_url || ''}
                      onChange={e => setForm({...form, onlyoffice_url:e.target.value})}
                    />
                    <div className="field-help">Works with both Community and Enterprise editions. Community is the free self-hosted option.</div>
                  </div>
                )}

                {form.provider === 'collabora-code' && (
                  <div className="form-group">
                    <label className="form-label">Collabora Online Server URL</label>
                    <input
                      className="input"
                      placeholder="https://collabora.yourfirm.com"
                      value={form.collabora_url || ''}
                      onChange={e => setForm({...form, collabora_url:e.target.value})}
                    />
                    <div className="field-help">Requires a reachable Collabora CODE server. The backend exposes WOPI endpoints for open/save.</div>
                  </div>
                )}

                {form.provider === 'microsoft365' && (
                  <div className="info-strip">
                    Microsoft 365 is a paid option and needs tenant licensing plus Graph/WOPI setup before enabling live editing.
                  </div>
                )}

                {selected && (
                  <div className="editor-summary">
                    <strong>Selected provider:</strong> {selected.label}
                    <a href={providerDocsUrl(form.provider)} target="_blank" rel="noreferrer">
                      Setup docs <ExternalLink size={12}/>
                    </a>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  <Save size={14}/> {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
        <RiskAgentSettings />
      </div>
    </div>
  );
}

function providerDocsUrl(provider) {
  if (provider === 'collabora-code') return 'https://sdk.collaboraonline.com/docs/installation/index.html';
  if (provider === 'microsoft365') return 'https://learn.microsoft.com/en-us/graph/';
  if (provider?.startsWith('onlyoffice')) return 'https://api.onlyoffice.com/docs/docs-api/get-started/overview/';
  return 'https://www.onlyoffice.com/docs';
}
