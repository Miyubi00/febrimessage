import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef } from 'react';

import { Butterfly } from '@/components/decor/Butterfly';
import { cn } from '@/lib/utils';

/** Radius (px) inside which butterflies flee the cursor. */
const FLEE_RADIUS = 260;
/** Max flee offset (px) at point-blank range. */
const FLEE_STRENGTH = 140;

interface FleeingButterflyProps {
  top: string;
  size: string;
  color: string;
  glow: string;
  duration: string;
  delay: string;
  floatDelay: string;
  flap: string;
}

/**
 * One butterfly: CSS drift carries it across the sky, CSS float bobs it,
 * and a motion spring pushes it away from the cursor. Each layer owns its
 * own transform so nothing fights.
 */
function FleeingButterfly({
  top,
  size,
  color,
  glow,
  duration,
  delay,
  floatDelay,
  flap,
}: FleeingButterflyProps): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 18, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 120, damping: 18, mass: 0.6 });

  useEffect(() => {
    // Touch screens: fleeing while scrolling feels broken, so stay ambient.
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const onMove = (event: PointerEvent): void => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - event.clientX;
      const dy = rect.top + rect.height / 2 - event.clientY;
      const distance = Math.hypot(dx, dy);
      if (distance < FLEE_RADIUS && distance > 1) {
        const force = (1 - distance / FLEE_RADIUS) * FLEE_STRENGTH;
        x.set((dx / distance) * force);
        y.set((dy / distance) * force);
      } else {
        x.set(0);
        y.set(0);
      }
    };

    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [x, y]);

  return (
    <span
      className={cn('absolute left-0 animate-drift', top)}
      style={{ animationDuration: duration, animationDelay: delay }}
    >
      <motion.span ref={ref} style={{ x: springX, y: springY }} className="block">
        <span className="block animate-float" style={{ animationDelay: floatDelay }}>
          <Butterfly flap={flap} className={cn(size, color, glow)} />
        </span>
      </motion.span>
    </span>
  );
}

const FLOCK: ReadonlyArray<{
  top: string;
  size: string;
  color: string;
  glow: string;
  duration: string;
  delay: string;
  floatDelay: string;
  flap: string;
}> = [
  {
    top: 'top-[10%]',
    size: 'h-14 w-14',
    color: 'text-cyan-300/80',
    glow: '[filter:drop-shadow(0_0_14px_rgba(103,232,249,0.9))]',
    duration: '95s',
    delay: '-20s',
    floatDelay: '0.5s',
    flap: '0.5s',
  },
  {
    top: 'top-[30%]',
    size: 'h-9 w-9',
    color: 'text-sky-400/70',
    glow: '[filter:drop-shadow(0_0_10px_rgba(56,189,248,0.8))]',
    duration: '120s',
    delay: '-60s',
    floatDelay: '1.8s',
    flap: '0.65s',
  },
  {
    top: 'top-[52%]',
    size: 'h-20 w-20',
    color: 'text-indigo-300/60',
    glow: '[filter:drop-shadow(0_0_16px_rgba(165,180,252,0.7))]',
    duration: '80s',
    delay: '-45s',
    floatDelay: '2.6s',
    flap: '0.42s',
  },
  {
    top: 'top-[5%]',
    size: 'h-8 w-8',
    color: 'text-white/70',
    glow: '[filter:drop-shadow(0_0_10px_rgba(255,255,255,0.8))]',
    duration: '70s',
    delay: '-10s',
    floatDelay: '1.1s',
    flap: '0.55s',
  },
  {
    top: 'top-[62%]',
    size: 'h-11 w-11',
    color: 'text-violet-300/70',
    glow: '[filter:drop-shadow(0_0_12px_rgba(196,181,253,0.8))]',
    duration: '105s',
    delay: '-80s',
    floatDelay: '0.9s',
    flap: '0.6s',
  },
  {
    top: 'top-[80%]',
    size: 'h-16 w-16',
    color: 'text-blue-400/60',
    glow: '[filter:drop-shadow(0_0_16px_rgba(96,165,250,0.8))]',
    duration: '88s',
    delay: '-30s',
    floatDelay: '2.2s',
    flap: '0.48s',
  },
  {
    top: 'top-[38%]',
    size: 'h-7 w-7',
    color: 'text-teal-200/70',
    glow: '[filter:drop-shadow(0_0_10px_rgba(153,246,228,0.8))]',
    duration: '110s',
    delay: '-70s',
    floatDelay: '1.5s',
    flap: '0.7s',
  },
];

/** Night-garden butterflies (navy theme): ambient flight + flee the cursor. */
export function ButterflyField(): JSX.Element {
  return (
    <>
      {FLOCK.map((item, index) => (
        <FleeingButterfly key={index} {...item} />
      ))}
    </>
  );
}
