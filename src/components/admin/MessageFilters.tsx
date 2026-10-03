import { ArrowDownUp, Image as ImageIcon, Search, UserRound, X } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { MessageFilterStatus, MessageSort } from '@/types/message';

interface MessageFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: MessageFilterStatus;
  onStatusChange: (value: MessageFilterStatus) => void;
  sort: MessageSort;
  onSortChange: (value: MessageSort) => void;
  anonymousOnly: boolean;
  onAnonymousOnlyChange: (value: boolean) => void;
  withImageOnly: boolean;
  onWithImageOnlyChange: (value: boolean) => void;
  total: number;
  className?: string;
}

const STATUS_TABS: ReadonlyArray<{ value: MessageFilterStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'spam', label: 'Spam' },
  { value: 'hidden', label: 'Hidden' },
];

/** Search + status/sort/type filters for the admin inbox. */
export function MessageFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  anonymousOnly,
  onAnonymousOnlyChange,
  withImageOnly,
  onWithImageOnlyChange,
  total,
  className,
}: MessageFiltersProps): JSX.Element {
  return (
    <section className={cn('surface-soft p-4', className)} aria-label="Filter pesan">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          name="message-search"
          placeholder="Cari isi pesan…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          rightSlot={
            search ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Bersihkan pencarian"
                className="rounded-full p-1 text-ink-muted transition hover:bg-pastel-100 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null
          }
          aria-label="Cari pesan"
          containerClassName="lg:flex-1"
        />

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="message-sort">
            Urutkan
          </label>
          <div className="relative">
            <ArrowDownUp
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <select
              id="message-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as MessageSort)}
              className="field h-11 w-auto appearance-none pl-9 pr-8 text-sm"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onStatusChange(tab.value)}
            aria-pressed={status === tab.value}
            className={cn('chip', status === tab.value && 'chip-active')}
          >
            {tab.label}
          </button>
        ))}

        <span className="mx-1 hidden h-5 w-px bg-pastel-200 sm:block" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onAnonymousOnlyChange(!anonymousOnly)}
          aria-pressed={anonymousOnly}
          className={cn('chip', anonymousOnly && 'chip-active')}
        >
          <UserRound className="h-3 w-3" aria-hidden="true" />
          Anonymous
        </button>

        <button
          type="button"
          onClick={() => onWithImageOnlyChange(!withImageOnly)}
          aria-pressed={withImageOnly}
          className={cn('chip', withImageOnly && 'chip-active')}
        >
          <ImageIcon className="h-3 w-3" aria-hidden="true" />
          With image
        </button>

        <span className="ml-auto text-xs font-semibold text-ink-muted">{total} pesan</span>
      </div>
    </section>
  );
}