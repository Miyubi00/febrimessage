import { cn } from '@/lib/utils';

interface ProgressBarProps {
  /** 0 – 100 */
  value: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps): JSX.Element {
  const safeValue = Math.min(Math.max(Math.round(value), 0), 100);

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink-soft">
          <span className="truncate">{label}</span>
          <span className="tabular-nums">{safeValue}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-pastel-100"
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progres unggah'}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-pastel-300 via-pastel-400 to-pastel-600 transition-all duration-300"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}