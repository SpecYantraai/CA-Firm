import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '../../store';

const MODES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Appearance switch — Light / Dark / System segmented control.
 * Reflects and updates the resolved theme mode in useThemeStore.
 */
export default function AppearanceSwitch({ compact = false }) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <div className={`appearance-switch ${compact ? 'is-compact' : ''}`} role="radiogroup" aria-label="Appearance">
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          className={mode === value ? 'active' : ''}
          onClick={() => setMode(value)}
        >
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
