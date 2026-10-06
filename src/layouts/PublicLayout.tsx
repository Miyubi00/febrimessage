import { Heart, Plus, Send, Sparkles, Star, X } from 'lucide-react';
import { useLayoutEffect, type ReactNode } from 'react';

import { ButterflyField } from '@/components/decor/ButterflyField';
import { cn } from '@/lib/utils';

interface BackdropTheme {
  /** Extra background on the page root (light themes stay transparent). */
  page: string;
  wash: string;
  blobA: string;
  blobB: string;
  blobC: string;
  dots: readonly string[];
  iconA: string;
  iconB: string;
  iconC: string;
  /** Floating festive shapes (hearts, planes, plus). */
  shape: string;
  /** Drifting clouds + bottom cloud bank. */
  cloud: string;
  /** Dotted-pattern grids (radial-gradient color). */
  grid: string;
}

const BACKDROP_THEMES: Record<string, BackdropTheme> = {
  'pastel-blue': {
    page: '',
    wash: 'bg-[radial-gradient(1000px_520px_at_8%_-8%,#EAF6FF_0%,rgba(234,246,255,0)_62%),radial-gradient(900px_460px_at_96%_4%,#E7E9FF_0%,rgba(231,233,255,0)_58%)]',
    blobA: 'bg-pastel-200/45',
    blobB: 'bg-lavender-light/70',
    blobC: 'bg-pastel-100/80',
    dots: [
      'bg-lavender/70',
      'bg-pastel-300/80',
      'bg-pastel-400/70',
      'bg-lavender-deep/50',
      'bg-pastel-300/70',
      'bg-lavender/60',
    ],
    iconA: 'text-pastel-300',
    iconB: 'text-lavender',
    iconC: 'text-pastel-400',
    shape: 'text-pastel-400',
    cloud: 'bg-white/70',
    grid: 'rgba(143,203,255,0.55)',
  },
  pink: {
    page: '',
    wash: 'bg-[radial-gradient(1000px_520px_at_8%_-8%,#FCE7F3_0%,rgba(252,231,243,0)_62%),radial-gradient(900px_460px_at_96%_4%,#FBCFE8_0%,rgba(251,207,232,0)_55%)]',
    blobA: 'bg-pink-200/60',
    blobB: 'bg-rose-100/80',
    blobC: 'bg-white/70',
    dots: [
      'bg-pink-300/80',
      'bg-rose-300/70',
      'bg-pink-200/90',
      'bg-rose-200/80',
      'bg-pink-300/60',
      'bg-rose-200/80',
    ],
    iconA: 'text-pink-300',
    iconB: 'text-rose-300',
    iconC: 'text-pink-400',
    shape: 'text-pink-300',
    cloud: 'bg-white/80',
    grid: 'rgba(244,114,182,0.5)',
  },
  navy: {
    page: 'bg-[#0A1330]',
    wash: 'bg-[radial-gradient(1100px_560px_at_10%_-10%,#1E3A8A_0%,rgba(30,58,138,0)_60%),radial-gradient(900px_480px_at_95%_5%,#0EA5E9_0%,rgba(14,165,233,0)_45%),radial-gradient(700px_420px_at_50%_110%,#312E81_0%,rgba(49,46,129,0)_60%)]',
    blobA: 'bg-blue-600/30',
    blobB: 'bg-cyan-400/20',
    blobC: 'bg-indigo-500/25',
    dots: [
      'bg-cyan-300/90',
      'bg-white/90',
      'bg-sky-400/80',
      'bg-indigo-300/80',
      'bg-cyan-200/80',
      'bg-white/70',
    ],
    iconA: 'text-cyan-200/70',
    iconB: 'text-white/60',
    iconC: 'text-sky-300/80',
    shape: 'text-cyan-200/80',
    cloud: 'bg-white/10',
    grid: 'rgba(148,197,255,0.35)',
  },
};

const DOT_SPOTS: ReadonlyArray<{ className: string; delay?: string }> = [
  { className: 'left-[6%] top-[14%] h-8 w-8' },
  { className: 'right-[9%] top-[9%] h-6 w-6', delay: '1.2s' },
  { className: 'left-[12%] bottom-[16%] h-5 w-5', delay: '0.6s' },
  { className: 'right-[14%] bottom-[10%] h-7 w-7', delay: '2s' },
  { className: 'left-[44%] top-[58%] h-4 w-4', delay: '0.9s' },
  { className: 'right-[32%] top-[30%] h-3 w-3', delay: '1.6s' },
];

/** Clouds slowly drifting across the sky (pure CSS, miles apart in timing). */
function DriftingClouds({ cloud }: { cloud: string }): JSX.Element {
  const clouds = [
    { top: 'top-[5%]', size: 'h-20 w-60 sm:h-24 sm:w-80', duration: '75s', delay: '-18s' },
    { top: 'top-[22%]', size: 'h-14 w-44 sm:h-16 sm:w-56', duration: '105s', delay: '-55s' },
    { top: 'top-[46%]', size: 'h-16 w-52 sm:h-20 sm:w-72', duration: '90s', delay: '-70s' },
  ];
  return (
    <>
      {clouds.map((item, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('absolute left-0 rounded-full blur-2xl animate-drift', item.top, item.size, cloud)}
          style={{ animationDuration: item.duration, animationDelay: item.delay }}
        />
      ))}
    </>
  );
}

