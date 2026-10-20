import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, CircleAlert, Download, FileSpreadsheet, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { riskAgentApi } from '../../api';
import { useAuthStore } from '../../store';
import { downloadBlob, formatBytes, getErrorMessage } from '../../utils';
import './risk-agent.css';

const STEPS = ['Engagement', 'Financials', 'Materiality', 'Thresholds', 'MCOTABD', 'Risk Engine', 'Gate Review'];
const BENCHMARKS = ['System suggestion (lowest of three)', 'Turnover', 'Total Assets', 'Profit Before Tax', 'Custom figure'];
const money = value => value == null ? '-' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

function Metric({ label, value }) {
  return <div className="ra-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children, id }) {
  return <div className="form-group"><label className="form-label" htmlFor={id}>{label}</label>{children}</div>;
}

function usePreview(id, operation, payload, enabled = true) {
  const key = JSON.stringify(payload);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => {
      riskAgentApi.save(id, operation, JSON.parse(key)).then(response => {
        if (active) { setResult(response.data); setError(''); }
      }).catch(error => { if (active) setError(getErrorMessage(error)); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [id, operation, key, enabled]);
  return { result, error };
}

export default function RiskAssessmentPanel({ engagement, archived, onPublished }) {
  const id = engagement.engagement_id;
  const user = useAuthStore(s => s.user);
  const [snapshot, setSnapshot] = useState(null);
  const [configuration, setConfiguration] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [step]);
  const apply = useCallback(data => { setSnapshot(data); setStep(data.state.step); }, []);
  const reload = useCallback(async () => {
    try {
      const [assessment, config] = await Promise.all([riskAgentApi.get(id), riskAgentApi.configuration()]);
      apply(assessment.data); setConfiguration(config.data); setError('');
    } catch (error) { setError(getErrorMessage(error)); }
  }, [id, apply]);
  useEffect(() => {
    let active = true;
    Promise.all([riskAgentApi.get(id), riskAgentApi.configuration()]).then(([assessment, config]) => {
      if (active) { apply(assessment.data); setConfiguration(config.data); setError(''); }
    }).catch(error => { if (active) setError(getErrorMessage(error)); });
    return () => { active = false; };
  }, [id, apply]);
  const stage = snapshot?.state.stage;
  useEffect(() => {
    if (stage !== 'running') return;
    let active = true;
    const timer = setInterval(() => {
      riskAgentApi.get(id).then(response => { if (active) setSnapshot(response.data); })
        .catch(error => { if (active) setError(getErrorMessage(error)); });
    }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [id, stage]);
  const save = async (operation, payload = {}) => {
    setBusy(true); setError('');
    try {
      const response = await riskAgentApi.save(id, operation, { ...payload, revision: snapshot.revision });
      apply(response.data);
      if (operation === 'approve') onPublished?.();
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const upload = async files => {
    setBusy(true); setError('');
    const data = new FormData();
    data.append('revision', snapshot.revision);
    files.forEach(file => data.append('files', file));
    try { apply((await riskAgentApi.upload(id, data)).data); }
    catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const download = async () => {
    try { downloadBlob((await riskAgentApi.export(id)).data, `RCM-${engagement.client_name}-${engagement.financial_year}.json`); }
    catch (error) { setError(getErrorMessage(error)); }
  };
  const state = snapshot?.state;
  const readOnly = archived || user?.role === 'EQCR Reviewer';
  const disabled = readOnly || busy || stage === 'running' || stage === 'approved';
  const maxStep = Math.max(state?.step || 1, stage === 'complete' || stage === 'approved' ? 7 : 1);
  const kb = configuration?.knowledge_base;

  return (
    <div className="ra-page" ref={scrollRef}>
      <header className="ra-heading">
        <div className="ra-heading-title"><Bot size={23}/><div><h2>Risk Assessment Agent</h2><span>{engagement.client_name} / FY {engagement.financial_year}</span></div></div>
        <div className="ra-toolbar">
          {stage && <span className={`badge ${stage === 'approved' ? 'badge-green' : stage === 'failed' ? 'badge-red' : 'badge-purple'}`}>{stage === 'complete' ? 'Ready for review' : stage}</span>}
          <button className="btn btn-icon btn-ghost" title="Reload assessment" aria-label="Reload assessment" disabled={busy} onClick={reload}><RefreshCw size={16}/></button>
          {state && !readOnly && stage !== 'running' && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => { if (confirm('Start a new assessment? Approved working papers and previous uploads will be retained.')) save('reset'); }}><Plus size={14}/>New assessment</button>}
        </div>
      </header>
      {error && <div className="ra-alert ra-alert-error" role="alert"><CircleAlert size={17}/><span>{error}</span><button className="btn btn-ghost btn-xs" onClick={reload}>Reload</button></div>}
      {configuration?.available === false && <div className="ra-alert ra-alert-error" role="alert"><CircleAlert size={17}/><span>Agent unavailable: {configuration.error}</span></div>}
      {configuration?.available && (!kb?.loaded || !configuration.key_configured) && <div className="ra-alert"><CircleAlert size={17}/><span>{!kb?.loaded ? 'The firm knowledge base is not loaded.' : 'The LLM connection is not configured.'} Contact your firm administrator before running the risk engine.</span></div>}
      {archived && <div className="ra-alert"><ShieldCheck size={17}/><span>This engagement is locked. The saved assessment is read-only.</span></div>}
      {!snapshot ? <div className="ra-loading"><LoaderCircle size={20} className="spin"/>{error ? 'Assessment could not be loaded.' : 'Loading assessment...'}</div> : <>
        <nav className="ra-steps" aria-label="Risk assessment steps">
          {STEPS.map((label, index) => <button key={label} type="button" aria-current={step === index + 1 ? 'step' : undefined} className={step === index + 1 ? 'active' : ''} disabled={index + 1 > maxStep || busy || stage === 'running'} onClick={() => setStep(index + 1)}>
            <span>{index + 1 < state.step ? <Check size={13}/> : index + 1}</span>{label}
          </button>)}
        </nav>
        <div className="ra-step-heading"><span>Step {step} of 7</span><h3>{STEPS[step - 1]}</h3></div>
        <div key={`${id}-${snapshot.revision}-${step}`} className="ra-step-content">
          {step === 1 && <DetailsStep engagement={engagement} context={state.context} configuration={configuration} disabled={disabled} onSave={payload => save('details', payload)}/>}
          {step === 2 && <FinancialsStep state={state} disabled={disabled} busy={busy} onUpload={upload} onContinue={() => setStep(3)}/>}
          {step === 3 && <MaterialityStep id={id} state={state} disabled={disabled} onSave={payload => save('materiality', payload)}/>}
          {step === 4 && <ThresholdStep id={id} state={state} revision={snapshot.revision} disabled={disabled} onSave={payload => save('thresholds', payload)}/>}
          {step === 5 && <ScopeStep id={id} state={state} revision={snapshot.revision} disabled={disabled} onSave={payload => save('scope', payload)}/>}
          {step === 6 && <EngineStep state={state} disabled={disabled} configuration={configuration} onRun={() => save('run')} onReview={() => setStep(7)}/>}
          {step === 7 && <GateStep state={state} disabled={disabled} canApprove={['Partner', 'Audit Manager', 'Admin'].includes(user?.role)} onSave={rows => save('review', { rows })} onApprove={rows => save('approve', { rows })} onRun={() => save('run')} onDownload={download}/>}
        </div>
        <footer className="ra-bottom-bar"><button className="btn btn-ghost" disabled={step === 1 || busy || stage === 'running'} onClick={() => setStep(step - 1)}><ArrowLeft size={14}/>Back</button><span>{busy ? 'Saving...' : stage === 'running' ? 'Risk engine running' : `Saved revision ${snapshot.revision}`}</span></footer>
      </>}
    </div>
  );
}

function DetailsStep({ engagement, context, configuration, disabled, onSave }) {
  const [form, setForm] = useState({ legal_status: context.legal_status || 'Private Limited Company', client_type: context.client_type || 'New client', industry: context.industry || '', products: context.products || '', auditor_risk_notes: context.auditor_risk_notes || '' });
  const update = (key, value) => setForm({ ...form, [key]: value });
  const { result: industryMatch } = usePreview(engagement.engagement_id, 'preview-industry', { industry: form.industry }, Boolean(form.industry.trim() && configuration?.knowledge_base?.loaded));
  return <form className="ra-form" onSubmit={event => { event.preventDefault(); onSave(form); }}>
    <div className="ra-fields">
      <Field label="Client" id="ra-client"><input className="input" id="ra-client" value={engagement.client_name} readOnly/></Field>
      <Field label="Financial year" id="ra-year"><input className="input" id="ra-year" value={engagement.financial_year} readOnly/></Field>
      <Field label="Legal status" id="ra-legal"><select className="select" id="ra-legal" disabled={disabled} value={form.legal_status} onChange={event => update('legal_status', event.target.value)}>{['Private Limited Company', 'Public Limited Company', 'LLP', 'Partnership Firm', 'Proprietorship', 'Other'].map(value => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Client type" id="ra-client-type"><select className="select" id="ra-client-type" disabled={disabled} value={form.client_type} onChange={event => update('client_type', event.target.value)}><option>New client</option><option>Repeat client</option></select></Field>
    </div>
    <Field label="Industry" id="ra-industry"><input className="input" id="ra-industry" list="ra-industries" required maxLength={255} disabled={disabled} value={form.industry} onChange={event => update('industry', event.target.value)}/><datalist id="ra-industries">{configuration?.knowledge_base?.industries?.map(value => <option key={value} value={value}/>)}</datalist></Field>
    {industryMatch && form.industry.trim() && <div className={`ra-alert ${industryMatch.matched_industry ? 'ra-alert-success' : ''}`}>{industryMatch.matched_industry ? `${industryMatch.exact_match ? 'Knowledge base match' : 'Partial knowledge base match'}: ${industryMatch.matched_industry}` : 'No industry match in the knowledge base. Risks will be LLM-generated and labelled as such.'}</div>}
    <Field label="Products / Services" id="ra-products"><textarea className="textarea" id="ra-products" disabled={disabled} value={form.products} onChange={event => update('products', event.target.value)}/></Field>
    <Field label="Auditor's risk considerations" id="ra-notes"><textarea className="textarea" id="ra-notes" rows={4} disabled={disabled} value={form.auditor_risk_notes} onChange={event => update('auditor_risk_notes', event.target.value)}/></Field>
    <div className="ra-actions"><button className="btn btn-primary" disabled={disabled || !form.industry.trim()}>Save &amp; continue<ArrowRight size={14}/></button></div>
  </form>;
}

function FinancialsStep({ state, disabled, busy, onUpload, onContinue }) {
  const [files, setFiles] = useState([]);
  return <div className="ra-form">
    <label className={`ra-file-upload ${disabled ? 'disabled' : ''}`}><FileSpreadsheet size={30}/><strong>Financial statements</strong><span>Excel or Word</span><input type="file" multiple accept=".xlsx,.xls,.docx,.doc" disabled={disabled} aria-label="Upload financial statements" onChange={event => setFiles(Array.from(event.target.files || []))}/></label>
    <div className="ra-file-list">{(files.length ? files.map(file => ({ name: file.name, size: file.size })) : state.documents).map((file, index) => <div key={`${file.name}-${index}`}><FileSpreadsheet size={16}/><span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>
    {!!state.context.documents_failed?.length && <div className="ra-alert">{state.context.documents_failed.map(file => `${file.filename}: ${file.reason}`).join('; ')}</div>}
    <div className="ra-actions">{files.length > 0 && <button className="btn btn-primary" disabled={disabled} onClick={() => onUpload(files)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Upload size={15}/>}Read financial statements</button>}{state.documents.length > 0 && !files.length && <button className="btn btn-primary" onClick={onContinue}>Continue<ArrowRight size={14}/></button>}</div>
  </div>;
}

function MaterialityStep({ id, state, disabled, onSave }) {
  const [form, setForm] = useState({ turnover: state.financials.turnover || 0, total_assets: state.financials.total_assets || 0, pbt: state.financials.pbt || 0, benchmark: 'System suggestion (lowest of three)', percentage: null, custom_figure: null, final_figure: null, justification: '', ...state.materiality_inputs });
  const update = (key, value) => setForm({ ...form, [key]: value });
  const { result, error } = usePreview(id, 'preview-materiality', form);
  const chooseBenchmark = benchmark => setForm({ ...form, benchmark, percentage: benchmark === 'Turnover' ? 0.5 : benchmark === 'Total Assets' ? 1 : benchmark === 'Profit Before Tax' ? 5 : null, final_figure: null });
  const items = state.parsed_fs ? [...state.parsed_fs.bs_items, ...state.parsed_fs.pl_items] : [];
  return <form className="ra-form" onSubmit={event => { event.preventDefault(); onSave(form); }}>
    <div className={`ra-alert ${state.financials.source === 'structured_parser' ? 'ra-alert-success' : ''}`}><FileSpreadsheet size={17}/><span>{state.financials.source === 'structured_parser' ? 'Structured Excel figures. Source workbook amounts are treated as lakhs; financial inputs below are in INR.' : 'Text-extracted figures. Verify the financial inputs before confirming.'}</span></div>
    <div className="ra-fields ra-fields-three">{[['turnover', 'Turnover (INR)'], ['total_assets', 'Total assets (INR)'], ['pbt', 'Profit before tax (INR)']].map(([key, label]) => <Field key={key} label={label} id={`ra-${key}`}><input className="input" id={`ra-${key}`} type="number" step="any" min={key === 'pbt' ? undefined : 0} disabled={disabled} value={form[key]} onChange={event => update(key, Number(event.target.value))}/></Field>)}</div>
    {items.length > 0 && <details className="ra-source"><summary>Source line items ({items.length})</summary><div className="table-wrap"><table><thead><tr><th>Account</th><th>Source</th><th>Cell</th><th>Note</th><th>Source value</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td>{item.label}</td><td>{item.sheet_name}</td><td>D{item.row_num}</td><td>{item.note_ref || '-'}</td><td>{item.raw_value?.toLocaleString('en-IN')}</td></tr>)}</tbody></table></div></details>}
    <div className="ra-metrics ra-metrics-three"><Metric label="0.5% of Turnover" value={money(result?.preview.turnover_figure)}/><Metric label="1% of Total Assets" value={money(result?.preview.assets_figure)}/><Metric label="5% of PBT" value={form.pbt > 0 ? money(result?.preview.pbt_figure) : 'N/A (loss)'}/></div>
    <div className="ra-fields"><Field label="Materiality benchmark" id="ra-benchmark"><select className="select" id="ra-benchmark" disabled={disabled} value={form.benchmark} onChange={event => chooseBenchmark(event.target.value)}>{BENCHMARKS.map(value => <option key={value}>{value}</option>)}</select></Field>
      {form.percentage !== null && <Field label={`Benchmark percentage (${form.percentage}%)`} id="ra-percentage"><input id="ra-percentage" type="range" min={form.benchmark === 'Profit Before Tax' ? 0.5 : 0.1} max={form.benchmark === 'Profit Before Tax' ? 10 : 5} step={form.benchmark === 'Profit Before Tax' ? 0.5 : 0.1} value={form.percentage} disabled={disabled} onChange={event => update('percentage', Number(event.target.value))}/></Field>}
      {form.benchmark === 'Custom figure' && <Field label="Custom materiality (INR)" id="ra-custom"><input className="input" type="number" min="0" id="ra-custom" value={form.custom_figure ?? ''} disabled={disabled} onChange={event => update('custom_figure', event.target.value ? Number(event.target.value) : null)}/></Field>}
    </div>
    {form.benchmark === 'Profit Before Tax' && form.pbt <= 0 && <div className="ra-alert">PBT is zero or negative. The original agent excludes PBT from the materiality benchmark calculation.</div>}
    <Metric label="Computed materiality" value={money(result?.computed_figure)}/>
    <Field label="Final materiality (INR)" id="ra-final"><input className="input" id="ra-final" type="number" min="0" step="any" disabled={disabled} value={form.final_figure ?? result?.computed_figure ?? ''} onChange={event => update('final_figure', event.target.value === '' ? null : Number(event.target.value))}/></Field>
    <Field label="Materiality justification" id="ra-justification"><textarea className="textarea" id="ra-justification" required disabled={disabled} value={form.justification} onChange={event => update('justification', event.target.value)}/></Field>
    {error && <div className="ra-alert ra-alert-error" role="alert">{error}</div>}
    <div className="ra-actions"><button className="btn btn-primary" disabled={disabled || !result || !form.justification.trim()}>Confirm materiality<ArrowRight size={14}/></button></div>
  </form>;
}

function ThresholdStep({ id, state, revision, disabled, onSave }) {
  const [form, setForm] = useState({ pm_pct: state.context.thresholds?.pm_pct || 75, ctm_pct: state.context.thresholds?.ctm_pct || 5 });
  const { result, error } = usePreview(id, 'preview-thresholds', { ...form, revision });
  return <form className="ra-form" onSubmit={event => { event.preventDefault(); onSave(form); }}>
    <div className="ra-metrics ra-metrics-three"><Metric label="Rounded materiality" value={money(result?.rounded_materiality)}/><Metric label="Performance materiality (PM)" value={money(result?.performance_materiality)}/><Metric label="Clearly trivial misstatement (CTM)" value={money(result?.ctm)}/></div>
    <div className="ra-fields"><Field label={`PM percentage (${form.pm_pct}%)`} id="ra-pm"><input type="range" id="ra-pm" min="60" max="90" step="5" value={form.pm_pct} disabled={disabled} onChange={event => setForm({ ...form, pm_pct: Number(event.target.value) })}/></Field><Field label={`CTM percentage (${form.ctm_pct}%)`} id="ra-ctm"><input type="range" id="ra-ctm" min="1" max="5" step="1" value={form.ctm_pct} disabled={disabled} onChange={event => setForm({ ...form, ctm_pct: Number(event.target.value) })}/></Field></div>
    {error && <div className="ra-alert ra-alert-error" role="alert">{error}</div>}
    <div className="ra-actions"><button className="btn btn-primary" disabled={disabled || !result}>Confirm thresholds<ArrowRight size={14}/></button></div>
  </form>;
}

function ScopeStep({ id, state, revision, disabled, onSave }) {
  const candidates = state.candidates || [];
  const [selected, setSelected] = useState(state.context.confirmed_mcotabds || candidates.filter(item => item.above_pm).map(item => item.account));
  const [counts, setCounts] = useState(state.context.tvt_transaction_counts || Object.fromEntries(candidates.map(item => [item.account, 12])));
  const [custom, setCustom] = useState('');
  const actualCounts = Object.fromEntries(selected.map(name => [name, counts[name] || 12]));
  const { result } = usePreview(id, 'preview-tvt', { revision, confirmed_mcotabds: selected.length ? selected : ['preview'], tvt_transaction_counts: actualCounts });
  const toggle = name => setSelected(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  return <form className="ra-form" onSubmit={event => { event.preventDefault(); onSave({ confirmed_mcotabds: selected, tvt_transaction_counts: actualCounts }); }}>
    <div className="ra-metrics"><Metric label="Materiality" value={money(state.context.thresholds?.rounded_materiality)}/><Metric label="Performance materiality" value={money(state.context.thresholds?.pm)}/><Metric label="Selected MCOTABDs" value={selected.length}/></div>
    {[true, false].map(above => <section key={String(above)} className="ra-scope-section"><h4>{above ? 'Above performance materiality' : 'Below performance materiality'}</h4>
      {candidates.filter(item => item.above_pm === above).map((item, index) => <div className="ra-account-row" key={`${item.account}-${index}`}>
        <label><input type="checkbox" checked={selected.includes(item.account)} disabled={disabled} onChange={() => toggle(item.account)}/><span><strong>{item.account}</strong><small>{item.source} {item.note_ref ? `/ Note ${item.note_ref}` : ''}</small></span></label><span className="ra-account-amount">{money(item.value)}</span>
      </div>)}{!candidates.some(item => item.above_pm === above) && <p className="text-sm text-muted">No candidate accounts.</p>}
    </section>)}
    <div className="ra-custom-account"><Field label="Additional account" id="ra-add-account"><input className="input" id="ra-add-account" maxLength={500} value={custom} disabled={disabled} onChange={event => setCustom(event.target.value)}/></Field><button className="btn btn-outline" type="button" disabled={disabled || !custom.trim()} onClick={() => { if (!selected.includes(custom.trim())) setSelected([...selected, custom.trim()]); setCustom(''); }}><Plus size={15}/>Add</button></div>
    {selected.length > 0 && <section className="ra-scope-section"><h4>Transaction verification thresholds</h4>{selected.map((name, index) => <div className="ra-tvt-row" key={name}><div><strong>{name}</strong>{!candidates.some(item => item.account === name) && <button className="btn btn-icon-sm btn-ghost" type="button" title="Remove account" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => toggle(name)}><Trash2 size={13}/></button>}</div><Field label="Expected transactions" id={`ra-tvt-${index}`}><input className="input" id={`ra-tvt-${index}`} type="number" min="1" max="1000000000" step="1" disabled={disabled} value={counts[name] || 12} onChange={event => setCounts({ ...counts, [name]: Math.max(1, Number(event.target.value)) })}/></Field><span>TVT <strong>{money(result?.[name])}</strong></span></div>)}</section>}
    <div className="ra-actions"><button className="btn btn-primary" disabled={disabled || !selected.length}>Confirm scope<ArrowRight size={14}/></button></div>
  </form>;
}

function EngineStep({ state, disabled, configuration, onRun, onReview }) {
  const context = state.context;
  return <div className="ra-form">
    <div className="ra-metrics"><Metric label="Confirmed MCOTABDs" value={context.confirmed_mcotabds?.length || 0}/><Metric label="KB-derived rows" value={context.kb_row_count || 0}/><Metric label="LLM-generated rows" value={context.llm_row_count ?? (context.status === 'complete_llm_only' ? context.rcm_rows?.length || 0 : 0)}/></div>
    <div className="ra-engine-status">{state.stage === 'running' ? <><LoaderCircle className="spin" size={30}/><h4>Risk assessment in progress</h4></> : state.stage === 'complete' || state.stage === 'approved' ? <><CheckCircle2 size={30}/><h4>Risk engine complete</h4></> : <><Bot size={30}/><h4>Ready to assess</h4></>}</div>
    {state.error && <div className="ra-alert ra-alert-error" role="alert">{state.error}</div>}
    {context.kb_match && <div className="ra-alert">{context.kb_match.matched ? `Knowledge base industry: ${context.kb_match.matched_industry}` : context.kb_match.warning}</div>}
    {!!context.unmatched_mcotabds?.length && <div className="ra-alert">No KB match for: {context.unmatched_mcotabds.join(', ')}</div>}
    <div className="ra-actions"><button className="btn btn-primary" disabled={disabled || !configuration?.available || !configuration?.key_configured || !configuration?.knowledge_base?.loaded} onClick={onRun}><Bot size={15}/>{state.stage === 'complete' ? 'Re-run risk engine' : 'Run risk engine'}</button>{['complete', 'approved'].includes(state.stage) && <button className="btn btn-outline" onClick={onReview}>Gate review<ArrowRight size={14}/></button>}</div>
    {!!context.run_log?.length && <details className="ra-source"><summary>Run history</summary>{context.run_log.map(log => <div className="ra-run-log" key={log.run_id}><span>{log.agent} / v{log.agent_version}</span><span>{log.status} / {log.elapsed_seconds}s</span><small>{log.completed_at}</small></div>)}</details>}
  </div>;
}

function GateStep({ state, disabled, canApprove, onSave, onApprove, onRun, onDownload }) {
  const [rows, setRows] = useState(state.review_rows || []);
  const [exporting, setExporting] = useState(false);
  const update = (key, field, value) => setRows(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  const serialize = () => rows.map(({ key, assertion, risk, controls, procedures }) => ({ key, assertion, risk, controls, procedures }));
  const missing = (state.context.confirmed_mcotabds || []).filter(name => !rows.some(row => row.mcotabd === name));
  const accounts = [...new Set(rows.map(row => row.mcotabd))].sort();
  return <div className="ra-form">
    {state.approval && <div className="ra-alert ra-alert-success"><ShieldCheck size={18}/><span>Approved by {state.approval.approved_by}. Saved in Section 2000 as {state.approval.filename}.</span></div>}
    {!canApprove && state.stage !== 'approved' && <div className="ra-alert"><ShieldCheck size={18}/><span>Final approval is pending a firm manager, partner, or administrator.</span></div>}
    {!!missing.length && <div className="ra-alert ra-alert-error">No generated risks for: {missing.join(', ')}</div>}
    <div className="ra-metrics"><Metric label="Grouped risks" value={rows.length}/><Metric label="Knowledge base" value={rows.filter(row => row.source === 'knowledge_base').length}/><Metric label="LLM generated" value={rows.filter(row => row.source === 'llm_generated').length}/></div>
    {accounts.map(account => <details className="ra-review-account" key={account} open><summary>{account}<span>{rows.filter(row => row.mcotabd === account).length} risks</span></summary>{rows.filter(row => row.mcotabd === account).map((row, index) => <section className="ra-review-risk" key={row.key}>
      <div className="ra-risk-heading"><strong>Risk {index + 1}</strong><span className={`badge ${row.source === 'knowledge_base' ? 'badge-blue' : 'badge-amber'}`}>{row.source === 'knowledge_base' ? 'Knowledge base' : row.driven_by_auditor_notes ? 'LLM / Auditor notes' : 'LLM generated'}</span></div>
      <Field label="Assertion"><input className="input" aria-label={`${account} risk ${index + 1} assertion`} value={row.assertion} disabled={disabled} onChange={event => update(row.key, 'assertion', event.target.value)}/></Field>
      <Field label="Risk description"><textarea className="textarea" aria-label={`${account} risk ${index + 1} description`} value={row.risk} disabled={disabled} onChange={event => update(row.key, 'risk', event.target.value)}/></Field>
      {[['controls', 'Controls'], ['procedures', 'Substantive procedures']].map(([field, label]) => <div className="ra-review-list" key={field}><div className="ra-risk-heading"><strong>{label}</strong><button type="button" className="btn btn-icon-sm btn-ghost" title={`Add ${field === 'controls' ? 'control' : 'procedure'}`} aria-label={`Add ${field === 'controls' ? 'control' : 'procedure'} to ${account} risk ${index + 1}`} disabled={disabled} onClick={() => update(row.key, field, [...row[field], ''])}><Plus size={14}/></button></div>{row[field].map((value, itemIndex) => <div className="ra-edit-list-row" key={itemIndex}><textarea className="textarea" aria-label={`${account} risk ${index + 1} ${field} ${itemIndex + 1}`} value={value} rows={2} disabled={disabled} onChange={event => update(row.key, field, row[field].map((item, i) => i === itemIndex ? event.target.value : item))}/><button type="button" className="btn btn-icon btn-ghost" title="Remove item" aria-label={`Remove ${field} ${itemIndex + 1}`} disabled={disabled} onClick={() => update(row.key, field, row[field].filter((_, i) => i !== itemIndex))}><Trash2 size={14}/></button></div>)}</div>)}
    </section>)}</details>)}
    {!rows.length && <div className="ra-alert">No risk rows are available. Return to the risk engine to re-run the assessment.</div>}
    <div className="ra-actions">{state.stage !== 'approved' ? <><button className="btn btn-outline" disabled={disabled || !rows.length} onClick={() => onSave(serialize())}><Save size={14}/>Save review</button><button className="btn btn-outline" disabled={disabled} onClick={onRun}><RefreshCw size={14}/>Re-run agent</button>{canApprove && <button className="btn btn-primary" disabled={disabled || !rows.length} onClick={() => onApprove(serialize())}><ShieldCheck size={15}/>Approve &amp; write to Section 2000</button>}</> : <button className="btn btn-primary" disabled={exporting} onClick={async () => { setExporting(true); try { await onDownload(); } finally { setExporting(false); } }}><Download size={15}/>Download RCM (JSON)</button>}</div>
  </div>;
}
