import { useEffect } from 'react';
import { useDocumentTitle } from '../lib/use-document-title';

/**
 * SEO por página (rediseño 2026-10): título, descripción, URL canónica,
 * Open Graph y datos estructurados JSON-LD. El mismo contenido lo escribe
 * `scripts/prerender-seo.mjs` en el HTML estático de cada ruta pública al
 * construir, para que buscadores y redes sociales lo lean sin ejecutar JS.
 */
export const SITE_NAME = 'AdoptaFácil';
export const DEFAULT_DESCRIPTION =
  'Adopta perros y gatos de refugios, fundaciones y rescatistas de toda Colombia. Conoce su historia, solicita en línea y firma un contrato claro.';

/** Dominio público del sitio. `VITE_SITE_URL` en producción; si falta, el actual. */
export function siteUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '');
  return configured || window.location.origin;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export const DEFAULT_OG_IMAGE = '/og-adoptafacil.jpg';

export type JsonLd = Record<string, unknown>;

export interface SeoOptions {
  /** Título sin el sufijo de marca. */
  title: string | undefined;
  description?: string;
  /** Ruta canónica (sin dominio). Sin ella, la ruta actual sin query. */
  path?: string;
  image?: string;
  type?: 'website' | 'article';
  jsonLd?: JsonLd[];
  /** Páginas filtradas o vacías que no conviene indexar. */
  noindex?: boolean;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string | undefined) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

export function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image,
  type = 'website',
  jsonLd = [],
  noindex = false,
}: SeoOptions): void {
  useDocumentTitle(title);
  const ldText = JSON.stringify(jsonLd);

  useEffect(() => {
    if (!title) return;
    const url = absoluteUrl(path ?? window.location.pathname);
    const fullTitle = `${title} · ${SITE_NAME}`;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : undefined);
    upsertCanonical(url);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:image', absoluteUrl(image ?? DEFAULT_OG_IMAGE));

    document.head.querySelectorAll('script[data-seo="ld"]').forEach((node) => node.remove());
    for (const block of JSON.parse(ldText) as JsonLd[]) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seo = 'ld';
      script.textContent = JSON.stringify(block);
      document.head.appendChild(script);
    }
    return () => {
      document.head.querySelectorAll('script[data-seo="ld"]').forEach((node) => node.remove());
      upsertMeta('name', 'robots', undefined);
    };
  }, [title, description, path, image, type, ldText, noindex]);
}

/* ------------------------------------------------------------ JSON-LD */

export function organizationLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: siteUrl(),
    logo: absoluteUrl('/icon-512.png'),
    email: 'adoptafacil.oficial@gmail.com',
    areaServed: { '@type': 'Country', name: 'Colombia' },
  };
}

export function websiteLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl(),
    inLanguage: 'es-CO',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${absoluteUrl('/adoptar')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListLd(items: { name: string; path: string; image?: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

export function faqLd(faq: { q: string; a: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function articleLd(article: {
  title: string;
  description: string;
  path: string;
  updated: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    inLanguage: 'es-CO',
    dateModified: article.updated,
    mainEntityOfPage: absoluteUrl(article.path),
    author: { '@type': 'Organization', name: SITE_NAME, url: siteUrl() },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: siteUrl() },
  };
}
