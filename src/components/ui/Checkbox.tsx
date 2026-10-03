import { Check } from 'lucide-react';
import { useId, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps): JSX.Element {
  const generatedId = useId();
  const checkboxId = id ?? rest.name ?? generatedId;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          id={checkboxId}
          type="checkbox"
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border border-pastel-300 bg-white shadow-soft transition
            checked:border-pastel-500 checked:bg-pastel-400
            focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pastel-200
            disabled:cursor-not-allowed disabled:opacity-60"
          {...rest}
        />
        <Check
          className="pointer-events-none absolute h-3.5 w-3.5 scale-75 text-white opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100"
          aria-hidden="true"
        />
      </span>

      <label htmlFor={checkboxId} className="cursor-pointer select-none text-sm text-ink-soft">
        <span className="font-semibold text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink-muted">{description}</span> : null}
      </label>
    </div>
  );
}