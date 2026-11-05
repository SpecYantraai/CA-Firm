import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { ResizeHandle, useResizablePanel, useMediaQuery, ScrollArea } from '../../components/common/Resizable';
import {
  Building, ShieldHalf, FileStack, DatabaseBackup,
  FileText, HardDrive, Hash, Bot, Activity,
  Timer, DownloadCloud, Stamp,
} from 'lucide-react';

const GROUPS = [
  {
    label: 'Firm',
    items: [
      { to: '/settings/firm', label: 'Firm profile', Icon: Building },
      { to: '/settings/roles', label: 'Roles & permissions', Icon: ShieldHalf },
      { to: '/settings/templates', label: 'Engagement templates', Icon: FileStack },
      { to: '/settings/retention', label: 'Retention & data handling', Icon: DatabaseBackup },
    ],
  },
  {
    label: 'Documents',
    items: [
      { to: '/settings/documents/editor', label: 'Document Editor', Icon: FileText },
      { to: '/settings/documents/storage', label: 'Storage', Icon: HardDrive },
      { to: '/settings/documents/numbering', label: 'File naming & numbering', Icon: Hash },
    ],
  },
  {
    label: 'AI & Agents',
    items: [
      { to: '/settings/ai-agents', label: 'Agent configuration', Icon: Bot },
      { to: '/settings/ai-status', label: 'Model & provider status', Icon: Activity },
    ],
  },
  {
    label: 'Security & Compliance',
    items: [
      { to: '/settings/security/sessions', label: 'Sessions policy', Icon: Timer },
      { to: '/settings/security/audit', label: 'Audit trail export', Icon: DownloadCloud },
      { to: '/settings/security/signoff', label: 'Sign-off rules', Icon: Stamp },
    ],
  },
];

export default function SettingsLayout() {
  const hubRef = useRef(null);
  const narrow = useMediaQuery('(max-width: 860px)');
  const resize = useResizablePanel({
    storageKey: 'specentra:panel:settings-nav',
    defaultWidth: 260, minWidth: 200, maxWidth: 400,
    cssVar: '--hub-nav-w', targetRef: hubRef, anchorRef: hubRef,
    getMaxWidth: () => (hubRef.current ? hubRef.current.clientWidth - 360 : 400),
    disabled: narrow,
  });

  return (
    <div className="hub" ref={hubRef} style={{ '--hub-nav-w': `${resize.width}px` }}>
      <ScrollArea as="aside" className="hub-nav" aria-label="Settings sections">
        <div className="hub-nav-head">
          <div className="hub-nav-mark"><Building2 size={18} /></div>
          <div className="hub-nav-id">
            <div className="hub-nav-name">Firm settings</div>
            <div className="hub-nav-sub">Specentra · On-premise</div>
          </div>
        </div>
        <nav className="hub-nav-list">
          {GROUPS.map((g) => (
            <div key={g.label} className="hub-nav-group">
              <div className="hub-nav-label">{g.label}</div>
              {g.items.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} end className={({ isActive }) => `hub-nav-item ${isActive ? 'active' : ''}`} title={label}>
                  <Icon size={16} /> <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </ScrollArea>
      {!narrow && (
        <ResizeHandle
          className="resize-hubnav" ariaLabel="Resize settings navigation"
          width={resize.width} min={resize.min} max={resize.max} dragging={resize.dragging}
          onPointerDown={resize.onPointerDown} onKeyDown={resize.onKeyDown} onReset={resize.reset}
        />
      )}
      <ScrollArea className="hub-main">
        <Outlet />
      </ScrollArea>
    </div>
  );
}
