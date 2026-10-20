import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../store';

export default function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  return (
    <div className="theme-toggle" role="group" aria-label="Appearance">
      {['light', 'dark'].map(mode => {
        const Icon = mode === 'light' ? Sun : Moon;
        return (
          <button key={mode} type="button" className={theme === mode ? 'active' : ''}
            aria-pressed={theme === mode} onClick={() => setTheme(mode)}>
            <Icon size={14} />{mode === 'light' ? 'Light' : 'Dark'}
          </button>
        );
      })}
    </div>
  );
}
