/* Dev-only living reference for the Specentra design system.
   Route: /design-system  (any authenticated user). Not linked in primary nav. */
import { useState } from 'react';
import {
  FileText, ShieldCheck, Sparkles, Check, AlertTriangle, Search,
  LayoutGrid, List, ChevronRight, Download, Trash2
} from 'lucide-react';

const BRAND = [
  ['Brand', '--brand'], ['Brand strong', '--brand-strong'], ['Brand soft', '--brand-soft'],
  ['Brand pale', '--brand-pale'],
];
const SEMANTIC = [
  ['Success', '--success'], ['Warning', '--warning'], ['Danger', '--danger'], ['Info', '--info'],
  ['AI draft', '--ai-marker'], ['Approved', '--approved-fg'],
];
const NEUTRALS = ['--n-50', '--n-100', '--n-200', '--n-300', '--n-400', '--n-500', '--n-600', '--n-700', '--n-800', '--n-900'];

function Swatch({ label, token }) {
  return (
    <div className="ds-swatch">
      <div className="sw" style={{ background: `var(${token})` }} />
      <div className="lbl"><b>{label}</b><code>{token}</code></div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [view, setView] = useState('grid');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Design System</h1>
          <p className="page-subtitle">Specentra AMS — tokens, components and patterns. Developer reference.</p>
        </div>
        <div className="page-actions">
          <span className="badge badge-ai"><Sparkles size={11} /> Dev only</span>
        </div>
      </div>

      <div className="ds-page">
        {/* Colour */}
        <h2>Brand &amp; semantic colour</h2>
        <div className="ds-swatches">
          {BRAND.map(([l, t]) => <Swatch key={t} label={l} token={t} />)}
          {SEMANTIC.map(([l, t]) => <Swatch key={t} label={l} token={t} />)}
        </div>

        <h2>Neutral scale</h2>
        <div className="ds-swatches">
          {NEUTRALS.map(t => <Swatch key={t} label={t.replace('--n-', 'Neutral ')} token={t} />)}
        </div>

        {/* Typography */}
        <h2>Typography — Inter (sans) · IBM Plex Mono (codes)</h2>
        <div className="ds-card">
          <div className="ds-type-row"><code>page-title / 20</code><span className="page-title">Audit file hierarchy is obvious in three seconds</span></div>
          <div className="ds-type-row"><code>body / 14</code><span style={{ fontSize: 14 }}>Agents prepare and recommend. The CA evaluates, challenges and approves.</span></div>
          <div className="ds-type-row"><code>secondary / 12</code><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Supporting metadata and descriptions sit at this level.</span></div>
          <div className="ds-type-row"><code>mono / codes</code><span className="font-mono" style={{ fontSize: 13 }}>1000 · 2110 · FY 2025-26 · ₹ 1,24,50,000</span></div>
        </div>

        {/* Buttons */}
        <h2>Buttons</h2>
        <div className="ds-card">
          <div className="ds-row">
            <button className="btn btn-primary">Primary</button>
            <button className="btn btn-soft">Soft</button>
            <button className="btn btn-navy">Navy</button>
            <button className="btn btn-outline">Outline</button>
            <button className="btn btn-ghost">Ghost</button>
            <button className="btn btn-danger">Danger</button>
          </div>
          <div className="ds-row">
            <button className="btn btn-primary btn-lg">Large</button>
            <button className="btn btn-primary">Default</button>
            <button className="btn btn-primary btn-sm">Small</button>
            <button className="btn btn-primary btn-xs">XS</button>
            <button className="btn btn-primary" data-loading="true">Loading</button>
            <button className="btn btn-primary" disabled>Disabled</button>
          </div>
          <div className="ds-row">
            <button className="btn btn-primary"><Download size={14} /> With icon</button>
            <button className="icon-btn tip" data-tip="Icon button"><Trash2 size={16} /></button>
            <span className="kbd">⌘</span><span className="kbd">K</span>
          </div>
        </div>

        {/* Status */}
        <h2>Status pills &amp; badges</h2>
        <div className="ds-card">
          <div className="ds-row">
            <span className="pill pill-notstarted">Not started</span>
            <span className="pill pill-progress">In progress</span>
            <span className="pill pill-prepared">Prepared</span>
            <span className="pill pill-reviewed">Reviewed</span>
            <span className="pill pill-approved">Approved</span>
            <span className="pill pill-blocked">Blocked</span>
          </div>
          <div className="ds-row">
            <span className="badge badge-green"><Check size={11} /> Active</span>
            <span className="badge badge-purple"><ShieldCheck size={11} /> EQCR</span>
            <span className="badge badge-blue">Small entity</span>
            <span className="badge badge-amber">Workflow override</span>
            <span className="badge badge-red">Overdue</span>
            <span className="badge badge-outline">Outline</span>
          </div>
        </div>

        {/* AI language */}
        <h2>AI-draft vs human-approved language</h2>
        <div className="ds-card">
          <div className="ds-row">
            <span className="badge badge-ai"><Sparkles size={11} /> AI draft</span>
            <span className="badge badge-approved"><Check size={11} /> CA approved</span>
            <span className="badge badge-draft">Draft</span>
            <span className="ai-flag ai-flag-high"><Check size={12} /> High confidence</span>
            <span className="ai-flag ai-flag-med"><AlertTriangle size={12} /> Review suggested</span>
          </div>
          <div className="ai-surface" style={{ marginTop: 10 }}>
            <div className="ai-label"><Sparkles size={12} /> Agent recommendation · overridable</div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '7px 0 10px' }}>
              Proposed overall materiality: ₹ 42,00,000 (5% of profit before tax).
            </p>
            <button className="source-chip">
              <FileText size={12} /><span className="src-doc">TB_FY2025-26.xlsx</span><span className="src-page">p.3</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <h2>Controls</h2>
        <div className="ds-card">
          <div className="ds-row">
            <div className="segmented" role="group" aria-label="View">
              <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}><LayoutGrid size={14} /> Grid</button>
              <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><List size={14} /> Table</button>
            </div>
            <div className="searchbar" style={{ width: 240 }}>
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input placeholder="Search…" />
            </div>
          </div>
          <div className="ds-row">
            <div className="avatar-group">
              <span className="avatar">AP</span><span className="avatar">RK</span><span className="avatar">SN</span>
              <span className="avatar-more">+3</span>
            </div>
            <nav className="breadcrumbs">
              <button>Engagements</button><ChevronRight size={13} className="crumb-sep" />
              <button>Horizon Textiles</button><ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">FY 2025-26</span>
            </nav>
          </div>
          <div className="ds-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div className="progress" style={{ maxWidth: 360 }}><span style={{ width: '64%' }} /></div>
            <div className="progress-stack" style={{ maxWidth: 360 }}>
              <span className="af-progress-prepared" style={{ width: '72%' }} />
              <span className="af-progress-reviewed" style={{ width: '45%' }} />
            </div>
          </div>
        </div>

        {/* Skeletons & empty */}
        <h2>Loading &amp; empty states</h2>
        <div className="ds-card">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="skeleton skeleton-circle" style={{ width: 40, height: 40 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton skeleton-text" style={{ width: '70%' }} />
            </div>
          </div>
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="empty-state-icon"><FileText size={22} /></div>
            <div className="empty-state-title">No working papers yet</div>
            <div className="empty-state-sub">Add or upload a working paper to begin this section.</div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>Add working paper</button>
          </div>
        </div>
      </div>
    </div>
  );
}
