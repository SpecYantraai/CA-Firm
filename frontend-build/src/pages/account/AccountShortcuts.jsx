import { useUIStore } from '../../store';
import { Command, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS = [
  {
    title: 'Global',
    items: [
      { keys: [MOD, 'K'], label: 'Open command palette' },
      { keys: ['Esc'], label: 'Close dialog, menu or palette' },
    ],
  },
  {
    title: 'Command palette',
    items: [
      { keys: ['↑', '↓'], label: 'Move between results' },
      { keys: ['Enter'], label: 'Run the highlighted command' },
    ],
  },
];

function Keycap({ k }) {
  if (k === '↑') return <span className="kbd"><ArrowUp size={11} /></span>;
  if (k === '↓') return <span className="kbd"><ArrowDown size={11} /></span>;
  if (k === 'Enter') return <span className="kbd"><CornerDownLeft size={11} /></span>;
  return <span className="kbd">{k}</span>;
}

export default function AccountShortcuts() {
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);

  return (
    <div className="account-section">
      <header className="section-head">
        <h1>Keyboard shortcuts</h1>
        <p>Move through Specentra without leaving the keyboard.</p>
      </header>

      <div className="shortcut-hero card" onClick={() => setCommandOpen(true)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCommandOpen(true); } }}>
        <div className="shortcut-hero-icon"><Command size={20} /></div>
        <div className="shortcut-hero-meta">
          <div className="shortcut-hero-title">The command palette is the fastest way around</div>
          <div className="shortcut-hero-sub">Jump to any screen, switch theme, or start an action.</div>
        </div>
        <div className="shortcut-hero-keys"><Keycap k={MOD} /><Keycap k="K" /></div>
      </div>

      <div className="shortcut-grid">
        {GROUPS.map((g) => (
          <div key={g.title} className="card shortcut-card">
            <div className="card-header"><div className="card-title">{g.title}</div></div>
            <ul className="shortcut-list">
              {g.items.map((it, i) => (
                <li key={i} className="shortcut-row">
                  <span className="shortcut-label">{it.label}</span>
                  <span className="shortcut-keys">
                    {it.keys.map((k, j) => <Keycap key={j} k={k} />)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted-note" style={{ padding: '0 2px' }}>More shortcuts arrive as new workflows ship.</p>
    </div>
  );
}
