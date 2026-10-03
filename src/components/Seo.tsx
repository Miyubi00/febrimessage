import { useEffect } from 'react';

import { env } from '@/lib/env';

interface SeoProps {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  /** Optional canonical path (defaults to the current pathname). */
  path?: string;
}

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

/**
 * Lightweight document head management (title, description, Open Graph).
 * Values are inserted with `textContent`/attributes only — never as HTML.
 */
export function Seo({ title, description, imageUrl, path }: SeoProps): null {
  useEffect(() => {
    const fullTitle = `${title} — ${env.siteName}`;
    document.title = fullTitle;

    const resolvedDescription =
      description?.trim() || `Kirim pesan anonim untuk ${title} di ${env.siteName}.`;

    upsertMeta('meta[name="description"]', 'name', 'description', resolvedDescription);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', resolvedDescription);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', resolvedDescription);

    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);

    if (imageUrl) {
      upsertMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
      upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
    }
  }, [title, description, imageUrl, path]);

  return null;
}