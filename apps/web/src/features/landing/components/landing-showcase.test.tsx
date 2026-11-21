import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NEW_ORG_TRIAL_DAYS, PORTAL_TEMPLATES } from '@adoptafacil/contracts';
import { DEMO_TEMPLATE_IDS } from '../../portals/templates/demo/demo-templates';
import { CoffeeSection, TemplateGallerySection } from './landing-showcase';

describe('Galería de plantillas de la landing', () => {
  it('separa gratuitas y Pro, sin repetir ninguna ni anunciar "Próximamente"', () => {
    render(
      <MemoryRouter>
        <TemplateGallerySection />
      </MemoryRouter>,
    );
    const free = screen.getByRole('list', { name: 'Plantillas gratuitas' });
    const pro = screen.getByRole('list', { name: 'Plantillas Pro' });
    // Las Pro con vista de ejemplo.
    const paid = PORTAL_TEMPLATES.filter(
      (t) => t.tier === 'paid' && DEMO_TEMPLATE_IDS.includes(t.id),
    );
    expect(paid.length).toBeGreaterThan(0);

    expect(within(pro).getAllByRole('listitem')).toHaveLength(paid.length);
    for (const template of paid) {
      expect(within(free).queryByText(template.name)).not.toBeInTheDocument();
      expect(within(pro).getByText(template.name)).toBeInTheDocument();
      // Cada Pro lleva a su vista de ejemplo, desde donde se registra con ella.
      expect(within(pro).getByRole('link', { name: new RegExp(template.name) })).toHaveAttribute(
        'href',
        `/plantillas/${template.id}`,
      );
    }
    expect(screen.queryByText(/Próximamente/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('landing-pro-templates')).toHaveTextContent(
      `gratis durante tus primeros ${NEW_ORG_TRIAL_DAYS} días`,
    );
  });
});

describe('Café de la landing', () => {
  it('lleva a comprar en línea (/cafe), no solo a ver campañas', () => {
    render(
      <MemoryRouter>
        <CoffeeSection />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('landing-coffee-buy')).toHaveAttribute('href', '/cafe');
    expect(screen.getByRole('link', { name: 'Ver campañas que apoyamos' })).toHaveAttribute(
      'href',
      '/campanas',
    );
  });
});
