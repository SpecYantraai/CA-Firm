import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, useAuthStore, useThemeStore, useAppStore } from '../../store';
import {
  Search, LayoutDashboard, FolderOpen, Users, Settings, Bot, Plus,
  Sun, Moon, LogOut, CornerDownLeft, LayoutGrid, FileText,
  UserRound, PenLine, SlidersHorizontal, Keyboard,
} from 'lucide-react';

export default function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const currentEngagement = useAppStore((s) => s.currentEngagement);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const isAdmin = user?.role === 'Admin';
  const canCreate = ['Audit Manager', 'Partner', 'Admin'].includes(user?.role);

  const commands = useMemo(() => {
    const go = (to) => () => { navigate(to); setOpen(false); };
    const list = [
      { group: 'Navigate', icon: LayoutDashboard, label: 'Dashboard', run: go('/') },
      { group: 'Navigate', icon: FolderOpen, label: 'Engagements', run: go('/engagements') },
      { group: 'Navigate', icon: Search, label: 'Search', run: go('/search') },
    ];
    if (currentEngagement) {
      list.push({
        group: 'Navigate', icon: FileText, label: `Open ${currentEngagement.client_name}`,
        sub: `FY ${currentEngagement.financial_year}`, run: go(`/engagements/${currentEngagement.engagement_id}`),
      });
    }
    // Account — available to every user
    list.push(
      { group: 'Account', icon: UserRound, label: 'Profile & account', run: go('/account') },
      { group: 'Account', icon: PenLine, label: 'Sign-off identity', run: go('/account/sign-off') },
      { group: 'Account', icon: SlidersHorizontal, label: 'Appearance & preferences', run: go('/account/preferences') },
      { group: 'Account', icon: Keyboard, label: 'Keyboard shortcuts', run: go('/account/shortcuts') },
    );
    if (isAdmin) {
      list.push(
        { group: 'Navigate', icon: Users, label: 'Users', run: go('/users') },
        { group: 'Navigate', icon: Settings, label: 'Firm settings', run: go('/settings') },
        { group: 'Navigate', icon: FileText, label: 'Document Editor settings', run: go('/settings/documents/editor') },
        { group: 'Navigate', icon: Bot, label: 'AI Agents', run: go('/settings/ai-agents') },
      );
    }
    list.push({ group: 'Navigate', icon: LayoutGrid, label: 'Design System', run: go('/design-system') });
    if (canCreate) {
      list.push({ group: 'Actions', icon: Plus, label: 'New engagement', run: () => { navigate('/engagements?create=1'); setOpen(false); } });
    }
    list.push(
      { group: 'Actions', icon: theme === 'dark' ? Sun : Moon, label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
      { group: 'Actions', icon: LogOut, label: 'Sign out', run: () => { logout(); navigate('/login'); setOpen(false); } },
    );
    return list;
  }, [navigate, setOpen, isAdmin, canCreate, user, theme, setTheme, logout, currentEngagement]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(s) || (c.sub || '').toLowerCase().includes(s) || c.group.toLowerCase().includes(s)
    );
  }, [q, commands]);

  useEffect(() => { setActive(0); }, [q, open]);
  useEffect(() => { if (open) { setQ(''); const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); } }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open); }
      else if (e.key === 'Escape' && open) { setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
  };

  let lastGroup = null;

  return (
    <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-head">
          <Search size={18} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search or jump to…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No results for “{q}”</div>
          ) : filtered.map((c, i) => {
            const Icon = c.icon;
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <div key={c.label}>
                {showGroup && <div className="cmdk-group">{c.group}</div>}
                <button
                  className={`cmdk-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={c.run}
                >
                  <Icon size={17} />
                  <span>{c.label}</span>
                  {c.sub && <span className="cmdk-sub">{c.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span><span className="kbd"><CornerDownLeft size={11} /></span> select</span>
          <span><span className="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
