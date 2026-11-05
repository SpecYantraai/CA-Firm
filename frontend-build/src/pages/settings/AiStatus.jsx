/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, riskAgentApi } from '../../api';
import { getErrorMessage } from '../../utils';
import SettingsShell from '../../components/settings/SettingsShell';
import { Bot, CircleCheck, CircleX, ArrowRight, Activity } from 'lucide-react';

function StatusRow({ label, ok, value }) {
  return (
    <div className="ai-status-row">
      <span className="ai-status-label">{label}</span>
      <span className={`ai-status-val ${ok ? 'is-ok' : 'is-off'}`}>
        {ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
        {value}
      </span>
    </div>
  );
}

export default function AiStatus() {
  const navigate = useNavigate();
  const [model, setModel] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([settingsApi.agentModel(), riskAgentApi.configuration()])
      .then(([m, r]) => { setModel(m.data); setRuntime(r.data); })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  return (
    <SettingsShell
      title="Model & provider status"
      description="A read-only view of the AI model powering the Risk Assessment Agent."
    >
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Activity size={15} /> Current status</div>
          <button className="btn btn-primary btn-xs" onClick={() => navigate('/settings/ai-agents')}>
            <Bot size={13} /> Open Agent Configuration <ArrowRight size={13} />
          </button>
        </div>
        <div className="card-body">
          {error ? (
            <div className="field-help is-error">{error}</div>
          ) : !model || !runtime ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading status…</div>
          ) : (
            <div className="ai-status-grid">
              <StatusRow label="Agent enabled" ok={!!model.enabled} value={model.enabled ? 'Enabled' : 'Disabled'} />
              <StatusRow label="Provider" ok={!!runtime.available} value={runtime.configured_provider || model.provider || '—'} />
              <StatusRow label="Model" ok={!!(runtime.model || model.model)} value={runtime.model || model.model || '—'} />
              <StatusRow label="API key" ok={!!runtime.key_configured} value={runtime.key_configured ? 'Configured' : 'Not configured'} />
              <StatusRow label="Knowledge base" ok={!!runtime.knowledge_base?.loaded} value={runtime.knowledge_base?.loaded ? 'Loaded' : 'Not loaded'} />
            </div>
          )}
        </div>
      </div>
    </SettingsShell>
  );
}