/** Floating festive shapes: hearts, paper planes, plus signs, twinkling stars. */
function FloatingShapes({ shape }: { shape: string }): JSX.Element {
  return (
    <>
      <Heart
        aria-hidden="true"
        className={cn('absolute left-[7%] top-[36%] hidden h-5 w-5 animate-float md:block', shape)}
        style={{ animationDelay: '0.4s' }}
      />
      <Send
        aria-hidden="true"
        className={cn('absolute right-[8%] top-[34%] hidden h-7 w-7 rotate-12 animate-float md:block', shape)}
        style={{ animationDelay: '1.4s' }}
      />
      <Plus
        aria-hidden="true"
        className={cn('absolute left-[4%] top-[62%] hidden h-6 w-6 animate-float sm:block', shape)}
        style={{ animationDelay: '2.2s' }}
      />
      <Star
        aria-hidden="true"
        className={cn('absolute right-[5%] top-[56%] h-5 w-5 animate-twinkle', shape)}
        style={{ animationDelay: '0.8s' }}
      />
      <Sparkles
        aria-hidden="true"
        className={cn('absolute bottom-[12%] left-[18%] hidden h-5 w-5 animate-twinkle sm:block', shape)}
      />
      <Heart
        aria-hidden="true"
        className={cn('absolute bottom-[24%] right-[16%] hidden h-4 w-4 animate-float lg:block', shape)}
        style={{ animationDelay: '2.8s' }}
      />
      <Plus
        aria-hidden="true"
        className={cn('absolute right-[26%] top-[12%] hidden h-5 w-5 animate-float lg:block', shape)}
        style={{ animationDelay: '1s' }}
      />
    </>
  );
}

/** Dotted pattern grids, like confetti paper. */
function DotGrids({ color }: { color: string }): JSX.Element {
  const style = {
    backgroundImage: `radial-gradient(${color} 1.5px, transparent 1.5px)`,
    backgroundSize: '14px 14px',
  };
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute bottom-[6%] left-[3%] hidden h-28 w-28 animate-float md:block"
        style={{ ...style, animationDelay: '0.2s' }}
      />
      <span
        aria-hidden="true"
        className="absolute right-[3%] top-[48%] hidden h-24 w-24 animate-float lg:block"
        style={{ ...style, animationDelay: '1.8s' }}
      />
    </>
  );
}

/** Festive animated sky behind the public page — colors follow the profile theme. */
function FestiveBackdrop({ theme }: { theme: BackdropTheme }): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className={cn('absolute inset-0', theme.wash)} />
      <div className={cn('absolute -left-24 top-1/3 h-72 w-72 rounded-full blur-3xl', theme.blobA)} />
      <div className={cn('absolute -right-20 top-10 h-80 w-80 rounded-full blur-3xl', theme.blobB)} />
      <div
        className={cn(
          'absolute bottom-0 left-1/2 h-64 w-[38rem] -translate-x-1/2 rounded-full blur-3xl',
          theme.blobC,
        )}
      />

      <DriftingClouds cloud={theme.cloud} />

      {DOT_SPOTS.map((dot, index) => (
        <span
          key={index}
          className={cn(
            'absolute rounded-full opacity-70 animate-float',
            dot.className,
            theme.dots[index % theme.dots.length],
          )}
          style={dot.delay ? { animationDelay: dot.delay } : undefined}
        />
      ))}

      <FloatingShapes shape={theme.shape} />
      <DotGrids color={theme.grid} />

      {/* Cloud bank along the bottom edge */}
      <span className={cn('absolute -bottom-10 -left-16 h-36 w-96 rounded-full blur-3xl', theme.cloud)} />
      <span className={cn('absolute -bottom-14 left-1/3 h-40 w-[30rem] rounded-full blur-3xl', theme.cloud)} />
      <span className={cn('absolute -bottom-10 -right-16 h-36 w-96 rounded-full blur-3xl', theme.cloud)} />

      <X className={cn('absolute left-[16%] top-[9%] hidden h-6 w-6 rotate-12 sm:block', theme.iconA)} />
      <Plus className={cn('absolute bottom-[18%] right-[22%] hidden h-6 w-6', theme.iconB)} />
      <Sparkles className={cn('absolute left-[42%] top-[4%] hidden h-5 w-5 sm:block', theme.iconC)} />
    </div>
  );
}

interface PublicLayoutProps {
  children: ReactNode;
  /** Profile theme — controls backdrop + navy dark-mode surfaces. */
  theme?: string;
}

const PUBLIC_THEME_KEY = 'public-theme';

export function PublicLayout({ children, theme }: PublicLayoutProps): JSX.Element {
  const name = theme && BACKDROP_THEMES[theme] ? theme : 'pastel-blue';
  const backdrop = BACKDROP_THEMES[name];

  // Mirror the theme onto <html> BEFORE paint (useLayoutEffect) so portaled
  // overlays (toast, modal, lightbox) and the loading skeleton all follow the
  // active theme. The persisted copy lets index.html apply it pre-paint on the
  // next visit, eliminating the light-mode flash.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', name);
    // Never let the admin theme leak onto the public page.
    root.removeAttribute('data-admin-theme');
    try {
      window.localStorage.setItem(PUBLIC_THEME_KEY, name);
    } catch {
      // Private mode — theme just won't persist.
    }
    return () => {
      root.removeAttribute('data-theme');
    };
  }, [name]);

  return (
    <div
      data-theme={name}
      className={cn(
        'relative flex min-h-dvh flex-col overflow-hidden lg:h-dvh',
        backdrop.page,
      )}
    >
      <FestiveBackdrop theme={backdrop} />

      <ButterflyField theme={name} />

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-3 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:min-h-0 lg:pb-4">
        {children}
      </div>
    </div>
  );
}
