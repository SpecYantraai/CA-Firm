import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, Eye, EyeOff, LoaderCircle, RefreshCw, Save, Unplug } from 'lucide-react';
import { riskAgentApi, settingsApi } from '../api';
import { getErrorMessage } from '../utils';
import RiskAgentSettings from '../components/agents/RiskAgentSettings';
import '../components/agents/risk-agent.css';

const fields = data => ({ enabled: data.enabled, provider: data.provider, model: data.model, base_url: data.base_url, timeout_seconds: data.timeout_seconds, api_key: '', clear_api_key: false });
function initialForm(saved, runtime) {
  if (saved.saved) return fields(saved);
  return fields({ ...saved, enabled: true, provider: runtime.configured_provider || saved.provider, model: runtime.model || saved.model, base_url: runtime.base_url || saved.base_url, timeout_seconds: runtime.timeout_seconds || 60 });
}

export default function AgentConfigurationPage() {
  const [form, setForm] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connection, setConnection] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([settingsApi.agentModel(), riskAgentApi.configuration()]).then(([settings, status]) => {
      if (active) { setMetadata(settings.data); setRuntime(status.data); setForm(initialForm(settings.data, status.data)); }
    }).catch(error => { if (active) setError(getErrorMessage(error)); });
    return () => { active = false; };
  }, []);
  const reload = useCallback(async () => {
    setError(''); setSaved(false); setConnection(null); setBusy('reload');
    try {
      const [settings, status] = await Promise.all([settingsApi.agentModel(), riskAgentApi.configuration()]);
      setMetadata(settings.data); setRuntime(status.data); setForm(initialForm(settings.data, status.data));
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(''); }
  }, []);
  const update = (name, value) => { setForm(current => ({ ...current, [name]: value })); setSaved(false); setConnection(null); };
  const changeProvider = provider => {
    const defaults = metadata.providers[provider];
    setForm(current => ({ ...current, provider, model: defaults.model, base_url: defaults.base_url, api_key: '', clear_api_key: false }));
    setSaved(false); setConnection(null);
  };
  const payload = () => ({ ...form, api_key: form.api_key.trim() || null });
  const submit = async (event, operation) => {
    event.preventDefault(); setBusy(operation); setError(''); setConnection(null); setSaved(false);
    try {
      if (operation === 'save') {
        const response = await settingsApi.updateAgentModel(payload());
        setMetadata(response.data); setForm(fields(response.data)); setShowKey(false); setSaved(true);
        setRuntime((await riskAgentApi.configuration()).data);
      } else {
        setConnection((await settingsApi.testAgentModel(payload())).data);
      }
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(''); }
  };
  return <div className="agent-config-page">
    <header className="page-header"><div className="page-header-left"><h1 className="page-title">AI Agent Configuration</h1><p className="page-subtitle">Risk Assessment Agent</p></div><button className="btn btn-icon btn-ghost" type="button" aria-label="Reload configuration" title="Reload configuration" onClick={reload} disabled={Boolean(busy)}><RefreshCw size={17}/></button></header>
    <div className="page-body">
      {error && <div className="ra-alert ra-alert-error" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
      {!form ? <div className="ra-loading"><LoaderCircle size={20} className="spin"/>Loading configuration...</div> : <>
        <section className="agent-model-section">
          <div className="ra-heading"><div className="ra-heading-title"><Bot size={21}/><h2>Shared model connection</h2></div><span className={`badge ${runtime?.key_configured ? 'badge-green' : 'badge-amber'}`}>{runtime?.configuration_source === 'admin' ? 'Admin configuration' : 'Server configuration'}</span></div>
          <form className="ra-form" onSubmit={event => submit(event, 'save')}>
            <label className="agent-enable"><input type="checkbox" checked={form.enabled} disabled={Boolean(busy)} onChange={event => update('enabled', event.target.checked)}/><span>Use this configuration for agents</span></label>
            <div className="ra-fields">
              <div className="form-group"><label className="form-label" htmlFor="agent-provider">API provider</label><select className="select" id="agent-provider" value={form.provider} disabled={Boolean(busy)} onChange={event => changeProvider(event.target.value)}><option value="nvidia">NVIDIA Nemotron</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="openai-compatible">OpenAI-compatible API</option></select></div>
              <div className="form-group"><label className="form-label" htmlFor="agent-model">Model name / ID</label><input className="input" id="agent-model" required maxLength={255} value={form.model} disabled={Boolean(busy)} onChange={event => update('model', event.target.value)}/></div>
            </div>
            <div className="form-group"><label className="form-label" htmlFor="agent-endpoint">API base URL</label><input className="input" id="agent-endpoint" type="url" required maxLength={2000} placeholder="https://provider.example/v1" value={form.base_url} disabled={Boolean(busy)} onChange={event => update('base_url', event.target.value)}/></div>
            <div className="form-group"><label className="form-label" htmlFor="agent-api-key">API key</label><div className="agent-key-input"><input className="input" id="agent-api-key" type={showKey ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} maxLength={16000} disabled={Boolean(busy) || form.clear_api_key} value={form.api_key} placeholder={metadata.key_stored && form.provider === metadata.provider ? 'Leave blank to keep the saved key' : 'Enter API key, or leave blank to use the server key'} onChange={event => update('api_key', event.target.value)}/><button type="button" className="btn btn-icon btn-ghost" aria-label={showKey ? 'Hide API key' : 'Show API key'} title={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div><div className="agent-key-status"><span className="text-xs text-secondary">{metadata.key_stored && form.provider === metadata.provider ? 'Saved key is encrypted' : runtime?.key_configured ? 'Server key is available for the active provider' : 'No API key configured'}</span><label><input type="checkbox" checked={form.clear_api_key} disabled={Boolean(busy) || Boolean(form.api_key.trim())} onChange={event => update('clear_api_key', event.target.checked)}/>Remove API key</label></div></div>
            <div className="form-group agent-timeout"><label className="form-label" htmlFor="agent-timeout">Request timeout (seconds)</label><input className="input" id="agent-timeout" type="number" min="10" max="300" step="1" required value={form.timeout_seconds} disabled={Boolean(busy)} onChange={event => update('timeout_seconds', Number(event.target.value))}/></div>
            {saved && <div className="ra-alert ra-alert-success" role="status"><CheckCircle2 size={17}/><span>Configuration saved. New agent runs will use {form.enabled ? 'these settings' : 'the server configuration'}.</span></div>}
            {connection && <div className="ra-alert ra-alert-success" role="status"><CheckCircle2 size={17}/><span>{connection.model_listed === false ? 'Connection successful. The selected model was not listed by this endpoint.' : 'Connection successful.'}</span></div>}
            <div className="ra-actions"><button className="btn btn-outline" type="submit" onClick={event => { if (event.currentTarget.form.reportValidity()) submit(event, 'test'); else event.preventDefault(); }} disabled={Boolean(busy)}>{busy === 'test' ? <LoaderCircle size={15} className="spin"/> : <Unplug size={15}/>}Test connection</button><button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>}Save configuration</button></div>
          </form>
        </section>
        <RiskAgentSettings refreshKey={runtime} />
      </>}
    </div>
  </div>;
}
