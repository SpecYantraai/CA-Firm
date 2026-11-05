import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function prefersDark() {
  try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  catch { return false; }
}
function resolveTheme(mode) {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sp-theme', theme); } catch { /* Storage can be disabled by the browser. */ }
}

let initialMode = 'light';
try {
  initialMode = localStorage.getItem('sp-theme-mode')
    || (localStorage.getItem('sp-theme') === 'dark' ? 'dark' : 'light');
} catch { /* Use the default mode. */ }
let initialTheme = resolveTheme(initialMode);
applyTheme(initialTheme);

function persistMode(mode, theme) {
  try { localStorage.setItem('sp-theme-mode', mode); } catch { /* ignore */ }
  applyTheme(theme);
}

export const useThemeStore = create(set => ({
  // `mode` is the user's choice (may be 'system'); `theme` is always resolved to light/dark.
  mode: initialMode,
  theme: initialTheme,
  setMode: mode => { const theme = resolveTheme(mode); persistMode(mode, theme); set({ mode, theme }); },
  // Back-compat: setTheme(light|dark) sets an explicit mode.
  setTheme: mode => { const theme = resolveTheme(mode); persistMode(mode, theme); set({ mode, theme }); },
}));

// Follow the OS when the user has chosen "system".
try {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { mode } = useThemeStore.getState();
    if (mode === 'system') { const theme = resolveTheme('system'); applyTheme(theme); useThemeStore.setState({ theme }); }
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
} catch { /* matchMedia unavailable */ }

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null, token: null, isAuthenticated: false,
      setAuth: (token, user) => { localStorage.setItem('specentra_token', token); set({ token, user, isAuthenticated: true }); },
      logout: () => { localStorage.removeItem('specentra_token'); set({ user:null, token:null, isAuthenticated:false }); },
      updateUser: (user) => set({ user }),
    }),
    { name:'specentra_auth', partialize:(s) => ({ user:s.user, token:s.token, isAuthenticated:s.isAuthenticated }) }
  )
);

export const useAppStore = create((set) => ({
  currentEngagement: null,
  setCurrentEngagement: (eng) => set({ currentEngagement: eng }),
  clearCurrentEngagement: () => set({ currentEngagement: null }),
  refetchTree: 0,
  triggerRefetchTree: () => set((s) => ({ refetchTree: s.refetchTree + 1 })),
  refetchEngagements: 0,
  triggerRefetchEngagements: () => set((s) => ({ refetchEngagements: s.refetchEngagements + 1 })),
}));

export const useUIStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
    }),
    { name: 'specentra_ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
);

/**
 * Personal profile extras that the backend does not yet persist.
 * Stored on this device only; the Account UI labels them as such.
 */
export const useProfileStore = create(
  persist(
    (set) => ({
      designation: '',          // defaults to role-derived label when empty
      membershipNo: '',         // ICAI membership (MRN)
      phone: '',
      signatureInitials: '',    // overrides derived initials on the sign-off stamp
      dscStatus: 'not-registered', // 'not-registered' | 'registered' (placeholder)
      update: (patch) => set((s) => ({ ...s, ...patch })),
    }),
    { name: 'specentra_profile' }
  )
);

function applyDensity(density) {
  try { document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable'; }
  catch { /* ignore */ }
}

const initialPrefs = (() => {
  try { return JSON.parse(localStorage.getItem('specentra_prefs') || '{}')?.state || {}; }
  catch { return {}; }
})();
applyDensity(initialPrefs.density || 'comfortable');

/**
 * Personal appearance / workflow preferences (device-local).
 */
export const usePreferencesStore = create(
  persist(
    (set) => ({
      density: 'comfortable',        // 'comfortable' | 'compact'
      dateFormat: 'dd-mmm-yyyy',     // 'dd-mmm-yyyy' | 'dd/mm/yyyy' | 'yyyy-mm-dd'
      numberFormat: 'indian',        // 'indian' (lakh/crore) | 'international'
      defaultLanding: '/',           // route to open after sign-in
      notify: {
        gateApprovals: true,
        clientReplies: true,
        deadlines: true,
        channelEmail: false,
        channelInApp: true,
      },
      setDensity: (density) => { applyDensity(density); set({ density }); },
      update: (patch) => set((s) => ({ ...s, ...patch })),
      setNotify: (patch) => set((s) => ({ notify: { ...s.notify, ...patch } })),
    }),
    { name: 'specentra_prefs' }
  )
);

export const ROLE_PERMISSIONS = {
  canCreateEngagement: ['Audit Manager','Partner','Admin'],
  canArchive: ['Partner'],
  canRaiseNote: ['Audit Executive','Audit Manager','Partner','EQCR Reviewer'],
  canFinalise: ['Partner','Audit Manager'],
  canUpload: ['Articled Assistant','Audit Executive','Audit Manager','Partner','Admin'],
  canSoftDelete: ['Audit Manager','Partner','Admin'],
  canManageUsers: ['Admin'],
  canViewAllEngagements: ['Audit Manager','Partner','EQCR Reviewer','Admin'],
  canSubmit: ['Articled Assistant','Audit Executive'],
};

export function usePermission(permission) {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  const allowed = ROLE_PERMISSIONS[permission];
  return allowed ? allowed.includes(user.role) : false;
}

// Professional designation derived from the firm role (editable override lives in useProfileStore).
export const ROLE_DESIGNATION = {
  'Partner': 'Partner',
  'Audit Manager': 'Manager',
  'Audit Executive': 'Senior',
  'Articled Assistant': 'Article Assistant',
  'EQCR Reviewer': 'EQCR Reviewer',
  'Admin': 'Administrator',
};
export const roleDesignation = (role) => ROLE_DESIGNATION[role] || role || '—';
