import data from './guides.json';

export interface GuideLink {
  label: string;
  to: string;
}

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  links?: GuideLink[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  species: 'dog' | 'cat';
  /** Fecha de la última revisión del contenido (YYYY-MM-DD). */
  updated: string;
  intro: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  links?: GuideLink[];
}

/** Guías públicas de adopción. Viven en JSON para que el prerender las lea igual. */
export const GUIDES = data as Guide[];

export function guidePath(slug: string): string {
  return `/guias/${slug}`;
}

export function findGuide(slug: string | undefined): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
