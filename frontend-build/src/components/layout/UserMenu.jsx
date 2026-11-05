import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useProfileStore, roleDesignation } from '../../store';
import { initials as toInitials, formatDate, timeAgo } from '../../utils';
import AppearanceSwitch from '../common/AppearanceSwitch';
import toast from 'react-hot-toast';
import {
  ChevronsUpDown, UserRound, PenLine, Keyboard, SlidersHorizontal,
  Building2, LogOut, IdCard, Clock, Plus,
} from 'lucide-react';

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const POP_W = 320;

export default function UserMenu({ collapsed, onNavigate }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const designationOverride = useProfileStore((s) => s.designation);
  const membershipNo = useProfileStore((s) => s.membershipNo);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const triggerRef = useRef(null);

  const isAdmin = user?.role === 'Admin';
  const designation = designationOverride || roleDesignation(user?.role);
  const displayInitials = user?.initials || toInitials(user?.full_name);

  // Collision-aware placement anchored to the user block, independent of sidebar width.
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 8, margin = 16;
    let left, bottom, maxHeight;
    if (collapsed) {
      left = r.right + gap;
      if (left + POP_W > vw - margin) left = r.left - POP_W - gap; // flip to the left of the rail
      left = clamp(left, margin, vw - POP_W - margin);
      bottom = clamp(vh - r.bottom, margin, vh - margin);
      maxHeight = vh - margin * 2;
    } else {
      left = clamp(r.left, margin, vw - POP_W - margin);
      bottom = vh - r.top + gap;                 // open upward, above the trigger
      maxHeight = Math.max(200, r.top - margin);  // never exceed the space above
    }
    setPos({ left, bottom, maxHeight });
  }, [collapsed]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  const getItems = useCallback(
    () => (popRef.current ? Array.from(popRef.current.querySelectorAll('[data-menuitem]')) : []),
    []
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onReflow = () => place();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === 'Tab') {
        const f = popRef.current
          ? Array.from(popRef.current.querySelectorAll('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'))
          : [];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = getItems();
        if (!items.length) return;
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        let next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    const t = setTimeout(() => getItems()[0]?.focus(), 20);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
      clearTimeout(t);
    };
  }, [open, getItems, place]);

  const go = (to) => { navigate(to); setOpen(false); onNavigate?.(); };
  const handleLogout = () => { logout(); toast.success('Signed out'); navigate('/login'); };

  return (
    <div className="user-menu-root" ref={rootRef} style={{ position: 'relative' }}>
      {open && pos && createPortal(
        <div
          className="user-popover scroll-area"
          ref={popRef}
          role="menu"
          aria-label="Account menu"
          style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: POP_W, maxHeight: pos.maxHeight }}
        >
          <div className="user-popover-card">
            <div className="upc-avatar">{displayInitials}</div>
            <div className="upc-meta">
              <div className="upc-name" title={user?.full_name}>{user?.full_name}</div>
              <div className="upc-sub">
                <span className="upc-designation">{designation}</span>
                <span className="pill pill-reviewed upc-role">{user?.role}</span>
              </div>
              <div className="upc-email" title={user?.email}>{user?.email}</div>
            </div>
          </div>

          <div className="user-popover-meta">
            <div className="upm-line"><Building2 size={13} /><span>Specentra · On-premise</span></div>
            <div className="upm-line">
              <IdCard size={13} />
              {membershipNo
                ? <span>ICAI MRN {membershipNo}</span>
                : <button className="upm-add" data-menuitem onClick={() => go('/account/profile')}><Plus size={12} /> Add ICAI membership number</button>}
            </div>
            <div className="upm-line">
              <Clock size={13} />
              <span>
                {user?.last_login_at ? <>Last sign-in {timeAgo(user.last_login_at)}</> : 'First session'}
                {user?.created_at && <> · Member since {formatDate(user.created_at)}</>}
              </span>
            </div>
          </div>

          <div className="menu-sep" />

          <button className="menu-item" data-menuitem role="menuitem" onClick={() => go('/account')}>
            <UserRound size={15} /> Profile &amp; account
          </button>
          <button className="menu-item" data-menuitem role="menuitem" onClick={() => go('/account/sign-off')}>
            <PenLine size={15} /> Sign-off identity
          </button>
          <button className="menu-item" data-menuitem role="menuitem" onClick={() => go('/account/preferences')}>
            <SlidersHorizontal size={15} /> Preferences
          </button>
          <button className="menu-item" data-menuitem role="menuitem" onClick={() => go('/account/shortcuts')}>
            <Keyboard size={15} /> Keyboard shortcuts
          </button>

          <div className="menu-sep" />

          <div className="user-popover-appearance">
            <span className="upa-label">Appearance</span>
            <AppearanceSwitch compact />
          </div>

          {isAdmin && (
            <>
              <div className="menu-sep" />
              <button className="menu-item" data-menuitem role="menuitem" onClick={() => go('/settings')}>
                <Building2 size={15} /> Firm settings
              </button>
            </>
          )}

          <div className="menu-sep" />
          <button className="menu-item danger" data-menuitem role="menuitem" onClick={handleLogout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>,
        document.body
      )}

      <button
        ref={triggerRef}
        className={`sidebar-user ${collapsed ? 'tip tip-right' : ''}`}
        data-tip={collapsed ? user?.full_name : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="user-avatar">{displayInitials}</div>
        <div className="user-info">
          <div className="user-name">{user?.full_name}</div>
          <div className="user-role">{designation}</div>
        </div>
        <ChevronsUpDown size={14} className="user-chevron" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
    </div>
  );
}
