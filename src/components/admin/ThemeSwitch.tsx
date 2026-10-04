import { motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AdminTheme } from '@/hooks/useAdminTheme';

interface ThemeSwitchProps {
  theme: AdminTheme;
  onToggle: () => void;
}

/** Light/dark toggle with a sliding knob. */
export function ThemeSwitch({ theme, onToggle }: ThemeSwitchProps): JSX.Element {
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Matikan mode gelap' : 'Nyalakan mode gelap'}
      title={dark ? 'Matikan mode gelap' : 'Nyalakan mode gelap'}
      onClick={onToggle}
      className={cn(
        'flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors',
        dark
          ? 'justify-start border-white/15 bg-white/10'
          : 'justify-start border-pastel-200 bg-pastel-100',
      )}
    >
      <motion.span
        initial={false}
        animate={{ x: dark ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full shadow-soft',
          dark ? 'bg-[#1B2B5E] text-amber-300' : 'bg-white text-amber-500',
        )}
      >
        {dark ? (
          <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </motion.span>
    </button>
  );
}
