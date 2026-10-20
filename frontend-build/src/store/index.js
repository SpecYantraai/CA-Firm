import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sp-theme', theme); } catch { /* Storage can be disabled by the browser. */ }
}

let initialTheme = 'light';
try { initialTheme = localStorage.getItem('sp-theme') === 'dark' ? 'dark' : 'light'; } catch { /* Use the default theme. */ }
applyTheme(initialTheme);

export const useThemeStore = create(set => ({
  theme: initialTheme,
  setTheme: theme => { applyTheme(theme); set({ theme }); },
}));

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
