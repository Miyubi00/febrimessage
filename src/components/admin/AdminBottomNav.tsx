import { LayoutDashboard, MessageCircle, Settings2, UserCog, type LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { requestNavigation } from '@/lib/navigationGuard';
import { cn } from '@/lib/utils';

interface BottomNavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Exact match only (so Dashboard isn't active on every admin page). */
  end?: boolean;
}

const NAV_ITEMS: readonly BottomNavItem[] = [
  { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/admin/profile', label: 'Profile', Icon: UserCog },
  { to: '/admin/messages', label: 'Messages', Icon: MessageCircle },
  { to: '/admin/settings', label: 'Settings', Icon: Settings2 },
];

/** Full-width bottom navigation for the admin area (phone-style, all screens). */
export function AdminBottomNav({ unreadCount }: { unreadCount: number }): JSX.Element {
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Navigasi admin"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-pastel-200/80 bg-white/90 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-xl items-stretch justify-around gap-1 px-3 py-2">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              onClick={(event) => {
                // Let the active page stop us when it holds unsaved changes
                // (the page shakes + asks instead of navigating away silently).
                event.preventDefault();
                requestNavigation(() => navigate(to));
              }}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition',
                  isActive
                    ? 'bg-pastel-100 text-pastel-800'
                    : 'text-ink-muted hover:bg-pastel-50 hover:text-ink',
                )
              }
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {to === '/admin/messages' && unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold tabular-nums text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </span>
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
