import { useCallback, useEffect, useState } from 'react';
import { Bot, CircleAlert, RefreshCw, Upload } from 'lucide-react';
import { riskAgentApi } from '../../api';
import { getErrorMessage } from '../../utils';
import './risk-agent.css';

export default function RiskAgentSettings() {
  const [configuration, setConfiguration] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setConfiguration((await riskAgentApi.configuration()).data); }
    catch (error) { setError(getErrorMessage(error)); }
  }, []);
  useEffect(() => {
    let active = true;
    riskAgentApi.configuration().then(response => { if (active) setConfiguration(response.data); })
      .catch(error => { if (active) setError(getErrorMessage(error)); });
    return () => { active = false; };
  }, []);
  const upload = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(); data.append('file', file);
    try { setConfiguration({ available: true, ...(await riskAgentApi.uploadKnowledgeBase(data)).data }); setFile(null); }
    catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const kb = configuration?.knowledge_base;
  return <section className="ra-admin">
    <div className="ra-heading"><div className="ra-heading-title"><Bot size={20}/><h2>Risk Assessment Agent</h2></div><button className="btn btn-icon btn-ghost" title="Refresh agent configuration" aria-label="Refresh agent configuration" onClick={load}><RefreshCw size={15}/></button></div>
    {error && <div className="ra-alert ra-alert-error" role="alert">{error}</div>}
    {configuration?.available === false && <div className="ra-alert ra-alert-error"><CircleAlert size={16}/><span>{configuration.error}</span></div>}
    <div className="ra-admin-connection"><div><span>LLM provider</span><strong>{configuration?.provider || '-'}</strong></div><div><span>Model</span><strong>{configuration?.model || '-'}</strong></div><div><span>Connection</span><strong>{configuration?.key_configured ? 'API key configured' : 'API key not configured'}</strong></div><div><span>Knowledge base</span><strong>{kb?.loaded ? `${kb.total_rows.toLocaleString()} rows / ${kb.file_size_kb} KB` : 'Not loaded'}</strong></div></div>
    {kb?.loaded && <><details className="ra-source"><summary>Industries ({kb.industries.length})</summary><div className="ra-kb-list">{kb.industries.map(value => <span className="badge badge-purple" key={value}>{value}</span>)}</div></details><details className="ra-source"><summary>MCOTABDs ({kb.mcotabds.length}) / Entities ({kb.entities.length})</summary><div className="ra-kb-list">{kb.mcotabds.map(value => <span className="badge badge-navy" key={value}>{value}</span>)}</div></details></>}
    <form onSubmit={upload} className="ra-form"><div className="form-group"><label className="form-label" htmlFor="ra-kb-upload">Firm knowledge base (.xlsx)</label><input id="ra-kb-upload" className="input" type="file" accept=".xlsx" disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)}/></div><div className="ra-actions"><button className="btn btn-primary" disabled={!file || busy}><Upload size={14}/>{busy ? 'Saving...' : 'Save knowledge base'}</button></div></form>
  </section>;
}
