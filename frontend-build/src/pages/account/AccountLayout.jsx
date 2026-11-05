import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore, useProfileStore, roleDesignation } from '../../store';
import { initials as toInitials } from '../../utils';
import { ResizeHandle, useResizablePanel, useMediaQuery, ScrollArea } from '../../components/common/Resizable';
import {
  UserRound, PenLine, LayoutList, SlidersHorizontal, ShieldCheck, Bell, Keyboard,
} from 'lucide-react';

const SECTIONS = [
  { to: '/account/profile', label: 'Profile', Icon: UserRound },
  { to: '/account/sign-off', label: 'Sign-off identity', Icon: PenLine },
  { to: '/account/work', label: 'My work', Icon: LayoutList },
  { to: '/account/preferences', label: 'Appearance & preferences', Icon: SlidersHorizontal },
  { to: '/account/security', label: 'Security', Icon: ShieldCheck },
  { to: '/account/notifications', label: 'Notifications', Icon: Bell },
  { to: '/account/shortcuts', label: 'Keyboard shortcuts', Icon: Keyboard },
];

export default function AccountLayout() {
  const user = useAuthStore((s) => s.user);
  const designationOverride = useProfileStore((s) => s.designation);
  const designation = designationOverride || roleDesignation(user?.role);
  const hubRef = useRef(null);
  const narrow = useMediaQuery('(max-width: 860px)');
  const resize = useResizablePanel({
    storageKey: 'specentra:panel:account-nav',
    defaultWidth: 260, minWidth: 200, maxWidth: 400,
    cssVar: '--hub-nav-w', targetRef: hubRef, anchorRef: hubRef,
    getMaxWidth: () => (hubRef.current ? hubRef.current.clientWidth - 360 : 400),
    disabled: narrow,
  });

  return (
    <div className="hub" ref={hubRef} style={{ '--hub-nav-w': `${resize.width}px` }}>
      <ScrollArea as="aside" className="hub-nav" aria-label="Account sections">
        <div className="hub-nav-head">
          <div className="hub-nav-mark">{user?.initials || toInitials(user?.full_name)}</div>
          <div className="hub-nav-id">
            <div className="hub-nav-name tip" data-tip={user?.full_name}>{user?.full_name}</div>
            <div className="hub-nav-sub">{designation}</div>
          </div>
        </div>
        <div className="hub-nav-label">Account</div>
        <nav className="hub-nav-list">
          {SECTIONS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `hub-nav-item ${isActive ? 'active' : ''}`} title={label}>
              <Icon size={16} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      {!narrow && (
        <ResizeHandle
          className="resize-hubnav" ariaLabel="Resize account navigation"
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
