import { useEffect, useRef, useState } from 'react';

import { env } from '@/lib/env';

type CaptchaProvider = 'hcaptcha' | 'turnstile';

declare global {
  interface Window {
    hcaptcha?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; theme?: string }) => string;
      reset: (widgetId?: string) => void;
    };
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; theme?: string }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SOURCES: Record<CaptchaProvider, string> = {
  hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
};

function resolveProvider(): CaptchaProvider {
  const configured = (import.meta.env.VITE_CAPTCHA_PROVIDER ?? '').trim().toLowerCase();
  return configured === 'turnstile' ? 'turnstile' : 'hcaptcha';
}

interface CaptchaFieldProps {
  /** Receives the solved token (empty string when reset). */
  onToken: (token: string) => void;
  /** Bumping this value re-renders the widget (used after a successful send). */
  resetKey: number;
}

/**
 * Optional captcha support. Rendered only when `VITE_CAPTCHA_SITE_KEY` is set —
 * development works fine without it. The matching secret stays server-side and is
 * verified inside the Edge Function.
 */
export function CaptchaField({ onToken, resetKey }: CaptchaFieldProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!env.captchaSiteKey) return;

    const provider = resolveProvider();
    let cancelled = false;
    let script = document.querySelector<HTMLScriptElement>(`script[data-captcha="${provider}"]`);

    const render = (): void => {
      if (cancelled || !containerRef.current) return;
      const api = provider === 'turnstile' ? window.turnstile : window.hcaptcha;
      if (!api) {
        setFailed(true);
        return;
      }
      try {
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: env.captchaSiteKey,
          theme: 'light',
          callback: (token: string) => onToken(token),
        });
      } catch {
        setFailed(true);
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SOURCES[provider];
      script.async = true;
      script.defer = true;
      script.dataset.captcha = provider;
      script.onload = render;
      script.onerror = () => setFailed(true);
      document.head.appendChild(script);
    } else {
      render();
    }

    return () => {
      cancelled = true;
    };
  }, [onToken]);

  useEffect(() => {
    if (!env.captchaSiteKey || resetKey === 0) return;
    const provider = resolveProvider();
    const api = provider === 'turnstile' ? window.turnstile : window.hcaptcha;
    try {
      api?.reset(widgetIdRef.current ?? undefined);
    } catch {
      // Resetting a widget that is not mounted yet is safe to ignore.
    }
  }, [resetKey]);

  if (!env.captchaSiteKey) return null;

  return (
    <div className="mt-1">
      {failed ? (
        <p className="text-xs font-medium text-rose-500">
          Captcha gagal dimuat. Muat ulang halaman atau hubungi pemilik situs.
        </p>
      ) : null}
      <div ref={containerRef} className="min-h-[70px]" />
    </div>
  );
}